# Runbook: daily PostHog digest issues

**Source:** [`ops/k8s/posthog-daily-digest/`](../../ops/k8s/posthog-daily-digest/)
**Schedule:** daily at 14:00 UTC (~09:00 America/Chicago)
**Posts to:** Discord `#alerts`

This runbook covers two flavors of issue:
1. The digest **didn't post** at all.
2. The digest **posted but with red color** (mongo-backup missing).

## A. Digest didn't post

### Triage

1. **Find the most recent Job:**

   ```sh
   kubectl get jobs -n remote-falcon -l app=posthog-daily-digest \
     --sort-by=.metadata.creationTimestamp | tail -3
   ```

2. **Check the Job's exit state + logs:**

   ```sh
   kubectl logs -n remote-falcon -l app=posthog-daily-digest --tail=80
   ```

   Common failure modes:

   | Log content | Cause | Fix |
   |---|---|---|
   | `POSTHOG_API_KEY env var missing` | Secret didn't get created/applied | Re-run `Deploy posthog-daily-digest` workflow; confirm `POSTHOG_API_KEY` repo secret is set |
   | `403: API key missing required scope 'query:read'` | API key scopes changed/insufficient | Refresh the key with `insight:read`, `insight:write`, `dashboard:read`, `dashboard:write`, `query:read` scopes |
   | `500: ClickHouse error` | Bad HogQL query (likely from a recent change) | Test the failing query via PostHog SQL editor + iterate |
   | `Discord POST failed: HTTP Error 403` | Discord webhook revoked/rotated | Update `DISCORD_ALERTS_WEBHOOK` repo secret; re-deploy |
   | Nothing — Job never created | CronJob suspended or schedule wrong | `kubectl get cronjob posthog-daily-digest -n remote-falcon -o yaml \| grep -E "suspend\|schedule"` |

3. **Force a manual run** to recover and confirm fix:

   ```sh
   kubectl create job --from=cronjob/posthog-daily-digest \
     digest-manual-$(date +%s) -n remote-falcon
   kubectl logs -n remote-falcon -l app=posthog-daily-digest -f
   ```

## B. Digest posted but color is red

Red color = yesterday's mongo-backup completion count is 0. This duplicates the [mongo-backup-stale](./mongo-backup-stale.md) alert's signal — the watchdog should also have fired (or will fire by 20:00 UTC).

### Triage

1. **Cross-check with the watchdog:**

   ```sh
   kubectl get jobs -n remote-falcon -l app=mongo-backup-watchdog \
     --sort-by=.metadata.creationTimestamp | tail -3
   kubectl logs -n remote-falcon -l app=mongo-backup-watchdog --tail=30
   ```

2. **Follow the [mongo-backup-stale runbook](./mongo-backup-stale.md)** — it's the primary handler for this failure mode.

3. The digest will auto-recover the next day once a backup runs. No action on the digest itself.

## C. Digest is amber

Amber = errors OR exceptions > 50% above last-week baseline. Not necessarily a P2 — could be:
- A real regression you should investigate (cross-reference [`backend-error-spike`](./backend-error-spike.md))
- A traffic-driven anomaly (more users → more errors, proportional)
- A day-of-week mismatch (comparing yesterday to a slow Sunday vs. an active Monday baseline)

The digest is a **trend signal**, not an alert. The corresponding alerts (mongo-backup-failure, backend-error-spike, frontend JS errors via PostHog Error Tracking) are what page you in real time.

## Tuning

- **Schedule:** [`ops/k8s/posthog-daily-digest/cronjob.yml`](../../ops/k8s/posthog-daily-digest/cronjob.yml) `spec.schedule` — currently `0 14 * * *` UTC.
- **What's reported:** edit the Python script inside `cronjob.yml` — Backend / Frontend sections + query fields are all visible in the inline script.
- **Color thresholds:** `errors_up` / `exceptions_up` boolean logic in the same script (currently 50% above baseline = amber).

## Suspending the digest

For known-quiet periods (e.g., maintenance windows) where you'd rather not get a noisy red ping:

```sh
kubectl patch cronjob posthog-daily-digest -n remote-falcon \
  -p '{"spec":{"suspend": true}}'
# Re-enable
kubectl patch cronjob posthog-daily-digest -n remote-falcon \
  -p '{"spec":{"suspend": false}}'
```
