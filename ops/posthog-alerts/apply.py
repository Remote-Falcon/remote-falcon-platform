#!/usr/bin/env python3
"""Reconcile PostHog log-based alerts against ops/posthog-alerts/alerts.yml.

Idempotent: GET existing alerts, diff against the YAML, then create/patch
each one to converge. Use --apply to actually mutate; default is dry-run.

Auth: POSTHOG_API_KEY env var (Personal API Key with the `log_alert:read`,
`log_alert:write` scopes — create at /settings/user-api-keys).

Destination: Discord webhook URL read from the env var named by
`discord_webhook_env:` in alerts.yml (default DISCORD_ALERTS_WEBHOOK).

Source the env from ops/.env.dev before running:
    set -a; source ops/.env.dev; set +a
    python3 ops/posthog-alerts/apply.py --apply

This script depends on PyYAML. If missing: `pip3 install --user pyyaml`.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    sys.exit("ERROR: PyYAML missing. Install with: pip3 install --user pyyaml")


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ALERTS_FILE = Path(__file__).resolve().parent / "alerts.yml"


# ---------------------------------------------------------------- HTTP helpers


class HttpError(Exception):
    def __init__(self, status: int, reason: str, body: str):
        super().__init__(f"{status} {reason}: {body}")
        self.status = status
        self.reason = reason
        self.body = body


def _request(
    method: str,
    url: str,
    *,
    token: str,
    body: dict | None = None,
    raise_on_error: bool = True,
) -> dict | list | None:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "rf-posthog-alerts-apply/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        err = HttpError(e.code, e.reason, detail)
        if raise_on_error:
            sys.exit(
                f"ERROR: {method} {url} -> {e.code} {e.reason}\n"
                f"Response body:\n{detail}"
            )
        raise err


def list_alerts(host: str, project_id: int, token: str) -> list[dict]:
    out: list[dict] = []
    url = f"{host}/api/projects/{project_id}/logs/alerts/?limit=100"
    while url:
        page = _request("GET", url, token=token)
        if not isinstance(page, dict):
            break
        out.extend(page.get("results", []))
        url = page.get("next")
    return out


def list_destinations(
    host: str, project_id: int, alert_id: str, token: str
) -> list[dict] | None:
    """Returns the destinations list, or None if the API denies us read access.

    Personal API Keys may be locked out of destinations entirely. Returning
    None lets the caller treat it as "destination state unknown" (and not
    falsely report drift on every run).
    """
    url = f"{host}/api/projects/{project_id}/logs/alerts/{alert_id}/destinations/"
    try:
        resp = _request("GET", url, token=token, raise_on_error=False)
    except HttpError as e:
        if e.status in (401, 403):
            return None
        raise
    if isinstance(resp, dict):
        return resp.get("results", [])
    if isinstance(resp, list):
        return resp
    return []


def create_alert(
    host: str, project_id: int, token: str, payload: dict
) -> dict:
    url = f"{host}/api/projects/{project_id}/logs/alerts/"
    resp = _request("POST", url, token=token, body=payload)
    assert isinstance(resp, dict)
    return resp


def patch_alert(
    host: str, project_id: int, alert_id: str, token: str, payload: dict
) -> dict:
    url = f"{host}/api/projects/{project_id}/logs/alerts/{alert_id}/"
    resp = _request("PATCH", url, token=token, body=payload)
    assert isinstance(resp, dict)
    return resp


def create_destination(
    host: str, project_id: int, alert_id: str, token: str, webhook_url: str
) -> dict | None:
    """Attempt to attach a webhook destination via the REST API.

    PostHog blocks Personal API Keys from creating destinations
    ("This action does not support personal API key access"), so this can
    fail with HTTP 403 even when alert create/update worked. Caller
    handles HttpError by printing a manual-attach hint.
    """
    url = f"{host}/api/projects/{project_id}/logs/alerts/{alert_id}/destinations/"
    resp = _request(
        "POST",
        url,
        token=token,
        body={"type": "webhook", "webhook_url": webhook_url},
        raise_on_error=False,
    )
    assert isinstance(resp, dict)
    return resp


# ---------------------------------------------------------------- YAML → API


def _yaml_to_filters(yaml_filters: dict) -> dict:
    """Translate alerts.yml filters block to the API filters shape."""
    out: dict[str, Any] = {
        "serviceNames": yaml_filters.get("service_names") or None,
        "severityLevels": yaml_filters.get("severity_levels") or None,
        "filterGroup": None,
    }
    msg = yaml_filters.get("message_contains")
    if msg:
        out["filterGroup"] = {
            "type": "AND",
            "values": [
                {
                    "type": "AND",
                    "values": [
                        {
                            "key": "message",
                            "label": None,
                            "operator": "icontains",
                            "type": "log",
                            "value": msg,
                        }
                    ],
                }
            ],
        }
    return out


def _yaml_to_payload(alert: dict) -> dict:
    threshold = alert.get("threshold", {})
    return {
        "name": alert["name"],
        "enabled": alert.get("enabled", True),
        "filters": _yaml_to_filters(alert.get("filters", {})),
        "threshold_count": threshold.get("count", 100),
        "threshold_operator": threshold.get("operator", "above"),
        "window_minutes": threshold.get("window_minutes", 5),
        "evaluation_periods": alert.get("evaluation_periods", 1),
        "datapoints_to_alarm": alert.get("datapoints_to_alarm", 1),
        "cooldown_minutes": alert.get("cooldown_minutes", 0),
    }


# ---------------------------------------------------------------- diff logic


def _alert_drift(remote: dict, desired: dict) -> list[str]:
    """Return human-readable list of fields that differ."""
    drift: list[str] = []
    for k, v in desired.items():
        if remote.get(k) != v:
            drift.append(f"{k}: {remote.get(k)!r} -> {v!r}")
    return drift


# ---------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually mutate PostHog. Default is dry-run.",
    )
    parser.add_argument(
        "--alerts-file",
        type=Path,
        default=ALERTS_FILE,
        help=f"Path to alerts.yml (default: {ALERTS_FILE.relative_to(REPO_ROOT)})",
    )
    args = parser.parse_args()

    if not args.alerts_file.exists():
        sys.exit(f"ERROR: alerts file not found: {args.alerts_file}")

    config = yaml.safe_load(args.alerts_file.read_text())
    project_id = config["project_id"]
    host = config.get("posthog_host", "https://us.posthog.com").rstrip("/")
    webhook_env = config.get("discord_webhook_env", "DISCORD_ALERTS_WEBHOOK")

    token = os.environ.get("POSTHOG_API_KEY") or os.environ.get("POSTHOG_API_TOKEN")
    if not token:
        sys.exit(
            "ERROR: POSTHOG_API_KEY env var missing. Create a Personal API Key "
            "at /settings/user-api-keys with log_alert:read + log_alert:write scopes."
        )

    webhook_url = os.environ.get(webhook_env)
    if not webhook_url:
        sys.exit(f"ERROR: {webhook_env} env var missing (referenced from alerts.yml).")

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== PostHog alerts reconcile ({mode}) ===")
    print(f"project_id={project_id} host={host}")
    print()

    remote_alerts = list_alerts(host, project_id, token)
    remote_by_name = {a["name"]: a for a in remote_alerts}
    desired_names: set[str] = set()
    # (alert_name, alert_id) pairs that need manual Discord webhook attach
    # because PostHog blocks destination creation via Personal API Key.
    pending_destinations: list[tuple[str, str]] = []

    for alert_cfg in config.get("alerts", []):
        name = alert_cfg["name"]
        desired_names.add(name)
        desired = _yaml_to_payload(alert_cfg)
        remote = remote_by_name.get(name)

        if remote is None:
            print(f"[CREATE] {name}")
            print(f"         filters: {desired['filters']}")
            print(
                f"         threshold: {desired['threshold_count']} "
                f"{desired['threshold_operator']} in {desired['window_minutes']}m, "
                f"cooldown {desired['cooldown_minutes']}m"
            )
            if args.apply:
                created = create_alert(host, project_id, token, desired)
                alert_id = created["id"]
                try:
                    create_destination(host, project_id, alert_id, token, webhook_url)
                    print(f"         -> created id={alert_id}, destination attached")
                except HttpError as e:
                    print(f"         -> created id={alert_id}")
                    print(f"         !! destination attach failed: {e.status} {e.reason}")
                    pending_destinations.append((name, alert_id))
        else:
            drift = _alert_drift(remote, desired)
            existing_dests = list_destinations(host, project_id, remote["id"], token)
            if existing_dests is None:
                # Read denied; we can't tell — don't claim drift on destination.
                needs_dest = False
            else:
                needs_dest = not any(
                    d.get("type") == "webhook" and d.get("webhook_url") == webhook_url
                    for d in existing_dests
                )
            if drift or needs_dest:
                print(f"[UPDATE] {name}")
                for line in drift:
                    print(f"         {line}")
                if needs_dest:
                    print("         destination: webhook url missing or stale")
                if args.apply:
                    if drift:
                        patch_alert(host, project_id, remote["id"], token, desired)
                    if needs_dest:
                        try:
                            create_destination(
                                host, project_id, remote["id"], token, webhook_url
                            )
                        except HttpError as e:
                            print(f"         !! destination attach failed: {e.status} {e.reason}")
                            pending_destinations.append((name, remote["id"]))
                    print("         -> updated")
            else:
                print(f"[OK]     {name}")

    # Surface alerts that exist remotely but not in alerts.yml (don't auto-prune;
    # operator decides explicitly).
    drift_remote_only = [
        a["name"] for a in remote_alerts if a["name"] not in desired_names
    ]
    if drift_remote_only:
        print()
        print("[REMOTE-ONLY] Alerts in PostHog not in alerts.yml (no action taken):")
        for name in drift_remote_only:
            print(f"         {name}")
        print(
            "         Remove manually via PostHog UI or add a `--prune` mode later."
        )

    if pending_destinations:
        print()
        print(
            "!! The following alerts were created/updated but their Discord webhook"
        )
        print(
            "   destination could NOT be attached via REST (PostHog blocks Personal"
        )
        print(
            "   API Keys from creating destinations). Attach manually OR re-run via"
        )
        print(
            "   the PostHog MCP / UI to wire them up. Then re-run apply.sh and the"
        )
        print("   destination state will be in sync.")
        for name, alert_id in pending_destinations:
            print(f"     - {name}  (id={alert_id})")

    print()
    if not args.apply:
        print("Dry-run complete. Re-run with --apply to make changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
