#!/usr/bin/env python3
"""Post-deploy error-rate check.

Compares post-deploy error rate (default last 10 minutes) against
baseline (last 24h normalized to the watch window) for one service.
Exits non-zero on breach so the deploy.yml step that calls this also
fails, triggering the existing kubectl rollout-undo path.

Stdlib only — no PyYAML, no requests. Designed to run on GitHub's
hosted ubuntu-latest runners without setup.

Usage:
    check.py --service <name> [--watch-minutes 10] [--multiplier 3]

Exit codes:
    0 — post-deploy error rate within tolerance, OR baseline too low
        to make a confident decision (no rollback)
    1 — breach (post > multiplier x normalized baseline), rollback expected
    2 — invocation/auth error

Env vars:
    POSTHOG_API_KEY            Personal API Key with logs:read scope
    POSTHOG_PROJECT_ID         (optional) override the default project
    POSTHOG_HOST               (optional, default https://us.posthog.com)
    DISCORD_ALERTS_WEBHOOK     (optional) post outcome to Discord
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_HOST = "https://us.posthog.com"
DEFAULT_PROJECT_ID = 425428


def _request(method: str, url: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "rf-release-validation/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        print(f"ERROR: {method} {url} -> {e.code} {e.reason}", file=sys.stderr)
        print(f"Response body:\n{detail}", file=sys.stderr)
        raise


def logs_count(host: str, project_id: int, token: str, service: str, date_from: str) -> int:
    """Return count of error/fatal logs for `service` in the time range."""
    url = f"{host}/api/projects/{project_id}/logs/count/"
    body = {
        "query": {
            "serviceNames": [f"remote-falcon-{service}"],
            "severityLevels": ["error", "fatal"],
            "filterGroup": [
                {
                    "key": "deployment.environment",
                    "type": "log_resource_attribute",
                    "operator": "exact",
                    "value": "prod",
                }
            ],
            "dateRange": {"date_from": date_from},
        }
    }
    resp = _request("POST", url, token, body)
    return int(resp.get("count", 0))


def post_discord(webhook: str, title: str, desc: str, color: int) -> None:
    payload = json.dumps(
        {"embeds": [{"title": title, "description": desc, "color": color}]}
    ).encode()
    req = urllib.request.Request(
        webhook,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "rf-release-validation/1.0",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        print(f"WARN: Discord POST failed: {e}", file=sys.stderr)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--service",
        required=True,
        help="Service name (without `remote-falcon-` prefix) — e.g., viewer, plugins-api",
    )
    p.add_argument("--watch-minutes", type=int, default=10)
    p.add_argument(
        "--multiplier",
        type=float,
        default=3.0,
        help="Trigger rollback when post-deploy errors > multiplier x normalized baseline",
    )
    args = p.parse_args()

    token = os.environ.get("POSTHOG_API_KEY")
    if not token:
        print("ERROR: POSTHOG_API_KEY env var missing", file=sys.stderr)
        return 2

    host = os.environ.get("POSTHOG_HOST", DEFAULT_HOST).rstrip("/")
    project_id = int(os.environ.get("POSTHOG_PROJECT_ID", DEFAULT_PROJECT_ID))
    webhook = os.environ.get("DISCORD_ALERTS_WEBHOOK", "")

    service = args.service
    watch_m = args.watch_minutes
    multiplier = args.multiplier

    try:
        post_count = logs_count(host, project_id, token, service, f"-{watch_m}m")
        baseline_24h = logs_count(host, project_id, token, service, "-24h")
    except urllib.error.HTTPError:
        return 2

    baseline_window = (baseline_24h / (24 * 60)) * watch_m

    print(
        f"service=remote-falcon-{service} "
        f"post_window={post_count} errors in last {watch_m}m | "
        f"baseline_24h={baseline_24h} | normalized_baseline={baseline_window:.2f}"
    )

    if baseline_window < 1:
        msg = (
            f"baseline too low ({baseline_window:.2f} errors expected in {watch_m}m); "
            f"skipping rollback decision"
        )
        print(f"::notice::{msg}")
        if webhook:
            post_discord(
                webhook,
                f"[deploy-check] {service} — insufficient baseline",
                f"Post-deploy {watch_m}m window: **{post_count}** errors\n"
                f"Baseline (24h, normalized): **{baseline_window:.2f}**\n"
                f"No rollback decision made.",
                3447003,  # blue / info
            )
        return 0

    threshold = baseline_window * multiplier
    if post_count > threshold:
        msg = (
            f"BREACH: {post_count} errors in last {watch_m}m > "
            f"threshold {threshold:.2f} ({multiplier}x baseline {baseline_window:.2f})"
        )
        print(f"::error::{msg}")
        if webhook:
            post_discord(
                webhook,
                f"[deploy-check] {service} — ERROR RATE BREACH, rollback triggered",
                f"Post-deploy {watch_m}m window: **{post_count}** errors\n"
                f"Baseline (24h, normalized): **{baseline_window:.2f}**\n"
                f"Threshold ({multiplier}x): **{threshold:.2f}**\n"
                f"\nNext: `kubectl rollout undo` runs automatically. Investigate with the runbook.",
                15158332,  # red
            )
        return 1

    msg = (
        f"OK: {post_count} errors in last {watch_m}m <= threshold {threshold:.2f} "
        f"({multiplier}x baseline {baseline_window:.2f})"
    )
    print(f"::notice::{msg}")
    if webhook:
        post_discord(
            webhook,
            f"[deploy-check] {service} — post-deploy OK",
            f"Post-deploy {watch_m}m window: **{post_count}** errors\n"
            f"Baseline (24h, normalized): **{baseline_window:.2f}**\n"
            f"Threshold ({multiplier}x): **{threshold:.2f}**",
            5763719,  # green
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
