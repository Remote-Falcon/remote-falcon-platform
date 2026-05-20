# mongo-backup-watchdog

Cluster-resident watchdog for the daily MongoDB backup. Pings Discord
`#alerts` when the newest backup object in DO Spaces is older than the
threshold.

This replaces the earlier GH Actions cron approach so the alert lives
in the same place as the thing it monitors and shares the same DO
Spaces credentials (`do-s3` Secret) that the `mongo-backup` Deployment
already pulls from.

## Architecture

```
            ┌──────────────────────────────────────┐
   12:00 CT │ mongo-backup (Deployment, @Scheduled)│──→ s3://rf-mongo-backup/mongo-backups/*.gz
            └──────────────────────────────────────┘
   20:00 UTC ┌─────────────────────────────────────┐
   (~14CT)  │ mongo-backup-watchdog (CronJob)      │──→ Discord webhook (#alerts)
            │  - lists newest object               │     (only when stale)
            │  - alerts if LastModified > 36h ago  │
            └─────────────────────────────────────┘
```

Schedule rationale: backup cadence is 24h. Checking once daily, ~2h
after the expected backup window, gives same-day detection on a missed
run while keeping the watchdog quiet. With a 36h threshold, even a
missed-check + missed-backup combination stays inside the alert window.

## Cluster resources

| Resource | Source of truth | Notes |
|---|---|---|
| `CronJob/mongo-backup-watchdog` | `cronjob.yml` in this dir | Reconciled by the deploy workflow |
| `Secret/discord-alerts-webhook` (key: `WEBHOOK`) | GH repo secret `DISCORD_ALERTS_WEBHOOK` | Created + updated by the deploy workflow on every run |
| `Secret/do-s3` | Pre-existing (also used by `mongo-backup`) | Provides `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |

Rotate the Discord webhook by updating the GH repo secret and re-running
the deploy workflow — do not edit the in-cluster Secret directly.

## Operating

**Trigger a check on demand** (e.g., after running a manual backup, to
confirm the watchdog is happy now):

```sh
kubectl create job --from=cronjob/mongo-backup-watchdog \
  watchdog-manual-$(date +%s) -n remote-falcon
kubectl logs -n remote-falcon -l app=mongo-backup-watchdog --tail=50
```

**Verify the Discord webhook is wired correctly** (one-time after first
deploy, or after rotating the webhook):

```sh
kubectl apply -f ops/k8s/mongo-backup-watchdog/test-ping.yml
# Watch for a test message in #alerts
kubectl delete -f ops/k8s/mongo-backup-watchdog/test-ping.yml
```

**Suspend the watchdog** (e.g., during a planned maintenance window
where backups will intentionally be missed):

```sh
kubectl patch cronjob mongo-backup-watchdog -n remote-falcon \
  -p '{"spec":{"suspend": true}}'
```

Re-enable with `'{"spec":{"suspend": false}}'`.

**Inspect recent runs:**

```sh
kubectl get jobs -n remote-falcon -l app=mongo-backup-watchdog \
  --sort-by=.metadata.creationTimestamp | tail -5
```

## Local testing

`run-local.sh` extracts the inline shell script from `cronjob.yml` and
runs it in a local docker container against the real prod bucket and
Discord webhook. Useful for validating changes to the script without
shipping a deploy.

```sh
# Smoke check (will not alert if the backup is fresh)
./ops/k8s/mongo-backup-watchdog/run-local.sh

# Force the alert path to verify Discord wiring end-to-end
THRESHOLD_HOURS=0 ./ops/k8s/mongo-backup-watchdog/run-local.sh

# Send a synthetic ping without touching S3 (useful for verifying
# only the webhook URL, e.g., after a rotation)
./ops/k8s/mongo-backup-watchdog/run-local.sh test-ping
```

Requires `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
`DISCORD_ALERTS_WEBHOOK` in `ops/.env.dev`. The script extracts the
watchdog logic from `cronjob.yml` so the two stay in sync.

## Tuning

| Knob | Where | Default |
|---|---|---|
| Threshold for "stale" | `THRESHOLD_HOURS` env in `cronjob.yml` | 36 |
| Check cadence | `spec.schedule` in `cronjob.yml` | `0 20 * * *` UTC (daily) |
| Bucket / prefix / endpoint | env vars in `cronjob.yml` | matches mongo-backup k8s manifest |

If you change the mongo-backup cron (`backup.cron` in
`apps/mongo-backup/src/main/resources/application.properties`), bump
the watchdog schedule and threshold to match.

## Rollback

```sh
kubectl delete -f ops/k8s/mongo-backup-watchdog/cronjob.yml
kubectl delete secret discord-alerts-webhook -n remote-falcon
```

Disable the `Deploy mongo-backup-watchdog` GH workflow if you don't
want it recreating things on next push to the manifest path.

## Runbook

When the watchdog fires: [docs/runbooks/mongo-backup-stale.md](../../../docs/runbooks/mongo-backup-stale.md)
