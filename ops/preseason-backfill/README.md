# Preseason broadcast audience backfill (PRD-013 P0-6a)

Opts existing shows into marketing email **in both places that matter**:
`Show.marketingOptIn` in Mongo, and the PostHog person properties the
broadcast's batch audience actually filters on.

## Why both

The UI writes `email` / `marketingOptIn` / `lastLoginDate` onto the
PostHog person at sign-in, keyed on `showSubdomain`
(`apps/ui/src/contexts/JWTContext.jsx`). Nothing else does. So flipping
the Mongo flag alone would let the audience fill one login at a time over
a season instead of before the send — on 2026-08-21 it stood at **31
persons against 2628 shows**.

## Waves

`mail.remotefalcon.com` has almost no sending history, and 2600 cold
addresses in one dispatch is how a domain lands in spam for the season.
The script orders the eligible set by sign-in recency and stamps
`preseasonWave` in size chunks, so each dispatch is roughly double the
last — a warming ramp:

| wave | size (2026-08-22) | who |
|------|-------------------|-----|
| 1    | 500  | most recent sign-ins |
| 2    | 1000 | next most recent |
| 3    | 1115 | the rest, coldest last (no recorded sign-in sorts here) |

Date buckets were the first cut and were wrong for this: 6–18 months back
swallows a whole season, which put 1485 of 2615 in one middle wave — a
blast with two small bookends rather than a ramp.

Dispatch one wave at a time by setting the broadcast's batch filter to
`marketingOptIn = true AND preseasonWave = N`, and check bounces and
complaints between waves. An explicit wave number keeps the waves
disjoint; a `lastLoginDate` range filter could overlap and send twice.

## Consent

Only shows that were **never asked** (`marketingOptIn` null/missing) are
written. An explicit `false` is a recorded decline and is never touched,
by this script or by the audience filter. Eligibility also requires a
verified email.

## Running it

Dry run first — it prints eligibility and per-wave counts and writes
nothing:

```bash
kubectl -n remote-falcon delete job preseason-backfill --ignore-not-found
kubectl -n remote-falcon create configmap preseason-backfill \
  --from-file=backfill.py=ops/preseason-backfill/backfill.py \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n remote-falcon apply -f ops/preseason-backfill/job.yml
kubectl -n remote-falcon logs -f job/preseason-backfill
```

A completed Job is immutable and an updated ConfigMap does not reach a
pod that already ran, so re-running always means deleting the Job and
re-applying both.

`MONGO_URI` does not carry a database name — the services set it
separately (`quarkus.mongodb.database=remote-falcon`), so the script
targets `remote-falcon` explicitly (override with `MONGO_DB`) and exits
non-zero if `show` is empty rather than reporting zero eligible shows.

To write, set `ARGS` in [job.yml](job.yml) (`--apply-mongo`, then
`--apply-mongo --apply-posthog`), delete the completed Job, and re-apply.

PostHog ingest is asynchronous. Re-count the audience before dispatching:

```sql
SELECT toString(properties.preseasonWave) AS wave, count()
FROM persons WHERE toString(properties.marketingOptIn) = 'true' GROUP BY wave
```

## Related

- PRD-remote-falcon-013 (Obsidian) — broadcast runbook and send gating
- [../posthog-workflows](../posthog-workflows) — template wiring and text sync
