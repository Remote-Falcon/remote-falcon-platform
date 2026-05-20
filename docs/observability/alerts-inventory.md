# Alerts inventory

One-page map of every Remote Falcon alert: what it watches, where it
lives, where it fires, and the runbook to consult when it does.

## Routing

All alerts route to **Discord `#alerts`** via the
`DISCORD_ALERTS_WEBHOOK` env var (stored in `ops/.env.dev` locally;
present as repo secret `DISCORD_ALERTS_WEBHOOK` for CI; mirrored into
the cluster as the `discord-alerts-webhook` k8s Secret for the
mongo-backup-watchdog CronJob).

Discord exposes a Slack-compatible endpoint at `<webhook_url>/slack`,
which lets DO Monitoring's Slack-format payloads route to the same
channel without a relay function. PostHog hits the webhook URL
directly.

## Alert table

| Alert | Type | Source | Detects | Severity | Runbook |
|---|---|---|---|---|---|
| `mongo-backup-stale` | k8s CronJob | [`ops/k8s/mongo-backup-watchdog/`](../../ops/k8s/mongo-backup-watchdog/) | Newest backup in `s3://rf-mongo-backup/mongo-backups/` older than 36h | P2 | [`mongo-backup-stale.md`](../runbooks/mongo-backup-stale.md) |
| `rf-mongo-backup-failure` | PostHog log alert | [`ops/posthog-alerts/`](../../ops/posthog-alerts/) | `remote-falcon-mongo-backup` logs "Failed to complete MongoDB backup" | P2 | [`mongo-backup-failure.md`](../runbooks/mongo-backup-failure.md) |
| `rf-backend-error-spike` | PostHog log alert | [`ops/posthog-alerts/`](../../ops/posthog-alerts/) | ≥20 ERROR/FATAL logs across backend services in 5min | P2 | [`backend-error-spike.md`](../runbooks/backend-error-spike.md) |
| `rf-doks-node-cpu-high` | DO Monitoring | [`ops/do-monitoring/`](../../ops/do-monitoring/) | DOKS worker node CPU > 85% for 10min | P2 | [`doks-node-cpu-high.md`](../runbooks/doks-node-cpu-high.md) |
| `rf-doks-node-memory-high` | DO Monitoring | [`ops/do-monitoring/`](../../ops/do-monitoring/) | DOKS worker node memory > 90% for 10min | **P1** | [`doks-node-memory-high.md`](../runbooks/doks-node-memory-high.md) |
| `rf-doks-node-disk-high` | DO Monitoring | [`ops/do-monitoring/`](../../ops/do-monitoring/) | DOKS worker node disk > 80% for 10min | P2 | [`doks-node-disk-high.md`](../runbooks/doks-node-disk-high.md) |

(Existing DO Monitoring DB alerts — DB-CPU, DB-memory, DB-disk — route
email-only and are not managed by `ops/do-monitoring/apply.sh`. Move
them into that file if you want them routed to Discord too.)

## Layered coverage — mongo-backup specifically

mongo-backup gets two complementary alerts because the failure modes
are different:

```
                       ┌─ Backup logs "Failed..."   →  rf-mongo-backup-failure
                       │   (catches in-flight failures, minutes)
mongo-backup run ──────┤
                       │
                       └─ No new S3 object after 36h  →  mongo-backup-stale
                           (catches crashes-before-logging, ~36h)
```

The watchdog (S3 ground truth) is slower but catches the "didn't even
log" cases. The log alert (PostHog) is fast but only fires if the app
managed to write its catch-block log line. Keep both.

## How changes get made

| Surface | Source of truth | Apply mechanism |
|---|---|---|
| Watchdog | [`ops/k8s/mongo-backup-watchdog/cronjob.yml`](../../ops/k8s/mongo-backup-watchdog/cronjob.yml) | `.github/workflows/deploy-mongo-backup-watchdog.yml` on push to main |
| PostHog alerts | [`ops/posthog-alerts/alerts.yml`](../../ops/posthog-alerts/alerts.yml) | `./ops/posthog-alerts/apply.sh --apply` (local run) |
| PostHog destinations | (manual, one-time per alert) | PostHog UI — Personal API Keys can't create destinations |
| DO Monitoring | [`ops/do-monitoring/alerts.yml`](../../ops/do-monitoring/alerts.yml) | `./ops/do-monitoring/apply.sh --apply` (local run) |
| OTel collector enrichment | [`ops/k8s/otel-collector/configmap.yml`](../../ops/k8s/otel-collector/configmap.yml) | `.github/workflows/deploy-collector.yml` on push to main |

## Drift detection

Run apply scripts in dry-run mode to surface drift between repo state
and remote state:

```sh
./ops/posthog-alerts/apply.sh         # PostHog
./ops/do-monitoring/apply.sh          # DO Monitoring
```

Any `[CREATE]`, `[UPDATE]`, or `[REMOTE-ONLY]` lines = drift. PostHog
destination drift is read-blocked by Personal API Keys; check the
PostHog UI directly.

## Adding a new alert

1. Pick the right system (PostHog for log-derived, DO Monitoring for
   node/droplet metrics, k8s CronJob for things that need to query
   external state like S3).
2. Add an entry to the matching `alerts.yml`.
3. Write a runbook stub under `docs/runbooks/` referenced from the
   `runbook:` field.
4. Apply via the appropriate `apply.sh --apply`.
5. (PostHog only) Attach the Discord destination in the UI.
6. Add a row to the table above in this file.

## Not yet covered

These are known gaps; file an issue if any becomes a blocker:

- **Pod crashloop / OOMKill** — DO Monitoring is node-level only.
  Could be added as a PostHog log alert on `OOMKilled` k8s events if we
  ship cluster events to the collector (not currently wired).
- **Frontend JS error spike** — PostHog has native Error Tracking
  alerts but they're configured via a different UI path; if/when we
  want it as code, file an issue.
- **Cluster autoscaler failures** — DO Monitoring doesn't have a
  native alert type for this.
- **CI deploy failures** — GH Actions can post to Discord directly via
  workflow steps; not centralized through this inventory yet.
