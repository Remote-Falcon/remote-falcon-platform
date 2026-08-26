# Unsubscribe write-back (PRD-013)

Corrects `Show.marketingOptIn` in Mongo when someone unsubscribes in
PostHog, and stops the drip enrolling them.

## Why this exists

Consent only ever flowed one way. [`../preseason-backfill`](../preseason-backfill)
pushes `marketingOptIn` from Mongo into PostHog, and the UI re-pushes it
at every sign-in (`apps/ui/src/contexts/JWTContext.jsx`). Nothing came
back. So an operator who clicks unsubscribe is recorded in PostHog and
suppressed from future sends, while our own database still says `true`.

That gap is invisible until the audience is rebuilt from Mongo. The
backfill reads `marketingOptIn: null` as "never asked" and stamps it
true, and an unsubscribed show whose flag was never corrected looks
exactly like one that was never asked. The next campaign re-stamps it,
re-pushes it, and mails someone who opted out. PostHog's suppression list
is the only thing preventing that today, and it is not a control we own —
it also silently absorbs the mistake rather than surfacing it.

Two places get corrected, matching the two the backfill writes:

1. **Mongo** — `marketingOptIn=false`. That is the value the backfill's
   eligibility query already excludes (`"$ne": False`), so a corrected
   record stays corrected through every later run.
2. **PostHog person** — `marketingOptIn=false` keyed on `showSubdomain`,
   so the drip's trigger filter (`person.marketingOptIn = true`) stops
   enrolling them. Skip this and they keep enrolling and keep getting
   suppressed at send time: invisible failed runs instead of a clean
   exclusion.

## Unsubscribes vs bounces

PostHog keeps two separate lists, and they mean different things:

| List | API | What it is |
|------|-----|------------|
| Opt-outs | `messaging_preferences/opt_outs/` | The recipient asked to stop. A consent decision. |
| Suppressions | `messaging_suppressions/suppressions/` | PostHog stopped sending because mail hard-bounced. A deliverability fact. |

Only the first is consent, so only the first writes to `marketingOptIn`
by default. Bounces are counted and listed on every run, and
`--apply-bounces` opts into revoking them too — worth doing before a
campaign so dead addresses stop being re-stamped into waves, but it is a
deliverability call and deliberately not the default. An address on both
lists is treated as an unsubscribe.

Reading the **lists** rather than the `$workflows_email_unsubscribed`
event stream is deliberate: the list is current state and survives event
retention, so a show that unsubscribed last season is still corrected by
a run made today.

## Running it

Dry run first — it prints every address it matched and what it would
change, and writes nothing:

```bash
kubectl -n remote-falcon delete job consent-writeback --ignore-not-found
kubectl -n remote-falcon create configmap consent-writeback \
  --from-file=writeback.py=ops/consent-writeback/writeback.py \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n remote-falcon apply -f ops/consent-writeback/job.yml
kubectl -n remote-falcon logs -f job/consent-writeback
```

To write, set `ARGS` in [job.yml](job.yml) to
`--apply-mongo --apply-posthog`, delete the completed Job, and re-apply.
A completed Job is immutable and an updated ConfigMap does not reach a
pod that already ran, so re-running always means deleting the Job and
re-applying both.

Unlike the backfill, this is safe to re-run: every write is an idempotent
`$set` to a fixed value, and a run re-reads the list rather than
replaying a cursor. `backoffLimit: 2` reflects that.

`MONGO_URI` carries no database name — the services set it separately
(`quarkus.mongodb.database=remote-falcon`), so the script targets
`remote-falcon` explicitly (override with `MONGO_DB`) and exits non-zero
if `show` is empty rather than reporting nothing to correct.

The personal API key needs **`hog_flow:read`**. That single scope governs
`messaging_preferences` and `messaging_suppressions` as well as
`hog_flows` — there is no separate messaging scope. A 403 is almost
always the missing scope; the script says so and links the key settings
page. It reads the in-cluster secret `posthog-api-key`.

## Manual process, until this is scheduled

Run the same Job by hand after any send, and any time you notice
unsubscribes coming in. The dry run is cheap and safe, so the habit is:
dry run, read the list, then apply.

Cadence that matches how the data actually moves:

- **After each campaign wave**, once sends have drained. Most
  unsubscribes arrive within hours of a send.
- **Before any run of `../preseason-backfill`**, without exception. The
  backfill is the thing that would re-stamp an uncorrected show, so
  running the write-back first is what makes the backfill safe. Consider
  `--apply-bounces` here too, so dead addresses do not get re-waved.

To check the current gap without touching anything, this counts
unsubscribed addresses that Mongo still records as opted in:

```
SELECT count() FROM persons
WHERE toString(properties.marketingOptIn) = 'true'
  AND lower(toString(properties.email)) IN (<addresses from opt_outs>)
```

The authoritative list is always the API, not that query — the person
property is itself downstream of the same drift this job exists to fix.

## Scheduling it later

Nothing here is stateful, so this becomes a `CronJob` by wrapping the
same pod spec and setting `ARGS` to the apply form. Daily is plenty:
unsubscribes are low-volume and PostHog suppresses sends in the meantime,
so the write-back is about keeping our own record honest rather than
preventing a send. The one hard requirement is ordering — it must run
before any backfill, not on an independent schedule that might interleave.

## Related

- PRD-remote-falcon-013 (Obsidian) — consent model and broadcast runbook
- [`../preseason-backfill`](../preseason-backfill) — the outbound half this corrects
- [`../posthog-workflows`](../posthog-workflows) — drip and broadcast template wiring
