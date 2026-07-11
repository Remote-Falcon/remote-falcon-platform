# Fairness end-to-end harness

Drives the **viewer GraphQL API** and the **plugins-api (FPP) endpoints** against a
running local stack to verify every rule in the Show Fairness & Voting Integrity
epic (PRD-009). It simulates both the viewer page and the FPP plugin over HTTP,
so **no physical FPP device is required** — though you can point it at a stack a
real FPP is also talking to.

## What it checks

| Scenario | Rule |
|---|---|
| Geofence + multi-GPS | `INVALID_LOCATION`, primary + `additionalGpsLocations` (#16) |
| Daily vote limit | `DAILY_VOTE_LIMIT_REACHED` (#162) |
| Vote-exempt IPs | bypass the daily cap (#156) |
| Stats-excluded IPs | no `voteEvent` row recorded (#168) |
| Blocked IPs | `NAUGHTY` |
| Queue full | `QUEUE_FULL` |
| Category request limit | `SEQUENCE_REQUESTED`, category-scoped (#72/#128) |
| FPP request → play loop | request → `nextPlaylistInQueue` pop → `updateWhatsPlaying` → `fppHeartbeat` |
| Voting → play loop | votes → `highestVotedPlaylist` winner |

## Run

```bash
# stack must be up:  ./ops/dev-up.sh up
ops/fairness-e2e/run.py                              # full suite, localhost
ops/fairness-e2e/run.py --base-url http://192.168.1.119:8080
ops/fairness-e2e/run.py --keep                       # don't restore (inspect state)
ops/fairness-e2e/run.py --restore                    # crash recovery from snapshot
```

Exit code `0` = all passed, `1` = a check failed, `2` = setup/connectivity error.

## How it stays safe

It mutates the **`matt@test.local`** show to set up each scenario, so run it
against a **local dev DB only**. Before touching anything it snapshots every
field it changes to `.snapshot.json` (gitignored) and restores them on exit.
All simulated viewers use **TEST-NET-3** IPs (`203.0.113.0/24`); teardown purges
only `voteEvent` rows from that block, never real data.

If a run is killed mid-way, restore the original state with:

```bash
ops/fairness-e2e/run.py --restore
```

Avoid running it while you're actively editing the same show in the control
panel — both write to the same document.

## How it works

- **Setup state** is written straight to Mongo via `docker exec rf-mongo mongosh`
  (script on stdin, so large payloads don't hit the argv limit).
- **Actions** are real HTTP calls: `POST /remote-falcon-viewer/graphql` with a
  `CF-Connecting-IP` header to simulate viewer IPs, and
  `/remote-falcon-plugins-api/*` with a `showtoken` header to simulate the FPP.
- **Assertions** read back GraphQL responses (success vs the typed
  `StatusResponse` error) and Mongo state (queue length, `playingNow`,
  `voteEvent` counts).
