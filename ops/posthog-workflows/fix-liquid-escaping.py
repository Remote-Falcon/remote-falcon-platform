#!/usr/bin/env python3
"""Append `| raw` to every Liquid output in email subject and plain-text bodies.

PostHog's CDP Liquid renderer runs with liquidjs `outputEscape: 'escape'`, so
every `{{ ... }}` output is HTML-escaped. That is right for the HTML body and
wrong everywhere else: a show called "Matt's Show" arrives as a subject line
reading `Matt&#39;s Show`, and an unsubscribe URL in the plain-text part gets
its `&` separators turned into `&amp;`. Apostrophes and ampersands are common
in show names, so this is a high-frequency defect, not an edge case.

`| raw` opts a single output out of that escaping. Verified against liquidjs
directly: under `outputEscape: 'escape'` it restores the literal value, and
under the default config it is a harmless no-op — so applying it is safe
whether or not PostHog changes that setting later.

SUBJECT AND TEXT ONLY, NEVER HTML. Show names are user-supplied, so escaping
in the HTML body is a deliberate injection defence. This script does not touch
`html` and must not be extended to.

Idempotent: an output that already ends in `| raw` is left alone, so this can
be re-run after any edit in the PostHog template editor (which will happily
reintroduce un-raw'd merge tags from the dropdown).

Auth: POSTHOG_API_KEY env var (Personal API Key with `hog_flow:read` and
`hog_flow:write`).

Run via ./ops/posthog-workflows/apply.sh --script fix-liquid-escaping [--apply]
or directly with the venv python.
"""
from __future__ import annotations

import argparse
import json
import os
import re
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

# Fields to rewrite. `html` is deliberately absent — see the module docstring.
TARGET_FIELDS = ("subject", "text")

OUTPUT_RE = re.compile(r"\{\{(.+?)\}\}", re.DOTALL)
ALREADY_RAW_RE = re.compile(r"\|\s*raw\s*$")


def _request(method: str, url: str, token: str, body: dict | None = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "rf-posthog-workflows-rawfix/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(f"ERROR: {method} {url} -> {e.code} {e.reason}\n{detail}")


def add_raw(value: str) -> tuple[str, int]:
    """Return (rewritten, count_of_outputs_changed)."""
    changed = 0

    def repl(m: re.Match[str]) -> str:
        nonlocal changed
        inner = m.group(1).strip()
        if ALREADY_RAW_RE.search(inner):
            return m.group(0)
        changed += 1
        return "{{ " + inner + " | raw }}"

    return OUTPUT_RE.sub(repl, value), changed


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="Write. Default is a dry run.")
    ap.add_argument("--drip-file", type=Path, default=DRIP_FILE)
    args = ap.parse_args()

    cfg = yaml.safe_load(args.drip_file.read_text())
    project_id = cfg["project_id"]
    host = cfg.get("posthog_host", "https://us.posthog.com").rstrip("/")

    token = os.environ.get("POSTHOG_API_KEY")
    if not token:
        sys.exit("ERROR: POSTHOG_API_KEY env var missing.")

    targets = [(n["template_id"], n.get("template_name", n["template_id"])) for n in cfg["nodes"]]
    for extra in cfg.get("standalone_templates", []):
        targets.append((extra["template_id"], extra.get("template_name", extra["template_id"])))

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== Liquid raw-filter fix for subject/text ({mode}) ===")
    print(f"project_id={project_id} host={host}")
    print()

    total = 0
    for template_id, label in targets:
        url = f"{host}/api/projects/{project_id}/messaging_templates/{template_id}/"
        tpl = _request("GET", url, token)
        email = (tpl.get("content") or {}).get("email") or {}

        edits: dict[str, str] = {}
        per_field: list[str] = []
        for field in TARGET_FIELDS:
            original = email.get(field)
            if not original:
                continue
            rewritten, n = add_raw(original)
            if n:
                edits[field] = rewritten
                per_field.append(f"{field} ({n})")

        if not edits:
            print(f"[NOOP]   {label}")
            continue

        print(f"[UPDATE] {label}")
        print(f"         outputs rewritten: {', '.join(per_field)}")
        if "subject" in edits:
            print(f"         subject: {edits['subject']}")
        total += 1

        if args.apply:
            email.update(edits)
            tpl["content"]["email"] = email
            _request("PATCH", url, token, {"content": tpl["content"]})

    print()
    if not total:
        print("Nothing to do — every subject/text output already has `| raw`.")
    elif args.apply:
        print(f"APPLIED: {total} template(s) updated.")
        print("Now re-run wire-drip-templates.py to push subject/text into the flow nodes.")
    else:
        print(f"DRY-RUN: {total} template(s) would be updated. Re-run with --apply.")


if __name__ == "__main__":
    main()
