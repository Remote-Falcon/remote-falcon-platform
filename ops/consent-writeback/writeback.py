#!/usr/bin/env python3
"""Write PostHog unsubscribes back onto Show.marketingOptIn in Mongo.

The preseason broadcast exposed a one-way street. Consent flows OUT of
Mongo into PostHog (ops/preseason-backfill pushes marketingOptIn onto the
person, and the UI re-pushes it at every sign-in), but nothing flows back.
So when an operator clicks unsubscribe in an email, PostHog records it and
suppresses future sends, while `Show.marketingOptIn` in our own database
still reads `true`.

That is fine right up until the audience is rebuilt from Mongo. The
backfill treats `marketingOptIn: null` as "never asked" and stamps it
true — and an unsubscribed show whose Mongo flag was never corrected is
indistinguishable from one that was never asked. The next campaign would
re-stamp it, re-push it to PostHog, and mail someone who explicitly opted
out. PostHog's own suppression list is the only thing standing in the way,
and it is not a control we own.

This closes the loop, in both places the backfill writes:

  1. Mongo   — set marketingOptIn=false on every show whose email appears
               on the opt-out list. False is the value the backfill's own
               eligibility query already excludes ("$ne": False), so one
               corrected record stays corrected through every later run.
  2. PostHog — push marketingOptIn=false onto the person keyed by
               showSubdomain, so the drip's trigger filter
               (person.marketingOptIn = true) stops enrolling them.
               Without this they keep enrolling and keep getting
               suppressed at send time: invisible failed runs rather than
               a clean exclusion.

Two lists, not one. PostHog keeps unsubscribes (a consent decision by the
recipient) separately from suppressions (hard bounces it adds itself to
protect the sending domain). Only the first is consent, so only the first
writes to marketingOptIn by default. Bounces are reported every run, and
--apply-bounces opts into treating them the same way, which is worth doing
before a campaign but is a deliverability call rather than a consent one.

Dry run by default: prints what it matched and would change, writes nothing.

    POSTHOG_API_KEY=phx_... MONGO_URI=... python3 writeback.py
    ... python3 writeback.py --apply-mongo
    ... python3 writeback.py --apply-mongo --apply-posthog
    ... python3 writeback.py --apply-mongo --apply-posthog --apply-bounces

Run it in-cluster (ops/consent-writeback/job.yml) — prod Mongo is DO
Managed and VPC-restricted, so a laptop cannot reach it.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    from pymongo import MongoClient, UpdateOne
except ImportError:
    sys.exit("ERROR: pymongo missing (pip install pymongo).")

PROJECT_ID = "425428"
DEFAULT_API_HOST = "https://us.posthog.com"

# The project's PUBLIC ingest key — same value the UI bakes in as
# VITE_PUBLIC_POSTHOG_KEY. Capture with $set needs no private key. The
# personal API key below is a different credential and IS a secret.
DEFAULT_TOKEN = "phc_qizGRYM8eh3jBMr3Wbd4EVPi6RS3wSZSSBvvToPn6PGz"
DEFAULT_INGEST_HOST = "https://us.i.posthog.com"

BATCH_SIZE = 500


class Forbidden(Exception):
    """A 403 carrying PostHog's own explanation of what scope is missing."""


def get_paginated(host: str, api_key: str, path: str) -> list[dict]:
    """Walk a DRF-paginated PostHog endpoint to the end.

    Reading the list endpoint rather than the $workflows_email_unsubscribed
    event stream is deliberate: the list is current state and survives
    event retention, so a show that unsubscribed last season is still
    corrected by a run made today.

    A 403 raises Forbidden with PostHog's own `detail` rather than a
    guess. The two endpoints this script reads want DIFFERENT scopes —
    opt_outs needs hog_flow:read, suppressions needs person:read — so
    assuming one scope for every 403 sends you chasing the wrong fix.
    """
    url = f"{host}/api/projects/{PROJECT_ID}/{path}"
    out: list[dict] = []
    while url:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "User-Agent": "rf-consent-writeback/1.0",
            },
        )
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    payload = json.loads(r.read().decode())
                break
            except urllib.error.HTTPError as e:
                if e.code == 403:
                    body = e.read().decode(errors="replace")
                    try:
                        detail = json.loads(body).get("detail") or body
                    except ValueError:
                        detail = body
                    raise Forbidden(f"{path}: {detail}")
                if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                sys.exit(f"ERROR: GET {url} -> {e.code}\n{e.read().decode(errors='replace')}")
            except urllib.error.URLError as e:
                if attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                sys.exit(f"ERROR: {url} unreachable: {e}")
        out.extend(payload.get("results") or [])
        url = payload.get("next")
    return out


