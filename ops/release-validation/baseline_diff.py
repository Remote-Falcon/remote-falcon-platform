#!/usr/bin/env python3
"""Diff two characterization snapshots (baseline_probe.py output).

Compares `before` (main) vs `after` (release branch) on the same deterministic
show sample and classifies every delta:

  EXPECTED   — an additive key the epic is known to introduce (whitelist below),
               or a status that improved error -> ok. Reported but not a failure.
  REGRESSION — anything else: a value of a pre-existing field changed, a field
               disappeared, a list length changed, or a status got worse.

The whole premise: every REGRESSION line is something to consciously accept or
fix before the release->main deploy. EXPECTED lines are the epic doing its job.

Exit 0 when there are no REGRESSION deltas, else 1.

Usage:
    baseline_diff.py --before before.json --after after.json [--show-expected]
"""
from __future__ import annotations

import argparse
import json
import sys

# Keys the epic legitimately ADDS to a response (additive, null-safe). An added
# key whose leaf name is in this set is EXPECTED, not a regression. (The getShow
# selection is pinned to main's fields so these mainly surface in the
# remotePreferences / viewerControlMode DTOs.)
EXPECTED_NEW_KEYS = {
    "votesRemaining",
    "votingWindowStartedAt",
    "lastVoteCountedAt",
    "dailyVoteLimit",
    "nightlyPlayLimit",
    "playsToday",
}


def deep_diff(before, after, path=""):
    """Yield (kind, path, before, after). kind in:
    ADDED / REMOVED / CHANGED / LIST_LEN / TYPE."""
    if isinstance(before, dict) and isinstance(after, dict):
        for k in before.keys() | after.keys():
            p = f"{path}.{k}" if path else k
            if k not in after:
                yield ("REMOVED", p, before[k], None)
            elif k not in before:
                yield ("ADDED", p, None, after[k])
            else:
                yield from deep_diff(before[k], after[k], p)
    elif isinstance(before, list) and isinstance(after, list):
        if len(before) != len(after):
            yield ("LIST_LEN", path, len(before), len(after))
        else:
            for i, (b, a) in enumerate(zip(before, after)):
                yield from deep_diff(b, a, f"{path}[{i}]")
    elif type(before) is not type(after) and not (before is None or after is None):
        yield ("TYPE", path, before, after)
    elif before != after:
        yield ("CHANGED", path, before, after)


def leaf(path: str) -> str:
    seg = path.split(".")[-1]
    return seg.split("[")[0]


def classify(kind: str, path: str) -> str:
    if kind == "ADDED" and leaf(path) in EXPECTED_NEW_KEYS:
        return "EXPECTED"
    return "REGRESSION"


def fmt(v) -> str:
    s = json.dumps(v, default=str)
    return s if len(s) <= 120 else s[:117] + "..."


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--show-expected", action="store_true",
                    help="also print EXPECTED (epic) deltas")
    args = ap.parse_args()

    before = json.load(open(args.before))
    after = json.load(open(args.after))
    b_shows, a_shows = before["shows"], after["shows"]

    print(f"before: {before['_meta']}")
    print(f"after:  {after['_meta']}")

    only_b = b_shows.keys() - a_shows.keys()
    only_a = a_shows.keys() - b_shows.keys()
    if only_b:
        print(f"\n!! {len(only_b)} shows in BEFORE only (sample drift): "
              f"{sorted(only_b)[:5]}")
    if only_a:
        print(f"!! {len(only_a)} shows in AFTER only (sample drift): "
              f"{sorted(only_a)[:5]}")

    common = sorted(b_shows.keys() & a_shows.keys())
    regressions = []   # (sub, kind, path, before, after)
    expected = []
    by_path = {}       # regression path -> count (pattern view)

    for sub in common:
        for kind, path, bv, av in deep_diff(b_shows[sub], a_shows[sub]):
            cls = classify(kind, path)
            row = (sub, kind, path, bv, av)
            if cls == "REGRESSION":
                regressions.append(row)
                by_path[path] = by_path.get(path, 0) + 1
            else:
                expected.append(row)

    print(f"\ncompared {len(common)} shows")
    print(f"EXPECTED (epic) deltas: {len(expected)}")
    print(f"REGRESSION deltas:      {len(regressions)}")

    if args.show_expected and expected:
        print("\n--- EXPECTED (epic additions) ---")
        # collapse to path -> count, they're uniform across shows
        epaths = {}
        for _, kind, path, _, av in expected:
            epaths.setdefault((kind, path), 0)
            epaths[(kind, path)] += 1
        for (kind, path), c in sorted(epaths.items()):
            print(f"  {kind:8s} {path}  (x{c} shows)")

    if regressions:
        print("\n--- REGRESSION delta patterns (path -> #shows) ---")
        for path, c in sorted(by_path.items(), key=lambda kv: -kv[1]):
            print(f"  {c:4d}  {path}")
        print("\n--- REGRESSION samples (first 40) ---")
        for sub, kind, path, bv, av in regressions[:40]:
            print(f"  [{kind}] {sub} :: {path}")
            print(f"         before={fmt(bv)}")
            print(f"         after ={fmt(av)}")
        print(f"\nTOTAL REGRESSION deltas: {len(regressions)} across "
              f"{len({r[0] for r in regressions})} shows")
        print("RESULT: REGRESSIONS FOUND — review each before deploy")
        return 1

    print("\nRESULT: no regressions — existing behavior unchanged across the sample")
    return 0


if __name__ == "__main__":
    sys.exit(main())
