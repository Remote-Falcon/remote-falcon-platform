#!/usr/bin/env python3
"""Characterization baseline probe (golden-master, read-only).

Captures the CURRENT behavior of the running stack on a deterministic sample of
prod-shaped shows, so the same probe can be run on `main` (before) and on the
release branch (after) and the two snapshots diffed (see baseline_diff.py).

The point is to catch UNINTENDED changes to EXISTING behavior — the class of
regression that the forward-looking e2e harness and the status-only legacy
sweep both miss by construction (the harness asserts new features; the sweep
only checked non-error status, never response content).

READ-ONLY ONLY. The three probes here do not mutate the DB, so before/after
runs see identical inputs without a restore:
  - viewer getShow (GraphQL query)
  - plugins-api /remotePreferences (GET)
  - plugins-api /viewerControlMode (GET)
The selection-logic endpoints (nextPlaylistInQueue, highestVotedPlaylist) MUTATE
(pull the request / consume a vote) and belong in the write-path diff phase.

The getShow selection is pinned to `main`'s field set (it excludes the epic's
new fields dailyVoteLimit / nightlyPlayLimit / playsToday) so the identical
query is valid on both branches and the diff compares only common fields.

Stdlib only.

Usage:
    baseline_probe.py --label main --out before.json [--n 120] [--base URL]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "http://localhost:8080"
PROBE_IP = "203.0.113.200"  # fixed RFC-5737 viewer IP so getShow has an IP

# getShow selection == main's field set (current branch query MINUS the three
# epic-added fields), so the same query parses on both schemas.
GET_SHOW_QUERY = """
query GetShowForViewer($showSubdomain: String!) {
  getShow(showSubdomain: $showSubdomain) {
    showSubdomain
    playingNow
    playingNowSequence { name displayName duration visible index order imageUrl active visibilityCount type group category artist }
    playingNext
    playingNextSequence { name displayName duration visible index order imageUrl active visibilityCount type group category artist }
    playingNextFromSchedule
    showName
    preferences {
      viewerControlEnabled
      viewerPageViewOnly
      viewerControlMode
      resetVotes
      jukeboxDepth
      locationCheckMethod
      showLatitude
      showLongitude
      allowedRadius
      checkIfVoted
      checkIfRequested
      psaEnabled
      psaFrequency
      jukeboxRequestLimit
      locationCode
      hideSequenceCount
      makeItSnow
      analyticsBetaOptIn
      managePsa
      sequencesPlayed
      pageTitle
      pageIconUrl
      selfHostedRedirectUrl
    }
    sequences { name displayName duration visible index order imageUrl active visibilityCount type group category artist }
    sequenceGroups { name visibilityCount }
    requests { sequence { index imageUrl artist name displayName } position ownerRequested }
    votes { sequence { name displayName } sequenceGroup { name } votes lastVoteTime ownerVoted }
  }
}
""".strip()

# Keys whose values are wall-clock-derived / time-pruned and would diff between
# two runs taken minutes apart for reasons unrelated to the code under test.
# Dropped recursively before snapshotting. (activeViewers is pruned by current
# time inside getShow; it is out of the epic's scope entirely.)
VOLATILE_KEYS = {"activeViewers", "visitDateTime"}


def mongo_json(js: str):
    p = subprocess.run(
        ["docker", "exec", "-i", "rf-mongo", "mongosh", "remote-falcon", "--quiet"],
        input=js, capture_output=True, text=True,
    )
    for line in p.stdout.splitlines():
        i = line.find("[")
        if i < 0:
            i = line.find("{")
        if i >= 0:
            try:
                return json.loads(line[i:])
            except json.JSONDecodeError:
                continue
    raise RuntimeError("no json from mongo:\n" + p.stdout[-800:] + "\n" + p.stderr[-400:])


def sample_shows(n: int):
    """Deterministic sample: first N shows by showSubdomain. Same DB -> same set
    on every run, so before/after line up 1:1."""
    return mongo_json(
        'var out=db.show.find('
        '{showSubdomain:{$ne:null}, showToken:{$ne:null}},'
        '{showSubdomain:1, showToken:1}'
        ').sort({showSubdomain:1}).limit(' + str(n) + ').toArray();'
        'print(JSON.stringify(out.map(s=>({sub:s.showSubdomain, tok:s.showToken}))))'
    )


def normalize(obj):
    """Recursively drop volatile keys so the snapshot is run-to-run stable."""
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in obj.items() if k not in VOLATILE_KEYS}
    if isinstance(obj, list):
        return [normalize(v) for v in obj]
    return obj


def viewer_getshow(base: str, sub: str):
    body = json.dumps({"query": GET_SHOW_QUERY, "variables": {"showSubdomain": sub}}).encode()
    req = urllib.request.Request(
        f"{base}/remote-falcon-viewer/graphql", data=body, method="POST",
        headers={"Content-Type": "application/json", "CF-Connecting-IP": PROBE_IP},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            payload = json.loads(r.read())
        data = (payload.get("data") or {}).get("getShow")
        errs = payload.get("errors")
        return {"status": r.status, "errors": errs, "data": normalize(data)}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "errors": [{"http": e.code}], "data": None}
    except Exception as e:  # noqa: BLE001
        return {"status": 0, "errors": [{"exc": str(e)}], "data": None}


def plugin_get(base: str, path: str, tok: str):
    req = urllib.request.Request(
        f"{base}/remote-falcon-plugins-api{path}", method="GET",
        headers={"showtoken": tok},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
            data = json.loads(raw) if raw else None
        return {"status": r.status, "data": normalize(data)}
    except urllib.error.HTTPError as e:
        # 4xx (disabled/unknown show) is a valid app response, not a defect.
        detail = None
        try:
            detail = e.read().decode("utf-8", errors="replace")[:200]
        except Exception:  # noqa: BLE001
            pass
        return {"status": e.code, "data": None, "detail": detail}
    except Exception as e:  # noqa: BLE001
        return {"status": 0, "data": None, "detail": str(e)}


def git_rev() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True).stdout.strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--label", required=True, help="snapshot label, e.g. main / branch")
    ap.add_argument("--out", required=True, help="output JSON path")
    ap.add_argument("--n", type=int, default=120, help="sample size (default 120)")
    ap.add_argument("--base", default=DEFAULT_BASE)
    args = ap.parse_args()

    shows = sample_shows(args.n)
    rev = git_rev()
    print(f"[{args.label}] git={rev} sampling {len(shows)} shows -> {args.out}")

    snap = {}
    for idx, s in enumerate(shows, 1):
        sub, tok = s["sub"], s["tok"]
        snap[sub] = {
            "getShow": viewer_getshow(args.base, sub),
            "remotePreferences": plugin_get(args.base, "/remotePreferences", tok),
            "viewerControlMode": plugin_get(args.base, "/viewerControlMode", tok),
        }
        if idx % 25 == 0:
            print(f"  ...{idx}/{len(shows)}")

    out = {
        "_meta": {"label": args.label, "git": rev, "n": len(shows), "base": args.base},
        "shows": snap,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)

    # quick status tally so a broken capture is obvious before the diff step
    bad = sum(1 for v in snap.values()
              if v["getShow"]["status"] != 200 or v["getShow"]["errors"])
    print(f"[{args.label}] wrote {len(snap)} shows; getShow non-200/errors: {bad}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