def opted_out_emails(host: str, api_key: str) -> set[str]:
    """Addresses that asked to stop hearing from us.

    An entry can carry per-category preferences; anything not OPTED_OUT
    (a category-level opt-out while marketing stays on) is left alone, so
    a future per-category setup does not silently revoke everything.
    """
    emails: set[str] = set()
    for row in get_paginated(host, api_key, "messaging_preferences/opt_outs/"):
        identifier = (row.get("identifier") or "").strip().lower()
        if not identifier:
            continue
        prefs = row.get("preferences") or {}
        if any(str(v).upper() == "OPTED_OUT" for v in prefs.values()):
            emails.add(identifier)
    return emails


def suppressed_emails(host: str, api_key: str) -> set[str] | None:
    """Addresses PostHog stopped mailing because they hard-bounced.

    Returns None when the key cannot read them. This endpoint needs
    `person:read`, which the unsubscribe path does not, so a key scoped
    only for consent work still does the job it was pointed at — the
    bounce report degrades to a warning instead of failing the run.
    """
    emails: set[str] = set()
    try:
        rows = get_paginated(host, api_key, "messaging_suppressions/suppressions/")
    except Forbidden as e:
        print(f"WARN: bounce list unavailable ({e}). Unsubscribes are unaffected.",
              file=sys.stderr)
        return None
    for row in rows:
        if not row.get("suppressed", True):
            continue
        identifier = (row.get("identifier") or "").strip().lower()
        if identifier:
            emails.add(identifier)
    return emails


