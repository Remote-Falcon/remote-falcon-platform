#!/usr/bin/env python3
"""End-to-end fairness harness for the Show Fairness & Voting Integrity epic.

Simulates BOTH sides of the show against a running local stack:

  * the viewer page  -> viewer GraphQL  (voteForSequence / addSequenceToQueue)
  * the FPP plugin   -> plugins-api     (nextPlaylistInQueue / updateWhatsPlaying
                                         / fppHeartbeat / highestVotedPlaylist /
                                         remotePreferences)

For each fairness rule it sets the show into a known state (directly in Mongo),
drives the viewer/plugin HTTP APIs, and asserts the rule fires. It does NOT need
the physical FPP — the plugin is just an HTTP client, so we replay its calls.

Covered:
  geofence + multi-GPS (#16)      blocked IPs (NAUGHTY)
  daily vote limit (#162)         queue full (QUEUE_FULL)
  vote-exempt IPs (#156)          category request limit (#72/#128)
  stats-excluded IPs (#168)       anti-consecutive category (#109)
  per-night play cap (#163)       FPP request->play loop + voting->play loop

Safe to run repeatedly: it snapshots every field it touches and restores the
show on exit, and purges only the voteEvent rows it created (TEST-NET IPs).

Stdlib only. Talks to Mongo via `docker exec <container> mongosh`.

Usage:
    ops/fairness-e2e/run.py                 # full suite against http://localhost:8080
    ops/fairness-e2e/run.py --base-url http://192.168.1.119:8080
    ops/fairness-e2e/run.py --keep          # skip restore (leave state for inspection)

Exit codes: 0 all passed | 1 one or more failed | 2 setup/connectivity error
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

# Snapshot is written to disk at setup so a crash mid-run never loses the
# original state — recover any time with `run.py --restore`.
SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".snapshot.json")

# mongosh in stdin mode echoes a "<db>> " (or "... " continuation) prompt before
# output; strip it so JSON.stringify() lines parse cleanly.
_PROMPT_RE = re.compile(r"^(?:[A-Za-z0-9_.\-]+> |\.\.\. )+")

EMAIL = "matt@test.local"
MONGO_CONTAINER = "rf-mongo"
MONGO_DB = "remote-falcon"

# TEST-NET-3 (RFC 5737) — reserved for documentation/testing, never real viewers.
# Teardown purges voteEvent rows from this block, so we never touch real data.
IP_PREFIX = "203.0.113."
IP = {
    "geo": IP_PREFIX + "10",
    "limit": IP_PREFIX + "20",
    "exempt": IP_PREFIX + "30",
    "stats_excl": IP_PREFIX + "40",
    "stats_ctrl": IP_PREFIX + "41",
    "blocked": IP_PREFIX + "50",
    "queue": IP_PREFIX + "60",
    "cat": IP_PREFIX + "61",
    "loop": IP_PREFIX + "70",
    "vote_a": IP_PREFIX + "80",
    "vote_b": IP_PREFIX + "81",
    "vote_c": IP_PREFIX + "82",
}

# Geofence test coordinates (miles apart). Primary + one additional location.
PRIMARY = (40.0, -74.0)
ADDITIONAL = (41.0, -75.0)
NEAR_PRIMARY = (40.001, -74.001)      # ~0.09 mi from primary
NEAR_ADDITIONAL = (41.001, -75.001)   # ~0.09 mi from additional
FAR = (0.0, 0.0)                      # thousands of miles away

# ----------------------------------------------------------------------------
# Mongo helpers (via docker exec mongosh)
# ----------------------------------------------------------------------------

def mongo(js: str) -> str:
    """Run a mongosh snippet against the dev DB, return stdout (trimmed).

    The script is fed on stdin (not --eval) so large $set payloads — e.g.
    restoring the full requests/votes arrays — can't blow the OS argv limit.
    """
    out = subprocess.run(
        ["docker", "exec", "-i", MONGO_CONTAINER, "mongosh", "--quiet", MONGO_DB],
        input=js, capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"mongosh failed: {out.stderr.strip() or out.stdout.strip()}")
    return out.stdout.strip()


def mongo_json(js: str):
    """Run a snippet whose last printed line is JSON; return the parsed value."""
    raw = mongo(js)
    for line in reversed(raw.splitlines()):
        line = _PROMPT_RE.sub("", line.strip())
        if not line:
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    raise RuntimeError(f"no JSON in mongosh output:\n{raw}")


def set_prefs(fields: dict) -> None:
    """$set preferences.<k>=v for each entry (all values must be JSON-safe)."""
    dotted = {f"preferences.{k}": v for k, v in fields.items()}
    mongo(f'db.show.updateOne({{email:{json.dumps(EMAIL)}}}, {{$set:{json.dumps(dotted)}}})')


def set_show(fields: dict) -> None:
    mongo(f'db.show.updateOne({{email:{json.dumps(EMAIL)}}}, {{$set:{json.dumps(fields)}}})')


def tag_sequences(names: list, patch: dict) -> None:
    """Apply a patch (e.g. {category, active, visible}) to the named sequences."""
    sets = {f"sequences.$[e].{k}": v for k, v in patch.items()}
    mongo(
        f'db.show.updateOne({{email:{json.dumps(EMAIL)}}}, '
        f'{{$set:{json.dumps(sets)}}}, '
        f'{{arrayFilters:[{{"e.name":{{$in:{json.dumps(names)}}}}}]}})'
    )


def show_field(path_js: str):
    """Read one field off the show as JSON (path_js is a JS expression on `s`)."""
    return mongo_json(
        f'var s=db.show.findOne({{email:{json.dumps(EMAIL)}}}); print(JSON.stringify({path_js}))'
    )


def vote_event_count(show_id: str, ip: str) -> int:
    return mongo_json(
        f'print(JSON.stringify(db.voteEvent.countDocuments('
        f'{{showId:ObjectId({json.dumps(show_id)}), ip:{json.dumps(ip)}}})))'
    )


def purge_test_vote_events() -> None:
    mongo(f'db.voteEvent.deleteMany({{ip:{{$regex:"^{IP_PREFIX.replace(".", chr(92)+".")}"}}}})')


# ----------------------------------------------------------------------------
# HTTP helpers
# ----------------------------------------------------------------------------

class Ctx:
    base_url = "http://localhost:8080"
    subdomain = ""
    token = ""
    show_id = ""


def _gql_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def viewer_gql(field: str, name: str, ip: str, lat=None, lon=None):
    """Call a viewer mutation. Returns (ok: bool, status: str|None)."""
    loc = ""
    if lat is not None and lon is not None:
        loc = f", latitude: {lat}, longitude: {lon}"
    query = (
        f'mutation {{ {field}(showSubdomain: "{_gql_escape(Ctx.subdomain)}", '
        f'name: "{_gql_escape(name)}"{loc}) }}'
    )
    body = json.dumps({"query": query}).encode()
    req = urllib.request.Request(
        f"{Ctx.base_url}/remote-falcon-viewer/graphql",
        data=body, method="POST",
        headers={"Content-Type": "application/json", "CF-Connecting-IP": ip},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        payload = json.loads(r.read())
    data = payload.get("data") or {}
    if data.get(field) is True:
        return True, None
    errors = payload.get("errors") or []
    status = json.dumps(errors)  # search the whole errors blob for the enum token
    return False, status


def plugin_req(method: str, path: str, body: dict | None = None):
    """Call a plugins-api endpoint with the showtoken header. Returns (code, json|None)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{Ctx.base_url}/remote-falcon-plugins-api{path}",
        data=data, method=method,
        headers={"Content-Type": "application/json", "showtoken": Ctx.token},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, None


