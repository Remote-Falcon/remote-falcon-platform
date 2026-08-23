# Runbook: doc-size-alarm (PostHog log alert)

**Alert source:** PostHog log alert `rf-doc-size-alarm` ([source](../../ops/posthog-alerts/alerts.yml))
**Fires on:** ≥1 WARN log from `remote-falcon-control-panel` containing `"DOC_SIZE_ALARM"` in any 60min window
**Severity:** P2 (one show's operations degrade; whole-platform impact only if ignored long enough for the doc to hit 16 MB)
**Cooldown:** 720min — the sweep runs once daily (09:00 UTC), so one run notifies once

## What it means

The nightly `alarmOnOversizedShows()` sweep (control-panel
`ScheduledTaskService`) flagged at least one Show document that is either:

- **~12 MB+ estimated** — approaching MongoDB's hard 16 MB document cap. A doc
  over the cap becomes unreadable/unwritable: that show's account is bricked.
- **> 1,000 `votes` entries** (fleet norm 0–6) — the whale-votes pattern from
  the 2026-08-22 shortslights incident: stale (mostly `systemInjected` PSA)
  votes stranded on the document. Every read and every save on that show moves
  the whole array, so the operator experiences "everything is slow."

The log line names the show: `DOC_SIZE_ALARM show '<subdomain>' (<token>) ...`
with either the estimated MB or the votes count.

## Triage

1. **Read the flagged show(s)** from the alert body or:

   ```sh
   kubectl logs -n remote-falcon -l app=remote-falcon-control-panel \
     --since=24h | grep DOC_SIZE_ALARM
   ```

2. **Votes-whale variant** (`has N votes entries`):
   - The nightly retention sweep expires votes older than 24h, so a *growing*
     count here means active regrowth — something is appending faster than
     expiry. Immediate mitigation: the show operator (or admin) runs
     **Reset all votes** from the command palette (works in both viewer
     control modes).
   - Then identify the writer: PSA/leader injection in plugins-api
     (`PluginService`) appends `systemInjected` votes; if no plugin is
     consuming the queue they only leave via reset or expiry.

3. **Size variant** (`is ~N MB estimated`):
   - Identify which array is heavy — run the read-only probe
     (`ops/preseason-backfill/` job pattern; probe script in the 2026-08-22
     session notes) or aggregate `$size` per array on that show.
   - `stats.*` heavy → confirm the nightly sweep is running (log line
     `"Stats retention sweep complete"`) and that the show isn't excluded by
     an error (sweep logs per-show failures and continues).
   - `pages` heavy → operator has very large page HTML; that's legitimate
     content — talk to the operator.

4. **Verify the fix**: the alarm sweeps daily; the flagged show should be
   absent from the next 09:00 UTC run's `DOC_SIZE_ALARM` lines
   (`"Document-size alarm sweep complete: 0 show(s) flagged"`).

## Relationship to other safeguards

| Safeguard | Covers | Where |
|---|---|---|
| **This alert** | Detection: names the show before it bricks | PostHog log alert |
| Nightly retention sweep | Prevention: 18-month stats retention, 24h votes expiry, viewerSessions trim | control-panel `purgeStaleStatsForAllShows` |
| Viewer `$slice` hard cap | Prevention: stat arrays capped at 50,000 entries per array | viewer `ShowRepository.pushStatCapped` |
| ~~`$bsonSize` check~~ | Dead on DO Managed Mongo 8.0 (returns null) — replaced by the weighted estimate in `alarmOnOversizedShows` | — |