def post_batch(host: str, token: str, events: list[dict]) -> None:
    body = json.dumps({"api_key": token, "batch": events}).encode()
    req = urllib.request.Request(
        f"{host}/batch/",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "rf-consent-writeback/1.0"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                r.read()
                return
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            sys.exit(f"ERROR: PostHog /batch/ -> {e.code}\n{e.read().decode(errors='replace')}")
        except urllib.error.URLError as e:
            if attempt < 4:
                time.sleep(2 ** attempt)
                continue
            sys.exit(f"ERROR: PostHog /batch/ unreachable: {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply-mongo", action="store_true", help="write Show.marketingOptIn=false")
    ap.add_argument("--apply-posthog", action="store_true", help="push marketingOptIn=false onto the person")
    ap.add_argument("--apply-bounces", action="store_true",
                    help="treat hard bounces like unsubscribes (default: report only)")
    args = ap.parse_args()

    api_key = os.environ.get("POSTHOG_API_KEY")
    if not api_key:
        sys.exit("ERROR: POSTHOG_API_KEY is not set (personal API key, needs hog_flow:read).")
    uri = os.environ.get("MONGO_URI")
    if not uri:
        sys.exit("ERROR: MONGO_URI is not set.")
    api_host = os.environ.get("POSTHOG_API_HOST", DEFAULT_API_HOST).rstrip("/")
    ingest_host = os.environ.get("POSTHOG_HOST", DEFAULT_INGEST_HOST).rstrip("/")
    token = os.environ.get("POSTHOG_PROJECT_TOKEN", DEFAULT_TOKEN)

    # MONGO_URI carries no database name — the services set it separately
    # (quarkus.mongodb.database=remote-falcon). Trusting the URI's default
    # lands on `admin`, where `show` is empty and reads exactly like
    # "nothing to correct".
    db_name = os.environ.get("MONGO_DB", "remote-falcon")
    client = MongoClient(uri, uuidRepresentation="javaLegacy")
    db = client[db_name]

    total = db.show.count_documents({})
    if total == 0:
        print(f"ERROR: {db_name}.show is empty. Databases visible: "
              f"{client.list_database_names()}", file=sys.stderr)
        sys.exit(1)

    try:
        unsubscribed = opted_out_emails(api_host, api_key)
    except Forbidden as e:
        sys.exit(f"ERROR: cannot read the opt-out list -- {e}\n"
                 f"       Grant the missing scope at {api_host}/settings/user-api-keys")

    bounced = suppressed_emails(api_host, api_key)
    if bounced is None:
        if args.apply_bounces:
            sys.exit("ERROR: --apply-bounces needs the bounce list, which this key "
                     "cannot read (see WARN above). Grant `person:read` or drop the flag.")
        bounced = set()
        bounce_note = "UNAVAILABLE (needs person:read)"
    else:
        # An address on both lists is a consent decision first.
        bounced -= unsubscribed
        bounce_note = "written (--apply-bounces)" if args.apply_bounces else "REPORT ONLY"

    revoke = set(unsubscribed)
    if args.apply_bounces:
        revoke |= bounced

    print(f"shows total          {total}")
    print(f"unsubscribed         {len(unsubscribed):>5}   <- consent, always written")
    print(f"hard bounced         {len(bounced):>5}   <- {bounce_note}")

    if not revoke:
        print("\nNothing to write back.")
        return

    # Email is not a key: one operator can run several shows off one
    # address, and unsubscribing revokes consent for the address, so every
    # show behind it is corrected.
    #
    # Matched in Python rather than with a Mongo query: addresses are
    # stored with whatever casing the operator typed, so an exact $in
    # misses them and a case-insensitive $regex over a growing list is
    # both slow and easy to get wrong. A few thousand projected docs is
    # nothing.
    matched = [
        s for s in db.show.find(
            {"email": {"$nin": [None, ""]}},
            {"email": 1, "showName": 1, "showSubdomain": 1, "marketingOptIn": 1},
        )
        if (s.get("email") or "").strip().lower() in revoke
    ]
    matched_emails = {(s.get("email") or "").strip().lower() for s in matched}
    orphans = revoke - matched_emails
    stale = [s for s in matched if s.get("marketingOptIn") is not False]

    print(f"matched shows        {len(matched):>5}   ({len(matched_emails)} distinct addresses)")
    print(f"  already false      {len(matched) - len(stale):>5}   <- idempotent, skipped")
    print(f"  to correct         {len(stale):>5}")
    if orphans:
        print(f"unmatched addresses  {len(orphans):>5}   <- on a PostHog list, no show in Mongo")
        for e in sorted(orphans):
            print(f"    {e}")

    for s in stale:
        print(f"    revoke  {s.get('showSubdomain'):<28} {s.get('email')}")

    if not (args.apply_mongo or args.apply_posthog):
        print("\nDRY RUN — nothing written. Re-run with --apply-mongo / --apply-posthog.")
        return

    if args.apply_mongo:
        if stale:
            res = db.show.bulk_write(
                [UpdateOne({"_id": s["_id"]}, {"$set": {"marketingOptIn": False}}) for s in stale],
                ordered=False,
            )
            print(f"mongo: modified {res.modified_count}")
        else:
            print("mongo: nothing to do")

    if args.apply_posthog:
        # Pushed for every matched show, not just the stale ones: the
        # Mongo flag and the person property drift independently, and a
        # show corrected in Mongo by an earlier run may still be enrolling
        # in the drip.
        events = [
            {
                "event": "marketing_consent_revoked",
                "distinct_id": s["showSubdomain"],
                "properties": {"$set": {"marketingOptIn": False}, "source": "consent-writeback"},
            }
            for s in matched if s.get("showSubdomain")
        ]
        sent = 0
        for i in range(0, len(events), BATCH_SIZE):
            post_batch(ingest_host, token, events[i:i + BATCH_SIZE])
            sent += len(events[i:i + BATCH_SIZE])
        print(f"posthog: {sent} persons pushed (ingest is async — recount before dispatching)")


if __name__ == "__main__":
    main()