# ----------------------------------------------------------------------------
# Result framework
# ----------------------------------------------------------------------------

class Results:
    def __init__(self):
        self.rows = []  # (group, name, passed, detail)

    def check(self, group: str, name: str, passed: bool, detail: str = ""):
        self.rows.append((group, name, passed, detail))
        mark = "PASS" if passed else "FAIL"
        line = f"  [{mark}] {name}"
        if detail and not passed:
            line += f"  -> {detail}"
        print(line)

    def expect_allow(self, group, name, result):
        ok, status = result
        self.check(group, name, ok, f"expected ALLOW, got deny {status}")

    def expect_deny(self, group, name, result, token):
        ok, status = result
        passed = (not ok) and status is not None and token in status
        self.check(group, name, passed,
                   f"expected deny {token}, got {'ALLOW' if ok else status}")

    @property
    def failed(self):
        return [r for r in self.rows if not r[2]]


# ----------------------------------------------------------------------------
# Setup / teardown
# ----------------------------------------------------------------------------

SNAPSHOT_PREF_FIELDS = [
    "locationCheckMethod", "showLatitude", "showLongitude", "allowedRadius",
    "additionalGpsLocations", "checkIfVoted", "checkIfRequested", "dailyVoteLimit",
    "votingExemptIps", "statsExcludedIps", "blockedViewerIps", "jukeboxDepth",
    "viewerControlMode", "viewerControlEnabled", "nightlyPlayLimit", "lastPlayCountedAt",
]


