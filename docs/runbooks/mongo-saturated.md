# Runbook: Mongo saturated during show hours

**Alert sources:**
- DO Monitoring `rf-mongo-cpu-high` (CPU > 80% / 5m, warning), `rf-mongo-cpu-critical` (CPU > 95% / 5m, page), `rf-mongo-memory-high` (memory > 90% / 5m), `rf-mongo-disk-high` (disk > 80% / 10m) ([source](../../ops/do-monitoring/alerts.yml))
- PostHog `rf-mongo-unreachable` ([runbook](mongo-unreachable.md)), which also fires when the node is alive but too slow to answer
- Many `SRHCK01001: Reporting health down` lines with `"<default>":"KO"` in Quarkus logs (readiness flapping)

**Severity:** P1 during show hours (US shows run about 5pm to 2am ET). Every service shares the one DO Managed node (`remote-falcon-mongo`, `db-s-1vcpu-1gb`, 1 node, no standby).

**How this differs from [mongo-unreachable](mongo-unreachable.md):** that runbook covers a lost primary (failover, maintenance), where the answer is usually "wait, the driver reconnects". Saturation is the node answering too slowly. Nothing reconnects it, and the usual reflexes (restart pods, scale up, resize the DB) make it worse. Born from the 2026-10-12 incident.

## Recognize (first 2 minutes)

1. **CPU or memory?** DO's own alert email says only "Metric 99.5". The `rf-mongo-*` Discord message names the metric. Confirm in the DO console: Databases → `remote-falcon-mongo` → Insights.
2. **What is the cluster doing?**

   ```sh
   kubectl -n remote-falcon get events --sort-by=.lastTimestamp | tail -40
   ```

   Look for readiness/startup probe failures across several services at once, and HPA `Scaled up replica set` lines.
3. **Who is sending the load?**

   ```sh
   kubectl -n remote-falcon top pods
   kubectl -n ingress-nginx logs deploy/ingress-nginx-controller --since=2m \
     | grep -oE '\[remote-falcon-[a-z-]+-8080\]' | sort | uniq -c
   ```

   plugins-api normally carries about 85% of requests (FPP plugins polling `/nextPlaylistInQueue` and `/fppHeartbeat`). That share alone is not evidence that plugins-api is the cause. A sudden jump in one service's share is.
4. **Are requests actually failing?** Apply the 30-second rule from [mongo-unreachable](mongo-unreachable.md#the-30-second-rule): `Timed out after 30000 ms` in PostHog Logs means real 5xx to users.

## Do

- **Leave pods alone.** They reconnect on their own. A mass `kubectl rollout restart` adds cold-start connection pools on top of a struggling node, and while startup probes still check Mongo, restarted pods fail startup and crash-loop.
- **Stop the HPA from adding DB clients.** If plugins-api or viewer is scaling up during the stall, every new pod opens more connections and then fails its startup probe. Pin `maxReplicas` at the current count, note the old value, and undo it after recovery:

  ```sh
  kubectl -n remote-falcon get hpa
  kubectl -n remote-falcon patch hpa remote-falcon-plugins-api -p '{"spec":{"maxReplicas":<current>}}'
  kubectl -n remote-falcon patch hpa remote-falcon-viewer -p '{"spec":{"maxReplicas":<current>}}'
  # after recovery: put back the manifest values (plugins-api / viewer maxReplicas)
  ```

- **Look for one tenant first.** One document can saturate this node. On 2026-08-22 the whole "platform is slow" report was 6,066 stale PSA votes on a single show, fixed by Reset All Votes. Check the top show documents by array length before assuming organic load.
- **Post a status message early** (Discord, Facebook group). The FPP plugin falls back to the local schedule, so shows keep running without viewer requests. Operators mostly need to know it's known.

## Don't

- **Never resize, scale, or reconfigure the single-node DO Mongo during show hours.** On one node a resize means a new node, a data copy, and a cutover: about 10 minutes unhealthy with no standby. On 2026-10-12 the resize also did not complete (the cluster stayed `db-s-1vcpu-1gb`). Schedule it for a weekday morning instead.
- **Don't deploy anything.** `deploy.yml` resets viewer and plugins-api to their minimum replica count on apply, and new pods can't pass startup while the DB is slow. The season [deploy freeze](../SERVICES.md#deploy-freeze) blocks merge-triggered deploys in the riskiest windows, but a manual `workflow_dispatch` is not blocked. Don't use it here.
- **Don't restart control-panel.** It serves operators and was the first service to recover on 2026-10-12.
- **Don't treat a quiet log feed as recovery.** Verify that a real viewer page loads, and that plugin calls return 200/204 in the ingress log:

  ```sh
  kubectl -n ingress-nginx logs deploy/ingress-nginx-controller --since=1m \
    | grep nextPlaylistInQueue | awk '{print $9}' | sort | uniq -c
  ```

## After

1. Undo any HPA pinning.
2. If the node needs more capacity, schedule the resize for the next weekday daytime (for example Tue 10am ET), announce it, and confirm the DO maintenance window is not in show hours (`doctl databases maintenance-window get 17b9ed48-501c-491d-94da-0892d942c368`).
3. Check whether false "FPP Plugin Health" pushes went out. After any plugins-api or DB outage longer than 5 minutes, every opted-in show with a live plugin gets one.
4. Record the event in the [mongo-unreachable known-events table](mongo-unreachable.md#known-events): date, duration, which metric (CPU or memory), peak value, user impact, and what fixed it.

## Related

- [mongo-unreachable](mongo-unreachable.md): lost primary, failover, maintenance
- [doks-node-cpu-high](doks-node-cpu-high.md), [doks-node-memory-high](doks-node-memory-high.md): the app-node side
- [Alerts inventory](../observability/alerts-inventory.md)
- DB metrics in Prometheus: [`ops/k8s/mongo-metrics/`](../../ops/k8s/mongo-metrics/)
