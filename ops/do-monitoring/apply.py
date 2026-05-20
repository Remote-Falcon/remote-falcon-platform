#!/usr/bin/env python3
"""Reconcile DigitalOcean Monitoring alert policies against alerts.yml.

Uses the DO REST API directly. Auth via DIGITALOCEAN_ACCESS_TOKEN env var
(same token doctl uses). Idempotent: GET existing, diff against the YAML,
POST/PUT to converge. Use --apply to mutate; default is dry-run.

Discord routing: the URL named by `discord_webhook_env:` in alerts.yml is
appended with `/slack` and passed as the slack URL. Discord exposes a
Slack-compatible endpoint at that path, so DO's slack-format payload
lands as a Discord message without any relay.

Source env from ops/.env.dev before running:
    set -a; source ops/.env.dev; set +a
    ./ops/do-monitoring/apply.py --apply
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
    sys.exit("ERROR: PyYAML missing. Run via ops/do-monitoring/apply.sh.")


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ALERTS_FILE = Path(__file__).resolve().parent / "alerts.yml"
DO_API = "https://api.digitalocean.com/v2"


def _request(
    method: str, url: str, *, token: str, body: dict | None = None
) -> dict | list | None:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "rf-do-monitoring-apply/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(
            f"ERROR: {method} {url} -> {e.code} {e.reason}\n"
            f"Response body:\n{detail}"
        )


def list_alerts(token: str) -> list[dict]:
    url = f"{DO_API}/monitoring/alerts?per_page=200"
    resp = _request("GET", url, token=token)
    assert isinstance(resp, dict)
    return resp.get("policies", [])


def create_alert(token: str, payload: dict) -> dict:
    resp = _request("POST", f"{DO_API}/monitoring/alerts", token=token, body=payload)
    assert isinstance(resp, dict)
    return resp.get("policy", resp)


def update_alert(token: str, uuid: str, payload: dict) -> dict:
    resp = _request(
        "PUT", f"{DO_API}/monitoring/alerts/{uuid}", token=token, body=payload
    )
    assert isinstance(resp, dict)
    return resp.get("policy", resp)


def _yaml_to_payload(alert: dict, slack_url: str, doks_tag: str) -> dict:
    target = alert.get("target", "doks_nodes")
    if target != "doks_nodes":
        sys.exit(f"Unknown target type: {target!r} (only 'doks_nodes' supported)")
    return {
        "alerts": {
            "email": [],
            "slack": [{"channel": "alerts", "url": slack_url}],
        },
        "compare": alert["compare"],
        "description": alert["description"],
        "enabled": alert.get("enabled", True),
        "entities": [],
        "tags": [doks_tag],
        "type": alert["type"],
        "value": alert["value"],
        "window": alert["window"],
    }


def _alert_drift(remote: dict, desired: dict) -> list[str]:
    drift: list[str] = []
    # Fields that should match exactly
    for k in ("compare", "enabled", "type", "value", "window"):
        if remote.get(k) != desired.get(k):
            drift.append(f"{k}: {remote.get(k)!r} -> {desired.get(k)!r}")
    # Tags as set comparison
    if sorted(remote.get("tags") or []) != sorted(desired.get("tags") or []):
        drift.append(f"tags: {remote.get('tags')} -> {desired.get('tags')}")
    # Slack destination URL
    remote_slacks = remote.get("alerts", {}).get("slack") or []
    desired_slacks = desired.get("alerts", {}).get("slack") or []
    if [s.get("url") for s in remote_slacks] != [s.get("url") for s in desired_slacks]:
        drift.append("slack destination url differs")
    return drift


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Mutate DO state.")
    parser.add_argument("--alerts-file", type=Path, default=ALERTS_FILE)
    args = parser.parse_args()

    config = yaml.safe_load(args.alerts_file.read_text())
    doks_tag = config["doks_node_tag"]
    webhook_env = config.get("discord_webhook_env", "DISCORD_ALERTS_WEBHOOK")

    token = os.environ.get("DIGITALOCEAN_ACCESS_TOKEN")
    if not token:
        sys.exit("ERROR: DIGITALOCEAN_ACCESS_TOKEN env var missing.")

    webhook_url = os.environ.get(webhook_env)
    if not webhook_url:
        sys.exit(f"ERROR: {webhook_env} env var missing.")

    # /slack suffix turns the Discord webhook into a Slack-format endpoint
    # that DO Monitoring's slack destinations can POST to.
    slack_url = webhook_url.rstrip("/") + "/slack"

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== DO Monitoring reconcile ({mode}) ===")
    print(f"doks_node_tag={doks_tag}")
    print()

    remote_alerts = list_alerts(token)
    remote_by_desc = {a["description"]: a for a in remote_alerts}
    desired_descs: set[str] = set()

    for alert_cfg in config.get("alerts", []):
        desc = alert_cfg["description"]
        desired_descs.add(desc)
        desired = _yaml_to_payload(alert_cfg, slack_url, doks_tag)
        remote = remote_by_desc.get(desc)

        if remote is None:
            print(f"[CREATE] {desc}")
            print(
                f"         {desired['type']}  {desired['compare']} {desired['value']} "
                f"window={desired['window']}  tag={doks_tag}"
            )
            if args.apply:
                created = create_alert(token, desired)
                print(f"         -> created uuid={created.get('uuid')}")
        else:
            drift = _alert_drift(remote, desired)
            if drift:
                print(f"[UPDATE] {desc}")
                for line in drift:
                    print(f"         {line}")
                if args.apply:
                    update_alert(token, remote["uuid"], desired)
                    print("         -> updated")
            else:
                print(f"[OK]     {desc}")

    drift_remote_only = [
        a["description"]
        for a in remote_alerts
        if a["description"] not in desired_descs
        and a["description"].startswith("rf-")
    ]
    if drift_remote_only:
        print()
        print("[REMOTE-ONLY] rf-* alerts in DO not in alerts.yml (no action taken):")
        for d in drift_remote_only:
            print(f"         {d}")

    print()
    if not args.apply:
        print("Dry-run complete. Re-run with --apply to make changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