def setup() -> dict:
    """Load show identity, pick test sequences, snapshot mutated state."""
    ident = show_field("{id:s._id.toString(), sub:s.showSubdomain, token:s.showToken}")
    Ctx.subdomain = ident["sub"]
    Ctx.token = ident["token"]
    Ctx.show_id = ident["id"]

    seqs = show_field(
        "(s.sequences||[]).filter(x=>x.active&&x.visible).slice(0,4).map(x=>x.name)"
    )
    if len(seqs) < 4:
        raise RuntimeError(f"need >=4 active+visible sequences, found {len(seqs)}")

    snap = show_field(
        # `??null` so fields absent on the show (e.g. the new nightlyPlayLimit /
        # lastPlayCountedAt) snapshot as null and restore as null rather than
        # being dropped from the JSON and left mutated after teardown.
        "{prefs: " + "{" + ",".join(f'{f}:(s.preferences.{f}??null)' for f in SNAPSHOT_PREF_FIELDS) + "},"
        " categories: s.categories||[],"
        " playingNow: s.playingNow||null,"
        " playingNext: s.playingNext||null,"
        " requests: s.requests||[],"
        " votes: s.votes||[],"
        " seqState: (s.sequences||[]).filter(x=>" + json.dumps(seqs) + ".indexOf(x.name)>=0)"
        "   .map(x=>({name:x.name, category:x.category||null, active:x.active, visible:x.visible,"
        "             playsToday:(x.playsToday??null)}))"
        "}"
    )
    snap["seqs"] = seqs
    with open(SNAPSHOT_PATH, "w") as f:
        json.dump(snap, f)
    return snap


def load_snapshot() -> dict:
    with open(SNAPSHOT_PATH) as f:
        return json.load(f)


def teardown(snap: dict) -> None:
    """Restore every field we touched, then purge our voteEvent rows.

    Best-effort: each step is independent so one failure can't strand the rest.
    """
    steps = [
        lambda: set_prefs(snap["prefs"]),
        lambda: set_show({
            "categories": snap["categories"],
            "playingNow": snap["playingNow"],
            "playingNext": snap["playingNext"],
            "requests": snap["requests"],
            "votes": snap["votes"],
        }),
    ]
    for st in snap["seqState"]:
        steps.append(lambda st=st: tag_sequences([st["name"]], {
            "category": st["category"], "active": st["active"], "visible": st["visible"],
            "playsToday": st.get("playsToday"),
        }))
    steps.append(purge_test_vote_events)

    ok = True
    for step in steps:
        try:
            step()
        except Exception as e:
            ok = False
            print(f"  teardown step failed: {e}", file=sys.stderr)
    if ok and os.path.exists(SNAPSHOT_PATH):
        os.remove(SNAPSHOT_PATH)


