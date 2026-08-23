#!/usr/bin/env python3
"""PRD-013 P0-6a — opt existing shows into marketing email, in both places.

Consent lives in Mongo (Show.marketingOptIn), but the Preseason broadcast
picks its audience from PostHog person properties, and those are only
written when an operator signs in and the UI calls identify()
(apps/ui/src/contexts/JWTContext.jsx). A Mongo-only backfill would
therefore trickle into the audience over months of logins rather than
filling it — as of 2026-08-21 the audience stood at 31 persons against
2628 shows. So this script does both halves:

  1. Mongo   — set marketingOptIn=true on eligible shows that have never
               been asked (null/missing). An explicit false is a recorded
               decline and is never touched.
  2. PostHog — push email / showName / marketingOptIn / lastLoginDate
               onto the person keyed by showSubdomain, the same
               distinct_id the UI identifies with, via a $set capture
               (the shape PostHogUtil.java already uses server-side).

It also stamps preseasonWave (1/2/3): the eligible set ordered by sign-in
recency and cut into 500 / 1000 / rest. The broadcast is dispatched one
wave at a time — mail.remotefalcon.com has essentially no sending
history, and 2600 cold addresses in one dispatch is how a domain lands in
spam for the whole season. Filtering the batch trigger on an explicit
wave number keeps the waves disjoint, where a lastLoginDate range filter
would risk overlap and a double send.

Dry run by default: prints eligibility and wave counts, writes nothing.

    MONGO_URI=... python3 backfill.py                      # counts only
    MONGO_URI=... python3 backfill.py --apply-mongo        # consent only
    MONGO_URI=... python3 backfill.py --apply-mongo --apply-posthog

Run it in-cluster (ops/preseason-backfill/job.yml) — prod Mongo is DO
Managed and VPC-restricted, so a laptop cannot reach it.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone

try:
    from pymongo import MongoClient, UpdateOne
except ImportError:
    sys.exit("ERROR: pymongo missing (pip install pymongo).")

# The project's PUBLIC ingest key — the same value the UI bakes in as
# VITE_PUBLIC_POSTHOG_KEY. Capture with $set needs no private key.
DEFAULT_TOKEN = "phc_qizGRYM8eh3jBMr3Wbd4EVPi6RS3wSZSSBvvToPn6PGz"
DEFAULT_HOST = "https://us.i.posthog.com"

# Waves are recency-ordered SIZE chunks, not date buckets: warmest
# addresses first, each dispatch roughly double the last, which is what
# warming a domain asks for. Date buckets were tried first and put 1485
# of 2615 in one middle wave (6-18 months back swallows a whole season),
# which is a blast with two small bookends rather than a ramp.
WAVE_SIZES = (500, 1000)  # wave 3 takes the remainder

BATCH_SIZE = 500


def login_sort_key(show: dict) -> datetime:
    """Newest sign-in first; no recorded sign-in sorts last (coldest)."""
    last_login = show.get("lastLoginDate")
    if not isinstance(last_login, datetime):
        return datetime.min.replace(tzinfo=timezone.utc)
    return last_login if last_login.tzinfo else last_login.replace(tzinfo=timezone.utc)


def assign_waves(shows: list[dict]) -> None:
    """Stamp _wave on each show, warmest first, in place."""
    shows.sort(key=login_sort_key, reverse=True)
    for i, show in enumerate(shows):
        if i < WAVE_SIZES[0]:
            show["_wave"] = 1
        elif i < WAVE_SIZES[0] + WAVE_SIZES[1]:
            show["_wave"] = 2
        else:
            show["_wave"] = 3


def post_batch(host: str, token: str, events: list[dict]) -> None:
    body = json.dumps({"api_key": token, "batch": events}).encode()
    req = urllib.request.Request(
        f"{host}/batch/",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "rf-preseason-backfill/1.0"},
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
    ap.add_argument("--apply-mongo", action="store_true", help="write Show.marketingOptIn")
    ap.add_argument("--apply-posthog", action="store_true", help="push person properties")
    ap.add_argument("--wave", type=int, choices=(1, 2, 3), help="limit the PostHog push to one wave")
    args = ap.parse_args()

    uri = os.environ.get("MONGO_URI")
    if not uri:
        sys.exit("ERROR: MONGO_URI is not set.")
    token = os.environ.get("POSTHOG_PROJECT_TOKEN", DEFAULT_TOKEN)
    host = os.environ.get("POSTHOG_HOST", DEFAULT_HOST).rstrip("/")

    # The database name is NOT carried in MONGO_URI — every service sets
    # it separately (quarkus.mongodb.database=remote-falcon). Trusting the
    # URI's default lands on `admin`, where `show` is an empty collection
    # that reads exactly like "no eligible shows".
    db_name = os.environ.get("MONGO_DB", "remote-falcon")
    client = MongoClient(uri, uuidRepresentation="javaLegacy")
    db = client[db_name]

    # An explicit false is a decline on the record — excluded here, and
    # the broadcast's own audience filter (marketingOptIn = true) would
    # exclude it again.
    eligible = {
        "emailVerified": True,
        "email": {"$nin": [None, ""]},
        "showSubdomain": {"$nin": [None, ""]},
        "marketingOptIn": {"$ne": False},
    }
    fields = {"email": 1, "showName": 1, "showSubdomain": 1,
              "lastLoginDate": 1, "marketingOptIn": 1}

    total = db.show.count_documents({})
    if total == 0:
        print(f"ERROR: {db_name}.show is empty. Databases visible: "
              f"{client.list_database_names()}", file=sys.stderr)
        sys.exit(1)

    shows = list(db.show.find(eligible, fields))
    declined = db.show.count_documents({"marketingOptIn": False})
    never_asked = sum(1 for s in shows if s.get("marketingOptIn") is None)

    assign_waves(shows)
    waves = Counter(s["_wave"] for s in shows)
    print(f"shows total          {total}")
    print(f"eligible             {len(shows)}")
    print(f"  never asked (null) {never_asked}   <- Mongo writes touch only these")
    print(f"  already true       {len(shows) - never_asked}")
    print(f"declined (false)     {declined}   <- never touched")
    for w in (1, 2, 3):
        members = [s for s in shows if s["_wave"] == w]
        if not members:
            continue
        newest = login_sort_key(members[0]).date()
        oldest = login_sort_key(members[-1]).date()
        print(f"wave {w}               {len(members):>5}   last sign-in {oldest} .. {newest}")

    if not (args.apply_mongo or args.apply_posthog):
        print("\nDRY RUN — nothing written. Re-run with --apply-mongo / --apply-posthog.")
        return

    if args.apply_mongo:
        ops = [
            UpdateOne({"_id": s["_id"], "marketingOptIn": None}, {"$set": {"marketingOptIn": True}})
            for s in shows if s.get("marketingOptIn") is None
        ]
        if ops:
            for i in range(0, len(ops), 1000):
                res = db.show.bulk_write(ops[i:i + 1000], ordered=False)
                print(f"mongo: modified {res.modified_count}")
        else:
            print("mongo: nothing to do")

    if args.apply_posthog:
        sent = 0
        events: list[dict] = []
        for s in shows:
            wave = s["_wave"]
            if args.wave and wave != args.wave:
                continue
            last_login = s.get("lastLoginDate")
            props = {
                "marketingOptIn": True,
                "email": s["email"],
                "showName": s.get("showName"),
                "preseasonWave": wave,
            }
            if isinstance(last_login, datetime):
                props["lastLoginDate"] = last_login.replace(
                    tzinfo=last_login.tzinfo or timezone.utc
                ).isoformat()
            events.append({
                "event": "marketing_consent_backfilled",
                "distinct_id": s["showSubdomain"],
                "properties": {"$set": props, "source": "preseason-backfill"},
            })
            if len(events) >= BATCH_SIZE:
                post_batch(host, token, events)
                sent += len(events)
                print(f"posthog: {sent} sent")
                events = []
        if events:
            post_batch(host, token, events)
            sent += len(events)
        print(f"posthog: {sent} persons pushed (ingest is async — recount before dispatching)")


if __name__ == "__main__":
    main()
