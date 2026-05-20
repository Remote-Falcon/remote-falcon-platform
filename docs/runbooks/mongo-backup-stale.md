# Runbook: mongo-backup is stale

**Alert source:** `CronJob/mongo-backup-watchdog` in the `remote-falcon` namespace ([ops/k8s/mongo-backup-watchdog/](../../ops/k8s/mongo-backup-watchdog/))
**Where it fires:** Discord `#alerts` (via in-cluster `discord-alerts-webhook` Secret, sourced from the `DISCORD_ALERTS_WEBHOOK` GH repo secret)
**Severity:** P2 (data-loss risk; not customer-facing immediately)
**Backup schedule:** daily at 12:00 America/Chicago
**Watchdog schedule:** daily at 20:00 UTC (~2h after the backup window)

## What this means

The newest object in `s3://rf-mongo-backup/mongo-backups/*.gz` is older than 36 hours. The daily Mongo dump either didn't run, didn't finish, or finished but failed to upload.

## Triage (5-10 min)

1. **Confirm the alert** — pull the most recent watchdog Job's logs:

   ```sh
   kubectl get jobs -n remote-falcon -l app=mongo-backup-watchdog \
     --sort-by=.metadata.creationTimestamp | tail -3
   kubectl logs -n remote-falcon -l app=mongo-backup-watchdog --tail=80
   ```

   The script prints the newest key + age + threshold before posting.

2. **Check pod state:**

   ```sh
   kubectl get pods -n remote-falcon -l app=remote-falcon-mongo-backup
   kubectl describe pod -n remote-falcon -l app=remote-falcon-mongo-backup | tail -40
   ```

   Look for: CrashLoopBackOff, OOMKilled, image pull errors, restart count climbing.

3. **Check recent logs:**

   ```sh
   kubectl logs -n remote-falcon -l app=remote-falcon-mongo-backup --tail=200 --since=48h
   ```

   Search for:
   - `Running MongoDB backup process` — confirms scheduler fired
   - `MongoDB backup completed successfully` — confirms upload succeeded
   - `Failed to complete MongoDB backup` — exception was thrown; stack trace follows
   - Connection errors against Mongo or S3

4. **Check S3 directly:**

   ```sh
   aws --endpoint-url https://nyc3.digitaloceanspaces.com s3 ls \
     s3://rf-mongo-backup/mongo-backups/ --recursive | sort | tail -10
   ```

   Confirms what the watchdog saw and whether anything has arrived since.

## Common causes

| Symptom | Likely cause | Fix |
|---|---|---|
| Scheduler never fired (no "Running MongoDB backup process" log in last 36h) | Pod was unhealthy / not running when cron tick hit | Check pod events; restart with `kubectl rollout restart deployment/remote-falcon-mongo-backup -n remote-falcon` |
| "Running..." log but no "completed successfully" | Job crashed mid-run; check stack trace | Common: Mongo connection drop, out-of-memory during dump, S3 5xx |
| Pod is CrashLoopBackOff | Misconfig (bad MONGO_URI, missing secret) or image issue | `kubectl describe pod` → events; verify `mongodb-connection`, `do-s3`, `mongo-backup-auth-token` secrets exist |
| Pod healthy, logs show success, but watchdog still alerts | Clock skew or upload latency at S3 | Trigger the watchdog manually (`kubectl create job --from=cronjob/mongo-backup-watchdog watchdog-manual-$(date +%s) -n remote-falcon`); if still alerts, list S3 directly (step 4) |

## Recovery — trigger a manual backup

The service exposes a `/backup/trigger` endpoint guarded by `BACKUP_AUTH_TOKEN`.

```sh
TOKEN=$(kubectl get secret mongo-backup-auth-token -n remote-falcon -o jsonpath='{.data.BACKUP_AUTH_TOKEN}' | base64 -d)
kubectl port-forward -n remote-falcon svc/remote-falcon-mongo-backup 8085:8080 &
curl -X POST -H "X-Backup-Token: $TOKEN" \
  http://localhost:8085/remote-falcon-mongo-backup/backup/trigger
```

A successful response is `Backup completed successfully` (HTTP 200). After it lands, kick off a manual watchdog run to confirm green:

```sh
kubectl create job --from=cronjob/mongo-backup-watchdog \
  watchdog-manual-$(date +%s) -n remote-falcon
```

## If you can't get a fresh backup

- The most recent successful backup is in `s3://rf-mongo-backup/mongo-backups/`. Note its age before doing destructive recovery work.
- Backups are retained 21 days (`BACKUP_RETENTION_DAYS` in `MongoBackupService.java`). Older backups get GC'd by the same service — if you're under the 36h alert for >19 days, you may have ZERO valid backups soon.
- Restore path: `MongoBackupService.restoreFromBackup(filename)` reachable via `POST /backup/restore?filename=mongo-backup-YYYYMMDD-HHMMSS.gz` with the same auth token.

## Tuning the alert

- Threshold lives in `ops/k8s/mongo-backup-watchdog/cronjob.yml` as `THRESHOLD_HOURS: "36"`.
- Schedule lives in the same file as `spec.schedule` (`0 20 * * *` UTC = daily at ~2h post-backup).
- Backup cron lives in `apps/mongo-backup/src/main/resources/application.properties` (`backup.cron`) — currently daily noon Central.
- If you change the backup cadence, bump both the watchdog schedule and the threshold to match.

## Testing the alert pipe

To verify the Discord webhook + Secret + Job pipeline (without waiting for a real stale backup), apply the one-shot test Job:

```sh
kubectl apply -f ops/k8s/mongo-backup-watchdog/test-ping.yml
# Look for "[TEST] mongo-backup alert pipeline" in #alerts
kubectl delete -f ops/k8s/mongo-backup-watchdog/test-ping.yml
```

Useful after rotating the webhook URL or onboarding a new alerts channel.