def clear_queue_and_votes():
    set_show({"requests": [], "votes": [], "playingNow": None, "playingNext": None})


# ----------------------------------------------------------------------------
# Scenarios
# ----------------------------------------------------------------------------

def scn_geofence(r: Results, seqs):
    g = "Geofence + multi-GPS (#16)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "GEO",
        "showLatitude": PRIMARY[0], "showLongitude": PRIMARY[1], "allowedRadius": 1.0,
        "additionalGpsLocations": [{"latitude": ADDITIONAL[0], "longitude": ADDITIONAL[1]}],
        "checkIfVoted": False, "dailyVoteLimit": 0, "blockedViewerIps": [],
        "votingExemptIps": [], "statsExcludedIps": [], "viewerControlMode": "VOTING",
    })
    purge_test_vote_events()
    r.expect_allow(g, "vote near primary location is allowed",
                   viewer_gql("voteForSequence", seqs[0], IP["geo"], *NEAR_PRIMARY))
    r.expect_allow(g, "vote near ADDITIONAL location is allowed (multi-GPS)",
                   viewer_gql("voteForSequence", seqs[1], IP["geo"], *NEAR_ADDITIONAL))
    r.expect_deny(g, "vote far outside radius is denied",
                  viewer_gql("voteForSequence", seqs[2], IP["geo"], *FAR), "INVALID_LOCATION")
    r.expect_deny(g, "vote with no coordinates is denied",
                  viewer_gql("voteForSequence", seqs[3], IP["geo"]), "INVALID_LOCATION")


def scn_daily_vote_limit(r: Results, seqs):
    g = "Daily vote limit (#162)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfVoted": False, "dailyVoteLimit": 2,
        "votingExemptIps": [], "statsExcludedIps": [], "blockedViewerIps": [],
        "viewerControlMode": "VOTING",
    })
    purge_test_vote_events()
    r.expect_allow(g, "1st vote under the cap is allowed",
                   viewer_gql("voteForSequence", seqs[0], IP["limit"]))
    r.expect_allow(g, "2nd vote at the cap is allowed",
                   viewer_gql("voteForSequence", seqs[1], IP["limit"]))
    r.expect_deny(g, "3rd vote over the cap is denied",
                  viewer_gql("voteForSequence", seqs[2], IP["limit"]), "DAILY_VOTE_LIMIT_REACHED")


def scn_vote_exempt(r: Results, seqs):
    g = "Vote-exempt IPs (#156)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfVoted": False, "dailyVoteLimit": 2,
        "votingExemptIps": [IP["exempt"]], "statsExcludedIps": [], "blockedViewerIps": [],
        "viewerControlMode": "VOTING",
    })
    purge_test_vote_events()
    r.expect_allow(g, "exempt IP: 1st vote allowed",
                   viewer_gql("voteForSequence", seqs[0], IP["exempt"]))
    r.expect_allow(g, "exempt IP: 2nd vote allowed",
                   viewer_gql("voteForSequence", seqs[1], IP["exempt"]))
    r.expect_allow(g, "exempt IP: 3rd vote bypasses the cap",
                   viewer_gql("voteForSequence", seqs[2], IP["exempt"]))


def scn_stats_excluded(r: Results, seqs):
    g = "Stats-excluded IPs (#168)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfVoted": False, "dailyVoteLimit": 0,
        "statsExcludedIps": [IP["stats_excl"]], "votingExemptIps": [], "blockedViewerIps": [],
        "viewerControlMode": "VOTING",
    })
    purge_test_vote_events()
    r.expect_allow(g, "excluded IP can still vote",
                   viewer_gql("voteForSequence", seqs[0], IP["stats_excl"]))
    r.expect_allow(g, "control IP can vote",
                   viewer_gql("voteForSequence", seqs[0], IP["stats_ctrl"]))
    excl = vote_event_count(Ctx.show_id, IP["stats_excl"])
    ctrl = vote_event_count(Ctx.show_id, IP["stats_ctrl"])
    r.check(g, "excluded IP records NO voteEvent", excl == 0, f"voteEvent count={excl}")
    r.check(g, "control IP DOES record a voteEvent", ctrl == 1, f"voteEvent count={ctrl}")


