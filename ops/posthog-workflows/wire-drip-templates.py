#!/usr/bin/env python3
"""Copy messaging-library email templates into a workflow's email nodes.

PostHog workflow (hog_flow) email nodes carry their subject/html/text
INLINE inside config.inputs.email.value. The library template is not a
live reference — the editor's "load template" is a one-time copy. So a
template edit does nothing to what the drip sends until it is copied in
again. This script is that copy, driven by drip.yml, so it is
reproducible and reviewable instead of six manual editor steps.

Idempotent: re-running with no template changes reports NOOP for every
node and issues no write.

Auth: POSTHOG_API_KEY env var (Personal API Key with `hog_flow:read` and
`hog_flow:write` scopes — messaging_templates sits under hog_flow scopes
too).

Run via ./ops/posthog-workflows/apply.sh which handles the venv.
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
    sys.exit("ERROR: PyYAML missing. Run via ops/posthog-workflows/apply.sh.")


HERE = Path(__file__).resolve().parent
DRIP_FILE = HERE / "drip.yml"

# The email-node fields this script owns. Recipient (to), reply-to, and
# message_category_type are deliberately left alone — those are workflow
# delivery config, not template content.
CONTENT_FIELDS = ("subject", "html", "text")


def _request(method: str, url: str, token: str, body: dict | None = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "rf-posthog-workflows-wire/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        hint = ""
        if e.code == 403:
            hint = (
                "\nHINT: the Personal API Key likely lacks hog_flow:read / "
                "hog_flow:write scopes. Add them at "
                "https://us.posthog.com/settings/user-api-keys"
            )
        sys.exit(
            f"ERROR: {method} {url} -> {e.code} {e.reason}\n"
            f"Response body:\n{detail}{hint}"
        )


def get_template(host: str, project_id: int, token: str, template_id: str) -> dict:
    url = f"{host}/api/projects/{project_id}/messaging_templates/{template_id}/"
    return _request("GET", url, token)


def get_flow(host: str, project_id: int, token: str, flow_id: str) -> dict:
    url = f"{host}/api/projects/{project_id}/hog_flows/{flow_id}/"
    return _request("GET", url, token)


def patch_flow_actions(
    host: str, project_id: int, token: str, flow_id: str, actions: list[dict]
) -> dict:
    url = f"{host}/api/projects/{project_id}/hog_flows/{flow_id}/"
    return _request("PATCH", url, token, {"actions": actions})


def template_content(tpl: dict) -> dict[str, str]:
    """Pull the sendable fields out of a messaging template."""
    email = (tpl.get("content") or {}).get("email") or {}
    missing = [f for f in CONTENT_FIELDS if not email.get(f)]
    if missing:
        sys.exit(
            f"ERROR: template {tpl.get('id')} ({tpl.get('name')!r}) is missing "
            f"{', '.join(missing)}. Fix the template before wiring it — a node "
            "with an empty body would send blank email."
        )
    return {f: email[f] for f in CONTENT_FIELDS}


def node_placeholder_warning(value: dict) -> str | None:
    html = value.get("html") or ""
    if "PLACEHOLDER" in html.upper():
        return "currently a PLACEHOLDER body"
    return None


def wire_flow(
    host: str,
    project_id: int,
    token: str,
    flow_cfg: dict,
    integration_id: int | None,
    sender: dict | None,
    apply: bool,
) -> int:
    """Copy each configured template into its node on one flow."""
    flow_id = flow_cfg["flow_id"]
    print(f"flow={flow_cfg.get('flow_name')} ({flow_id})")

    flow = get_flow(host, project_id, token, flow_id)
    print(f"flow status: {flow.get('status')}  version: {flow.get('version')}")
    if flow.get("status") == "active":
        print(
            "NOTE: flow is ACTIVE — this PATCH changes what live enrollments "
            "receive. Publish semantics differ for active flows; verify in the "
            "UI after applying."
        )
    print()

    actions = flow["actions"]
    by_id = {a["id"]: a for a in actions}

    changed = 0
    for node in flow_cfg["nodes"]:
        action_id = node["action_id"]
        template_id = node["template_id"]
        label = node.get("template_name", template_id)

        action = by_id.get(action_id)
        if action is None:
            sys.exit(
                f"ERROR: action {action_id!r} not found in flow {flow_id}. "
                f"Available: {', '.join(sorted(by_id))}"
            )
        if action.get("type") != "function_email":
            sys.exit(
                f"ERROR: action {action_id!r} is type {action.get('type')!r}, "
                "not function_email — refusing to write email content to it."
            )

        value = action["config"]["inputs"]["email"]["value"]
        wanted = template_content(get_template(host, project_id, token, template_id))

        diff = [f for f in CONTENT_FIELDS if value.get(f) != wanted[f]]

        # A node authored over the API carries a `from` with name/email but
        # no integrationId, and PostHog only validates that at send time —
        # so the flow looks fine in the editor and every send fails once
        # enabled. Guarantee it here rather than trusting authoring.
        # The From identity is enforced for the same reason: PostHog
        # substitutes the integration's verified address at send time
        # rather than failing, so a node that names an unverified domain
        # looks correct everywhere except in the delivered message.
        sender_fixes = []
        node_sender = value.setdefault("from", {})
        if integration_id is not None and node_sender.get("integrationId") != integration_id:
            node_sender["integrationId"] = integration_id
            sender_fixes.append(f"integrationId = {integration_id}")
        for field in ("name", "email"):
            if sender and node_sender.get(field) != sender.get(field):
                node_sender[field] = sender[field]
                sender_fixes.append(f"{field} = {sender[field]}")

        if not diff and not sender_fixes:
            print(f"[NOOP]   {action_id:<16} already matches {label!r}")
            continue

        was = node_placeholder_warning(value)
        suffix = f" ({was})" if was else ""
        print(f"[UPDATE] {action_id:<16} <- {label!r}{suffix}")
        if diff:
            print(f"         fields: {', '.join(diff)}")
            print(f"         subject: {wanted['subject']}")
        for fix in sender_fixes:
            print(f"         sender: {fix}")
        value.update(wanted)
        changed += 1

    print()
    if not changed:
        print(f"Nothing to do on {flow_id} — every node already matches.")
    elif not apply:
        print(f"DRY-RUN: {changed} node(s) on {flow_id} would be updated.")
    else:
        patch_flow_actions(host, project_id, token, flow_id, actions)
        print(f"APPLIED: {changed} node(s) updated on flow {flow_id}.")
        print(f"  {host}/project/{project_id}/workflows/{flow_id}/workflow")
    print()
    return changed


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Write the changes. Without this the script is a dry run.",
    )
    ap.add_argument("--drip-file", type=Path, default=DRIP_FILE)
    ap.add_argument(
        "--flow",
        help="Wire only the flow with this id (default: every flow in the file).",
    )
    args = ap.parse_args()

    cfg = yaml.safe_load(args.drip_file.read_text())
    project_id = cfg["project_id"]
    host = cfg.get("posthog_host", "https://us.posthog.com").rstrip("/")
    integration_id = cfg.get("email_integration_id")
    sender = cfg.get("email_from")

    token = os.environ.get("POSTHOG_API_KEY")
    if not token:
        sys.exit("ERROR: POSTHOG_API_KEY env var missing.")

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== PostHog workflow template wiring ({mode}) ===")
    print(f"project_id={project_id} host={host}")
    print()

    # The drip is the primary flow; extra_flows carries any other flow
    # whose email nodes are template-backed — the one-off Preseason
    # broadcast, and whatever seasonal batch comes after it.
    flows = [{
        "flow_id": cfg["flow_id"],
        "flow_name": cfg.get("flow_name"),
        "nodes": cfg["nodes"],
    }] + list(cfg.get("extra_flows", []))

    if args.flow:
        flows = [f for f in flows if f["flow_id"] == args.flow]
        if not flows:
            sys.exit(f"ERROR: no flow {args.flow!r} in {args.drip_file}.")

    total = sum(
        wire_flow(host, project_id, token, f, integration_id, sender, args.apply)
        for f in flows
    )

    if not total:
        print("Nothing to do — every node already matches its template.")
    elif not args.apply:
        print(f"DRY-RUN: {total} node(s) would be updated. Re-run with --apply.")
    else:
        print(f"APPLIED: {total} node(s) updated.")
        print("Next: verify in the editor, then run a test send before enabling.")


if __name__ == "__main__":
    main()
