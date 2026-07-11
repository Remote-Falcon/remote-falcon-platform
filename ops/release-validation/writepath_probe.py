#!/usr/bin/env python3
"""Characterization baseline — WRITE-PATH (selection-logic) probe.

Phase 2 of the golden-master comparison. The play-selection endpoints MUTATE
(nextPlaylistInQueue $pulls the chosen request + updates visibility counts;
highestVotedPlaylist consumes a priority vote), so they can't be diffed by a
plain read like Phase 1. This probe wraps each call in a full-document
snapshot/restore so main and branch both see byte-identical input state, then
the two snapshots are diffed (reuse baseline_diff.py) to reveal whether the
epic's selection changes (#7 nightly cap, #9 sort, #109 anti-consecutive)
alter what actually gets picked from real prod-shaped queues/vote sets.

Isolation model (server-side, no EJSON round-trip so BSON types survive):
  1. snapshot all target docs into a backup collection (1 bulk op)
  2. BATCH A: call nextPlaylistInQueue once per show, capture response
             (each show mutated at most once, so no intra-batch contamination)
  3. bulk-restore every target from backup
  4. BATCH B: call highestVotedPlaylist once per show, capture
  5. bulk-restore again, drop backup

Runs only against the LOCAL dev DB (a restorable prod copy). Output envelope
matches baseline_probe.py so `baseline_diff.py` consumes it unchanged.

Usage:
    writepath_probe.py --label main --out main_wp.json [--req-n 40] [--vote-n 40]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "http://localhost:8080"
BAK = "show_baseline_bak"


def mongo_run(js: str) -> str:
    p = subprocess.run(
        ["docker", "exec", "-i", "rf-mongo", "mongosh", "remote-falcon", "--quiet"],
        input=js, capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise RuntimeError(f"mongo failed: {p.stderr[-400:]}")
    return p.stdout


def mongo_json(js: str):
    out = mongo_run(js)
    for line in out.splitlines():
        i = line.find("[")
        if i < 0:
            i = line.find("{")
        if i >= 0:
            try:
                return json.loads(line[i:])
            except json.JSONDecodeError:
                continue
    raise RuntimeError("no json from mongo:\n" + out[-800:])


def select_targets(req_n: int, vote_n: int):
    """Union of the deepest request queues and the largest vote sets — the
    shows where selection logic actually has a choice to make."""
    return mongo_json(
        'var byReq = db.show.find({"requests.1":{$exists:true}},'
        '  {showSubdomain:1, showToken:1, n:{$size:"$requests"}})'
        '  .sort({n:-1}).limit(' + str(req_n) + ').toArray();'
        'var byVote = db.show.find({"votes.0":{$exists:true}},'
        '  {showSubdomain:1, showToken:1, n:{$size:"$votes"}})'
        '  .sort({n:-1}).limit(' + str(vote_n) + ').toArray();'
        'var seen={}; var out=[];'
        '[byReq,byVote].forEach(function(arr){arr.forEach(function(s){'
        '  var k=String(s._id); if(!seen[k]){seen[k]=1;'
        '  out.push({id:k, sub:s.showSubdomain, tok:s.showToken});}});});'
        'print(JSON.stringify(out));'
    )


def snapshot(ids):
    idlist = ",".join(f'ObjectId("{i}")' for i in ids)
    mongo_run(
        f'db.{BAK}.drop();'
        f'var docs=db.show.find({{_id:{{$in:[{idlist}]}}}}).toArray();'
        f'if(docs.length) db.{BAK}.insertMany(docs);'
        f'print("snap "+db.{BAK}.countDocuments({{}}));'
    )


def restore_all():
    mongo_run(
        f'db.{BAK}.find().forEach(function(d){{db.show.replaceOne({{_id:d._id}}, d);}});'
        f'print("restored "+db.{BAK}.countDocuments({{}}));'
    )


def drop_bak():
    mongo_run(f'db.{BAK}.drop(); print("dropped");')


def plugin_get(base: str, path: str, tok: str):
    req = urllib.request.Request(
        f"{base}/remote-falcon-plugins-api{path}", method="GET",
        headers={"showtoken": tok},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
            return {"status": r.status, "data": json.loads(raw) if raw else None}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "data": None}
    except Exception as e:  # noqa: BLE001
        return {"status": 0, "data": None, "err": str(e)}


def git_rev() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True).stdout.strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--label", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--req-n", type=int, default=40)
    ap.add_argument("--vote-n", type=int, default=40)
    args = ap.parse_args()

    targets = select_targets(args.req_n, args.vote_n)
    ids = [t["id"] for t in targets]
    rev = git_rev()
    print(f"[{args.label}] git={rev} targets={len(targets)} "
          f"(req-n={args.req_n} vote-n={args.vote_n}) -> {args.out}")

    snap = {t["sub"]: {} for t in targets}
    try:
        snapshot(ids)

        # BATCH A — nextPlaylistInQueue (each show mutated <=1x, no restore mid-batch)
        for t in targets:
            snap[t["sub"]]["nextPlaylistInQueue"] = plugin_get(
                args.base, "/nextPlaylistInQueue", t["tok"])
        restore_all()

        # BATCH B — highestVotedPlaylist
        for t in targets:
            snap[t["sub"]]["highestVotedPlaylist"] = plugin_get(
                args.base, "/highestVotedPlaylist", t["tok"])
    finally:
        # Safety net: restore unconditionally (idempotent — replays the backup)
        # BEFORE dropping it, so a mid-batch crash can never leave a show in a
        # mutated state. Only drop once the restore has run.
        try:
            restore_all()
        finally:
            drop_bak()

    out = {
        "_meta": {"label": args.label, "git": rev, "n": len(targets),
                  "req_n": args.req_n, "vote_n": args.vote_n},
        "shows": snap,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"[{args.label}] wrote {len(snap)} shows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