def scn_blocked_ip(r: Results, seqs):
    g = "Blocked IPs (NAUGHTY)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfVoted": False, "dailyVoteLimit": 0,
        "blockedViewerIps": [IP["blocked"]], "votingExemptIps": [], "statsExcludedIps": [],
        "viewerControlMode": "VOTING",
    })
    r.expect_deny(g, "blocked IP vote is denied",
                  viewer_gql("voteForSequence", seqs[0], IP["blocked"]), "NAUGHTY")


def scn_queue_full(r: Results, seqs):
    g = "Queue full (QUEUE_FULL)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfRequested": False, "jukeboxDepth": 1,
        "blockedViewerIps": [], "viewerControlMode": "JUKEBOX",
    })
    clear_queue_and_votes()
    r.expect_allow(g, "1st request fills the queue",
                   viewer_gql("addSequenceToQueue", seqs[0], IP["queue"]))
    r.expect_deny(g, "2nd request over depth is denied",
                  viewer_gql("addSequenceToQueue", seqs[1], IP["queue"]), "QUEUE_FULL")


def scn_category_limit(r: Results, seqs):
    g = "Category request limit (#72/#128)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfRequested": False, "jukeboxDepth": 50,
        "blockedViewerIps": [], "viewerControlMode": "JUKEBOX",
    })
    clear_queue_and_votes()
    # Two sequences share a capped category; a third is uncategorised.
    # Append-if-absent (never replace the operator's category list) so even a
    # skipped teardown can't clobber real categories; teardown removes E2ECat.
    mongo(
        f'db.show.updateOne({{email:{json.dumps(EMAIL)}, "categories.name":{{$ne:"E2ECat"}}}}, '
        f'{{$push:{{categories:{{name:"E2ECat", requestLimit:1, antiConsecutive:false}}}}}})'
    )
    tag_sequences([seqs[0], seqs[1]], {"category": "E2ECat", "active": True, "visible": True})
    tag_sequences([seqs[2]], {"category": None, "active": True, "visible": True})
    r.expect_allow(g, "1st request in capped category allowed",
                   viewer_gql("addSequenceToQueue", seqs[0], IP["cat"]))
    r.expect_deny(g, "2nd request in capped category denied",
                  viewer_gql("addSequenceToQueue", seqs[1], IP["cat"]), "SEQUENCE_REQUESTED")
    r.expect_allow(g, "request outside the category still allowed",
                   viewer_gql("addSequenceToQueue", seqs[2], IP["cat"]))


def scn_fpp_request_loop(r: Results, seqs):
    g = "FPP request -> play loop (plugins-api)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfRequested": False, "jukeboxDepth": 50,
        "blockedViewerIps": [], "viewerControlMode": "JUKEBOX", "viewerControlEnabled": True,
    })
    clear_queue_and_votes()
    seq = seqs[0]
    r.expect_allow(g, "viewer request is accepted",
                   viewer_gql("addSequenceToQueue", seq, IP["loop"]))
    qlen = show_field("(s.requests||[]).length")
    r.check(g, "request landed in the Mongo queue", qlen == 1, f"queue length={qlen}")

    code, resp = plugin_req("GET", "/nextPlaylistInQueue")
    got = (resp or {}).get("nextPlaylist")
    r.check(g, "FPP nextPlaylistInQueue returns the requested sequence",
            code == 200 and got == seq, f"http={code} nextPlaylist={got!r}")
    qlen2 = show_field("(s.requests||[]).length")
    r.check(g, "queue is popped after the FPP reads it", qlen2 == 0, f"queue length={qlen2}")

    code, _ = plugin_req("POST", "/updateWhatsPlaying", {"playlist": seq})
    now = show_field("s.playingNow||null")
    r.check(g, "updateWhatsPlaying sets playingNow", code == 200 and now == seq,
            f"http={code} playingNow={now!r}")

    code, _ = plugin_req("POST", "/fppHeartbeat", {})
    r.check(g, "fppHeartbeat accepted (204)", code == 204, f"http={code}")
    hb = show_field("s.lastFppHeartbeat? true : false")
    r.check(g, "heartbeat recorded on the show", hb is True, f"lastFppHeartbeat set={hb}")

    code, resp = plugin_req("GET", "/remotePreferences")
    mode = (resp or {}).get("viewerControlMode")
    r.check(g, "remotePreferences reports jukebox mode",
            code == 200 and str(mode).lower() == "jukebox", f"http={code} mode={mode!r}")


