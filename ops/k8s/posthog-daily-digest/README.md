# posthog-daily-digest

Cluster-resident CronJob that posts a daily health digest to Discord
`#alerts` at 14:00 UTC (~09:00 America/Chicago). Compares yesterday's
metrics to the same day of the prior week.

This replaces what would naturally be a PostHog Subscription, since
subscriptions require a paid PostHog plan (free tier returns
`402 Payment Required`).

## What's in the digest

Each embed has two sections:

**Backend** (from PostHog Logs)
- Total error/fatal log count + delta vs last week
- Total log volume + delta vs last week
- mongo-backup successful completion count for yesterday (should be 1)

**Frontend** (from PostHog events via HogQL)
- `$pageview` count + delta vs last week
- `$exception` count + delta vs last week

Color coding:
- Green: backup succeeded, no metric > 50% above baseline
- Amber: backup succeeded but errors or exceptions > 50% over baseline
- Red: backup did NOT run yesterday (data-loss risk)

## Cluster resources

| Resource | Source of truth | Notes |
|---|---|---|
| `CronJob/posthog-daily-digest` | `cronjob.yml` | Reconciled by deploy workflow |
| `Secret/posthog-api-key` (key: `POSTHOG_API_KEY`) | GH repo secret `POSTHOG_API_KEY` | Created by `deploy-daily-digest.yml`; same secret used by `ops/release-validation/` |
| `Secret/discord-alerts-webhook` (key: `WEBHOOK`) | GH repo secret `DISCORD_ALERTS_WEBHOOK` | Shared with `mongo-backup-watchdog` — created by either workflow that runs first |

Rotate by updating the GH repo secret + re-running the deploy workflow.

## Operating

**Trigger a manual run** (debug, or to confirm a config change):

```sh
kubectl create job --from=cronjob/posthog-daily-digest \
  digest-manual-$(date +%s) -n remote-falcon
kubectl logs -n remote-falcon -l app=posthog-daily-digest --tail=80
```

**Local development** (without touching the cluster):

```sh
set -a; source ops/.env.dev; set +a
./ops/k8s/posthog-daily-digest/run-local.sh
```

`run-local.sh` extracts the inline Python script from `cronjob.yml` and
runs it in a local docker container — same image, same code path that
runs in cluster, against real PostHog data + Discord. Useful for
iterating on the embed format.

For development without spamming Discord:

```sh
./ops/k8s/posthog-daily-digest/run-local.sh --dry-print
```

(Sends the embed to a bogus URL; useful when you only care about the
script logs.)

**Suspend** (during a planned outage window):

```sh
kubectl patch cronjob posthog-daily-digest -n remote-falcon \
  -p '{"spec":{"suspend": true}}'
```

## Tuning

- **Schedule:** `spec.schedule` in `cronjob.yml` — currently `0 14 * * *` UTC.
- **Date math:** the script computes "yesterday" and "same day last week" in UTC. If you'd rather align to local time, edit the script's `datetime.now(timezone.utc)` and `today_midnight` logic.
- **Color thresholds:** "errors > 50% above baseline = amber" is hard-coded in the embed-color logic. Edit `errors_up` / `exceptions_up` in the script if you want a different threshold.
- **What gets reported:** Backend/Frontend sections are the v1 set. To add (e.g., DOKS node CPU averages), append to the script's query + embed `fields` list.

## Rollback

```sh
kubectl delete -f ops/k8s/posthog-daily-digest/cronjob.yml
```

Disable the `Deploy posthog-daily-digest` workflow if you don't want it
recreating things on next push.

## Runbook

When the digest stops posting or shows persistently bad metrics:
[docs/runbooks/daily-digest.md](../../../docs/runbooks/daily-digest.md)
