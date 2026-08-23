#!/usr/bin/env python3
"""Set a messaging-library template's plain-text fallback from a file.

A template's `text` is stored beside the design, not derived from it, so
editing the design — in the visual editor or over the API — leaves `text`
on the previous copy. Nothing surfaces that: the editor's preview shows
the HTML part, and only recipients whose client falls back to text (and
every spam filter that compares the two parts) ever see the drift.

This script owns that field. It GETs the template, swaps in the contents
of --text-file, and PATCHes the content back with the server's own design
JSON round-tripped verbatim, so the design and rendered HTML cannot be
disturbed by a text edit.

Keep `| raw` on every Liquid output in the text file — PostHog renders it
with liquidjs `outputEscape: 'escape'`, which turns `&` into `&amp;` and
silently breaks the unsubscribe link. See fix-liquid-escaping.py.

Auth: POSTHOG_API_KEY env var (Personal API Key with `hog_flow:read` and
`hog_flow:write` — messaging_templates sits under the hog_flow scopes).

    export POSTHOG_API_KEY=phx_...
    ./ops/posthog-workflows/apply-text.sh \
        --template-id 019f782f-a685-0000-1270-6885279e5e84 \
        --text-file ops/posthog-workflows/templates/preseason-2026.txt
    # add --apply to write
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

HOST = "https://us.posthog.com"
PROJECT_ID = 425428


def _request(method: str, url: str, token: str, body: dict | None = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "rf-posthog-workflows-text/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        if e.code == 403:
            sys.exit(
                f"ERROR: 403 from {url}\n{detail}\n\n"
                "The Personal API Key needs hog_flow:read and hog_flow:write "
                f"({HOST}/settings/user-api-keys)."
            )
        sys.exit(f"ERROR: {method} {url} -> {e.code}\n{detail}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--template-id", required=True)
    ap.add_argument("--text-file", required=True, type=Path)
    ap.add_argument("--apply", action="store_true", help="write (default: dry run)")
    args = ap.parse_args()

    token = os.environ.get("POSTHOG_API_KEY")
    if not token:
        sys.exit("ERROR: POSTHOG_API_KEY is not set.")

    # One trailing newline is an artifact of writing the body as a file;
    # the stored field has none.
    wanted = args.text_file.read_text(encoding="utf-8").rstrip("\n")

    url = f"{HOST}/api/projects/{PROJECT_ID}/messaging_templates/{args.template_id}/"
    template = _request("GET", url, token)
    content = template.get("content") or {}
    email = content.get("email")
    if not email:
        sys.exit(f"ERROR: template {args.template_id} has no email content.")

    current = email.get("text") or ""
    if current == wanted:
        print(f"NOOP  {template.get('name')} — text already matches.")
        return

    diff = difflib.unified_diff(
        current.splitlines(), wanted.splitlines(), "stored", "file", lineterm=""
    )
    print("\n".join(diff))

    if not args.apply:
        print("\nDRY-RUN: text would be replaced. Re-run with --apply.")
        return

    email["text"] = wanted
    _request("PATCH", url, token, {"content": content})
    print(f"\nUPDATED  {template.get('name')}")
    print(f"  {HOST}/project/{PROJECT_ID}/workflows/library/templates/{args.template_id}")


if __name__ == "__main__":
    main()