def scn_voting_loop(r: Results, seqs):
    g = "Voting -> play loop (plugins-api)"
    print(f"\n{g}")
    set_prefs({
        "locationCheckMethod": "NONE", "checkIfVoted": False, "dailyVoteLimit": 0,
        "blockedViewerIps": [], "votingExemptIps": [], "statsExcludedIps": [],
        "viewerControlMode": "VOTING",
    })
    clear_queue_and_votes()
    purge_test_vote_events()
    seq = seqs[0]
    for who in ("vote_a", "vote_b", "vote_c"):
        viewer_gql("voteForSequence", seq, IP[who])
    code, resp = plugin_req("GET", "/highestVotedPlaylist")
    winner = (resp or {}).get("winningPlaylist")
    r.check(g, "highestVotedPlaylist returns the most-voted sequence",
            code == 200 and winner == seq, f"http={code} winner={winner!r}")


def scn_anti_consecutive(r: Results, seqs):
    g = "Anti-consecutive category (#109)"
    print(f"\n{g}")
    anchor, blocked, allowed = seqs[0], seqs[1], seqs[2]

    # One flagged (anti-consecutive) category + one plain category. Append-if-
    # absent so a skipped teardown can't clobber the operator's real list;
    # teardown restores the original categories array wholesale.
    for cat, anti in (("E2EAntiCat", True), ("E2EOtherCat", False)):
        mongo(
            f'db.show.updateOne({{email:{json.dumps(EMAIL)}, "categories.name":{{$ne:{json.dumps(cat)}}}}}, '
            f'{{$push:{{categories:{{name:{json.dumps(cat)}, requestLimit:null, '
            f'antiConsecutive:{str(anti).lower()}}}}}}})'
        )
    tag_sequences([anchor, blocked], {"category": "E2EAntiCat", "active": True, "visible": True})
    tag_sequences([allowed], {"category": "E2EOtherCat", "active": True, "visible": True})
    idx = {n: show_field(f'((s.sequences||[]).find(x=>x.name=={json.dumps(n)})||{{}}).index ?? -1')
           for n in (anchor, blocked, allowed)}

    def req(name, position):
        return {"position": position, "sequence": {"name": name, "index": idx[name]}}

    # --- Jukebox: skip the same-category head, play the different category ---
    set_prefs({"viewerControlMode": "JUKEBOX", "viewerControlEnabled": True})
    set_show({"playingNow": anchor,  # just played a song in the anti-consecutive category
              "requests": [req(blocked, 1), req(allowed, 2)], "votes": []})
    code, resp = plugin_req("GET", "/nextPlaylistInQueue")
    got = (resp or {}).get("nextPlaylist")
    r.check(g, "jukebox skips same-category head, plays a different category",
            code == 200 and got == allowed, f"http={code} nextPlaylist={got!r} (expected {allowed!r})")

    # --- Jukebox yield: with no alternative, play the blocked song anyway ---
    set_show({"playingNow": anchor, "requests": [req(blocked, 1)], "votes": []})
    code, resp = plugin_req("GET", "/nextPlaylistInQueue")
    got = (resp or {}).get("nextPlaylist")
    r.check(g, "jukebox yields (plays blocked song) when it's the only option",
            code == 200 and got == blocked, f"http={code} nextPlaylist={got!r} (expected {blocked!r})")

    # --- Voting: defer the higher-voted same-category song to a later cycle ---
    set_prefs({"locationCheckMethod": "NONE", "checkIfVoted": False, "dailyVoteLimit": 0,
               "votingExemptIps": [], "statsExcludedIps": [], "blockedViewerIps": [],
               "viewerControlMode": "VOTING"})
    clear_queue_and_votes()
    purge_test_vote_events()
    # Real viewer votes (correct lastVoteTime serialization), then bump counts so
    # the blocked-category song out-votes the allowed one (5 vs 3).
    viewer_gql("voteForSequence", blocked, IP["vote_a"])
    viewer_gql("voteForSequence", allowed, IP["vote_b"])
    mongo(
        f'db.show.updateOne({{email:{json.dumps(EMAIL)}}}, '
        f'{{$set:{{"votes.$[b].votes":5, "votes.$[a].votes":3}}}}, '
        f'{{arrayFilters:[{{"b.sequence.name":{json.dumps(blocked)}}}, '
        f'{{"a.sequence.name":{json.dumps(allowed)}}}]}})'
    )
    set_show({"playingNow": anchor})
    code, resp = plugin_req("GET", "/highestVotedPlaylist")
    winner = (resp or {}).get("winningPlaylist")
    r.check(g, "voting defers higher-voted same-category song, plays a different one",
            code == 200 and winner == allowed, f"http={code} winner={winner!r} (expected {allowed!r})")


