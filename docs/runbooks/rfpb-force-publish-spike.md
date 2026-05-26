# Runbook: rfpb-force-publish spike

**Signal:** PostHog Logs filter `attributes.marker == "RFPB_AUDIT" AND op == "page.update.force"`
**Severity:** P3 by default (informational); escalate to P2 if rate × duration suggests abuse rather than legitimate user behavior
**Owner:** Matt Shorts

## What this means

A user clicked "Overwrite anyway" in RFPB's conflict modal, which sends `PUT /v1/pages/{id}?force=true` and bypasses the ETag conditional-request check. Force-PUTs are a normal part of the RFPB conflict-resolution flow — they happen whenever a user edits in RFPB while a second tab (or a direct API client) also edited the same page.

A modest rate (a handful per show per day) is expected. What's NOT expected:

- **Spike from a single show** — could be a buggy RFPB client (re-sending publishes in a loop) or a user thrashing.
- **Spike from many shows simultaneously** — likely an RFPB-side bug just shipped (e.g., RFPB now always sends `force=true` regardless of conflict).
- **Spike paired with `op="page.update"` 412s dropping to zero** — RFPB is bypassing the ETag check unconditionally instead of using it as the normal path.

## Triage (first 5 min)

1. **Quantify the spike.** PostHog Logs query:

   ```hogql
   SELECT
     toStartOfMinute(timestamp) AS minute,
     extract(attributes_string, 'show="([^"]+)"') AS show_token,
     count() AS force_puts
   FROM logs
   WHERE timestamp >= now() - INTERVAL 1 HOUR
     AND attributes_string LIKE '%marker="RFPB_AUDIT"%'
     AND attributes_string LIKE '%op="page.update.force"%'
   GROUP BY minute, show_token
   ORDER BY force_puts DESC
   LIMIT 20
   ```

2. **Check the force-vs-normal ratio.** If `force=true` ≫ normal PUTs for a show, the client is broken.

   ```hogql
   SELECT
     extract(attributes_string, 'op="([^"]+)"') AS op,
     count() AS n
   FROM logs
   WHERE timestamp >= now() - INTERVAL 1 HOUR
     AND attributes_string LIKE '%marker="RFPB_AUDIT"%'
     AND attributes_string LIKE '%endpoint="/v1/pages/%'
   GROUP BY op
   ```

3. **Identify the impacted shows + the requesting client.** The `session_hash` field in the audit line correlates with the `RfpbSession` document. If many force-PUTs share one session_hash → one client; many session_hashes → broad-scope issue.

## Likely causes + actions

| Pattern | Likely cause | Action |
|---|---|---|
| Single show, sustained ~1/sec | Tab left open + a script in RFPB stuck retrying | Reach out to the show owner; have them close + reopen RFPB. Check RFPB-side logs for a publish-loop. |
| Many shows, started after recent RFPB deploy | RFPB regression sending `force=true` by default | Roll back the latest RFPB deploy or revert the offending RFPB commit. Coordinate with RFPB team. |
| Single show, paired with auth spikes (`v1.unauthorized`) | Attacker probing the bearer flow | Revoke the show's tokens via the RfpbSession document; rotate the show's launch key if applicable. |
| Spike accompanied by `v1.error` (500s) | Server-side bug in the force path | See `backend-error-spike.md`; check external-api logs for the stack trace. |

## What "normal" looks like

Steady-state (after RFPB has been in users' hands for ≥30 days): ~5–20 force-PUTs/day platform-wide, distributed across many shows, mostly correlated with user activity (evening hours US time zone). One force-PUT per show per editing session is typical.

## What NOT to do

- **Don't disable the force path.** The conflict-modal flow depends on it; users would be stuck unable to resolve any 412.
- **Don't rate-limit force more aggressively than normal PUTs.** The bucket is already per-bearer (60/min, 600/hr); a misbehaving client is already capped.
- **Don't roll back the RF external-api.** The force path is correct on our side; bugs almost always originate in RFPB.

## Related

- `docs/SERVICES.md` § "remote-falcon-external-api / `/v1/**`"
- `apps/external-api/.../service/PageApiService.java` `updatePage(... boolean force)`
- `apps/external-api/.../controller/PagesController.java` `updatePage(... @RequestParam force ...)`
- Commit `ccb8ead` — the force-PUT fix that introduced this opcode
