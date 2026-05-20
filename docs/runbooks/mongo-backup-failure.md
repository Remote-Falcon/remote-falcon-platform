# Runbook: mongo-backup-failure (PostHog log alert)

**Alert source:** PostHog log alert `rf-mongo-backup-failure` ([source](../../ops/posthog-alerts/alerts.yml))
**Fires on:** ≥1 ERROR/FATAL log from `remote-falcon-mongo-backup` containing `"Failed to complete MongoDB backup"` in any 5min window
**Severity:** P2 (in-flight backup failure; data-loss risk if not investigated)
**Cooldown:** 60min between repeat notifications

## Relationship to other alerts

| Alert | Detects | Latency |
|---|---|---|
| **mongo-backup-failure** (this one) | The app *logged* a failure during the run | minutes |
| [mongo-backup-stale](./mongo-backup-stale.md) | No fresh object in S3 after 36h | up to 36h |

This one catches in-flight failures fast. The watchdog catches "didn't
even log" failures (crash before catch block, pod evicted, etc.). Both
must stay enabled.

## Triage

1. **Find the failure log + stack trace:**

   ```sh
   kubectl logs -n remote-falcon -l app=remote-falcon-mongo-backup \
     --tail=300 --since=15m | grep -A 30 "Failed to complete MongoDB backup"
   ```

2. **Read the underlying exception** — typical causes:
   - `MongoSocketException` / `MongoTimeoutException` → DB connectivity (check `do-mongo` managed DB status)
   - `OutOfMemoryError` → dump exceeded pod memory limit (raise limit in `apps/mongo-backup/k8s/manifest.yml`)
   - `software.amazon.awssdk.services.s3.model.S3Exception` 5xx → DO Spaces issue (status.digitalocean.com)
   - `InvalidAccessKeyId` → `do-s3` Secret rotated incorrectly

3. **Check pod state:**

   ```sh
   kubectl get pods -n remote-falcon -l app=remote-falcon-mongo-backup
   kubectl describe pod -n remote-falcon -l app=remote-falcon-mongo-backup | tail -40
   ```

## Recovery

Manual backup trigger (same endpoint the watchdog runbook uses):

```sh
TOKEN=$(kubectl get secret mongo-backup-auth-token -n remote-falcon -o jsonpath='{.data.BACKUP_AUTH_TOKEN}' | base64 -d)
kubectl port-forward -n remote-falcon svc/remote-falcon-mongo-backup 8085:8080 &
curl -X POST -H "X-Backup-Token: $TOKEN" \
  http://localhost:8085/remote-falcon-mongo-backup/backup/trigger
```

200 OK = recovery successful. The 36h watchdog clock effectively resets.

## Tuning

- Threshold and filters live in [ops/posthog-alerts/alerts.yml](../../ops/posthog-alerts/alerts.yml).
- Apply changes via `./ops/posthog-alerts/apply.sh --apply` (see that
  directory's README).
- The current threshold of 1 in 5min is intentionally aggressive — any
  logged backup failure is investigatable. Don't raise this.