def scn_nightly_play_cap(r: Results, seqs):
    g = "Per-night play cap (#163)"
    print(f"\n{g}")
    capped, fresh, spare = seqs[0], seqs[1], seqs[2]

    def req(name, position):
        idx = show_field(f'((s.sequences||[]).find(x=>x.name=={json.dumps(name)})||{{}}).index ?? -1')
        return {"position": position, "sequence": {"name": name, "index": idx}}

    # --- Jukebox: a song at its nightly cap is skipped for a fresh one ---
    set_prefs({"viewerControlMode": "JUKEBOX", "viewerControlEnabled": True, "nightlyPlayLimit": 2})
    tag_sequences([capped], {"playsToday": 2, "category": None, "active": True, "visible": True})
    tag_sequences([fresh], {"playsToday": 0, "category": None, "active": True, "visible": True})
    set_show({"playingNow": None, "requests": [req(capped, 1), req(fresh, 2)], "votes": []})
    code, resp = plugin_req("GET", "/nextPlaylistInQueue")
    got = (resp or {}).get("nextPlaylist")
    r.check(g, "jukebox skips a song at its nightly cap, plays a fresh one",
            code == 200 and got == fresh, f"http={code} nextPlaylist={got!r} (expected {fresh!r})")

    # --- Voting: the capped song is deferred even with more votes ---
    set_prefs({"locationCheckMethod": "NONE", "checkIfVoted": False, "dailyVoteLimit": 0,
               "votingExemptIps": [], "statsExcludedIps": [], "blockedViewerIps": [],
               "viewerControlMode": "VOTING", "nightlyPlayLimit": 2})
    tag_sequences([capped], {"playsToday": 2, "category": None, "active": True, "visible": True})
    tag_sequences([fresh], {"playsToday": 0, "category": None, "active": True, "visible": True})
    clear_queue_and_votes()
    purge_test_vote_events()
    viewer_gql("voteForSequence", capped, IP["vote_a"])
    viewer_gql("voteForSequence", fresh, IP["vote_b"])
    mongo(
        f'db.show.updateOne({{email:{json.dumps(EMAIL)}}}, '
        f'{{$set:{{"votes.$[c].votes":5, "votes.$[f].votes":3}}}}, '
        f'{{arrayFilters:[{{"c.sequence.name":{json.dumps(capped)}}}, '
        f'{{"f.sequence.name":{json.dumps(fresh)}}}]}})'
    )
    code, resp = plugin_req("GET", "/highestVotedPlaylist")
    winner = (resp or {}).get("winningPlaylist")
    r.check(g, "voting defers a capped song, plays a fresh one",
            code == 200 and winner == fresh, f"http={code} winner={winner!r} (expected {fresh!r})")

    # --- Counter: updateWhatsPlaying counts the play and resets a stale tally ---
    # lastPlayCountedAt=null -> the next play is the first of a new show-night, so
    # `spare`'s stale tally resets to 0 before `fresh` is counted to 1.
    set_prefs({"viewerControlMode": "JUKEBOX", "viewerControlEnabled": True,
               "nightlyPlayLimit": 2, "lastPlayCountedAt": None})
    tag_sequences([fresh], {"playsToday": 0, "category": None, "active": True, "visible": True})
    tag_sequences([spare], {"playsToday": 5, "category": None, "active": True, "visible": True})
    clear_queue_and_votes()
    plugin_req("POST", "/updateWhatsPlaying", {"playlist": fresh})
    fresh_plays = show_field(f'((s.sequences||[]).find(x=>x.name=={json.dumps(fresh)})||{{}}).playsToday ?? null')
    spare_plays = show_field(f'((s.sequences||[]).find(x=>x.name=={json.dumps(spare)})||{{}}).playsToday ?? null')
    r.check(g, "updateWhatsPlaying counts the play (playsToday -> 1)",
            fresh_plays == 1, f"fresh.playsToday={fresh_plays!r}")
    r.check(g, "new-night reset zeroes a stale tally",
            spare_plays == 0, f"spare.playsToday={spare_plays!r}")


