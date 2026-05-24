# account-archive-watchdog

Cluster-resident watchdog for the two `@Scheduled` jobs inside
`apps/account-archive/`. Pings Discord `#alerts` if either
`Finished archive process` or `Finished delete unverified shows process`
log line is absent from PostHog Logs over the last 25 hours.

This closes the gap that motivated
[issue-tracker#148](https://github.com/Remote-Falcon/remote-falcon-issue-tracker/issues/148):
the existing PostHog error-spike alerts catch loud failures, but a
silent scheduler stoppage (Quarkus `@Scheduled` thread dies, container
hits a startup loop, etc.) produces no logs and therefore no signal.
Both jobs delete customer data, so silent stoppage is high-impact.

Mirrors the `mongo-backup-watchdog` pattern: same Python-in-pod shape,
same image, same reused Secrets. The only substantive difference is the
upstream check — S3 `LastModified` for mongo-backup; PostHog Logs
search for account-archive.

## Architecture

```
            ┌──────────────────────────────────────────────────┐
            │ account-archive (Quarkus, 2x @Scheduled "24h")    │──→ stdout
            │  - runArchiveProcess()                            │     │
            │  - runDeleteUnverifiedShowsProcess()              │     ▼
            └──────────────────────────────────────────────────┘   OTel Collector
                                                                      │
                                                                      ▼
                                                                 PostHog Logs
                                                                      │
   14:05 UTC ┌──────────────────────────────────────────────┐         │
   (~09 CT)  │ account-archive-watchdog (CronJob)            │ ────────┘
             │  - /logs/count/ for both "Finished ..." lines │
             │    over last 25h                              │──→ Discord webhook (#alerts)
             │  - /logs/query/ for latest "Found N ..." tally│     - alert if missing
             │  - posts OK embed with tallies, or ALERT      │     - OK embed every day
             └──────────────────────────────────────────────┘
```

Schedule rationale: `5 14 * * *` (14:05 UTC) lands right after
`posthog-daily-digest` at 14:00 UTC so the daily Discord scroll has
both digest + watchdog side-by-side. The 25h window is the 24h
`@Scheduled` cadence plus a 1h buffer for tick drift.

## Cluster resources

| Resource | Source of truth | Notes |
|---|---|---|
| `CronJob/account-archive-watchdog` | `cronjob.yml` in this dir | Reconciled by the deploy workflow |
| `Secret/posthog-api-key` (key: `POSTHOG_API_KEY`) | GH repo secret `POSTHOG_API_KEY` | Shared with `posthog-daily-digest` — created by whichever workflow runs first |
| `Secret/discord-alerts-webhook` (key: `WEBHOOK`) | GH repo secret `DISCORD_ALERTS_WEBHOOK` | Shared with `mongo-backup-watchdog` + `posthog-daily-digest` |

Rotate either by updating the GH repo secret and re-running the deploy
workflow — do not edit the in-cluster Secret directly.

## Operating

**Trigger a check on demand** (e.g., after fixing a scheduler issue,
to confirm the watchdog now sees both completions):

```sh
kubectl create job --from=cronjob/account-archive-watchdog \
  watchdog-manual-$(date +%s) -n remote-falcon
kubectl logs -n remote-falcon -l app=account-archive-watchdog --tail=80
```

**Verify the Discord webhook is wired correctly** (one-time after first
deploy, or after rotating the webhook):

```sh
kubectl apply -f ops/k8s/account-archive-watchdog/test-ping.yml
# Watch for a test message in #alerts
kubectl delete -f ops/k8s/account-archive-watchdog/test-ping.yml
```

**Suspend the watchdog** (e.g., during a planned account-archive
maintenance window when jobs are intentionally disabled):

```sh
kubectl patch cronjob account-archive-watchdog -n remote-falcon \
  -p '{"spec":{"suspend": true}}'
```

Re-enable with `'{"spec":{"suspend": false}}'`.

**Inspect recent runs:**

```sh
kubectl get jobs -n remote-falcon -l app=account-archive-watchdog \
  --sort-by=.metadata.creationTimestamp | tail -5
```

## Local testing

`run-local.sh` extracts the inline Python script from `cronjob.yml`
and runs it in a local docker container against real PostHog data and
the real Discord webhook. Useful for iterating on the embed shape or
the search terms without shipping a deploy.

```sh
# Smoke check (will post the OK embed if both jobs completed in last 25h)
./ops/k8s/account-archive-watchdog/run-local.sh

# Force the alert path to verify Discord wiring end-to-end
WINDOW_HOURS=0 ./ops/k8s/account-archive-watchdog/run-local.sh

# Print embed payload without POSTing to Discord
./ops/k8s/account-archive-watchdog/run-local.sh --dry-print

# Send a synthetic ping without touching PostHog (useful after a webhook rotation)
./ops/k8s/account-archive-watchdog/run-local.sh test-ping
```

Requires `POSTHOG_API_KEY` and `DISCORD_ALERTS_WEBHOOK` in
`ops/.env.dev`. The script extracts the watchdog logic from
`cronjob.yml` so the two stay in sync.

## Tuning

| Knob | Where | Default |
|---|---|---|
| Window for "missing" check | `WINDOW_HOURS` env in `cronjob.yml` | 25 |
| Check cadence | `spec.schedule` in `cronjob.yml` | `5 14 * * *` UTC (daily) |
| Service name filter | `SERVICE_NAME` env in `cronjob.yml` | `remote-falcon-account-archive` |

If you change account-archive's `@Scheduled` cadence (currently
`every = "24h"` in `AccountArchiveService.java`), bump `WINDOW_HOURS`
to match (cadence + ~1h buffer) and consider adjusting the cron
schedule too.

## Rollback

```sh
kubectl delete -f ops/k8s/account-archive-watchdog/cronjob.yml
```

Disable the `Deploy account-archive-watchdog` GH workflow if you don't
want it recreating things on next push to the manifest path. Do **not**
delete the shared `posthog-api-key` or `discord-alerts-webhook`
Secrets — both are used by other watchdogs.

## Runbook

When the watchdog fires, the embed names which process(es) missed.
Check, in order:

1. **Is account-archive running?**
   `kubectl get pods -n remote-falcon -l app=remote-falcon-account-archive`
2. **Is the scheduler firing?** Look for any recent log lines from the
   service in PostHog Logs (`service.name = remote-falcon-account-archive`).
3. **Did the job error out?** Check PostHog error-spike alerts in
   `ops/posthog-alerts/alerts.yml` for matching `account-archive`
   entries.
4. **Manual retrigger:** rolling-restart the deployment to force the
   `@Scheduled` thread to re-arm:
   `kubectl rollout restart deploy/remote-falcon-account-archive -n remote-falcon`