SCENARIOS = [
    scn_geofence, scn_daily_vote_limit, scn_vote_exempt, scn_stats_excluded,
    scn_blocked_ip, scn_queue_full, scn_category_limit,
    scn_fpp_request_loop, scn_voting_loop, scn_nightly_play_cap, scn_anti_consecutive,
]


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

def connectivity_check() -> str | None:
    try:
        ok, _ = viewer_gql("voteForSequence", "___connectivity___", IP_PREFIX + "254")
        # Any HTTP 200 response (even a deny) proves the endpoint is reachable.
    except Exception as e:
        return f"viewer GraphQL unreachable at {Ctx.base_url}: {e}"
    code, _ = plugin_req("GET", "/remotePreferences")
    if code not in (200, 401, 404):
        return f"plugins-api unexpected status {code} at {Ctx.base_url}"
    return None


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base-url", default="http://localhost:8080")
    p.add_argument("--keep", action="store_true",
                   help="skip restore so you can inspect the resulting state")
    p.add_argument("--restore", action="store_true",
                   help="restore the show from the on-disk snapshot and exit (crash recovery)")
    args = p.parse_args()
    Ctx.base_url = args.base_url.rstrip("/")

    if args.restore:
        if not os.path.exists(SNAPSHOT_PATH):
            print(f"No snapshot at {SNAPSHOT_PATH}; nothing to restore.", file=sys.stderr)
            return 2
        print("Restoring show from on-disk snapshot...")
        teardown(load_snapshot())
        print("Done.")
        return 0

    try:
        snap = setup()
    except Exception as e:
        print(f"SETUP ERROR: {e}", file=sys.stderr)
        return 2

    print(f"Show: {Ctx.subdomain}  (id {Ctx.show_id})")
    print(f"Stack: {Ctx.base_url}")
    print(f"Test sequences: {snap['seqs']}")

    err = connectivity_check()
    if err:
        print(f"CONNECTIVITY ERROR: {err}", file=sys.stderr)
        if not args.keep:
            teardown(snap)
        return 2

    r = Results()
    try:
        for scn in SCENARIOS:
            scn(r, snap["seqs"])
    finally:
        if args.keep:
            print("\n--keep set: leaving show in last-scenario state (no restore).")
        else:
            print("\nRestoring show state...")
            teardown(snap)

    total = len(r.rows)
    failed = r.failed
    print("\n" + "=" * 60)
    print(f"RESULT: {total - len(failed)}/{total} checks passed")
    if failed:
        print("\nFailures:")
        for grp, name, _passed, detail in failed:
            print(f"  - [{grp}] {name}: {detail}")
        return 1
    print("All fairness rules verified end-to-end.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
