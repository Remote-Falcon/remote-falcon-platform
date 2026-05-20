# Runbook: doks-node-memory-high (DO Monitoring)

**Alert source:** DO Monitoring `rf-doks-node-memory-high` ([source](../../ops/do-monitoring/alerts.yml))
**Fires on:** any DOKS worker droplet (tagged `k8s:4f1406fe-1179-4a9c-9d2e-835c3da34984`) memory > 90% for 10min
**Severity:** **P1** (OOMKill imminent — pods will be force-killed if not addressed)

Higher severity than CPU because the kubelet starts evicting pods at
~95% node memory and the kernel OOM-killer fires at 100%. By the time
this alert clears 90% the OOMKills have likely started.

## Triage

1. **Identify the memory-pressured node + memory-hungry pods:**

   ```sh
   kubectl top nodes
   kubectl top pods --all-namespaces --sort-by=memory | head -15
   ```

2. **Check for active OOMKills:**

   ```sh
   kubectl get events --all-namespaces \
     --field-selector reason=OOMKilling --sort-by=.lastTimestamp | tail -20
   ```

3. **Check whether the kubelet has started evicting:**

   ```sh
   kubectl describe node <node-name> | grep -A 10 Conditions
   ```

   `MemoryPressure: True` means it's actively shedding pods.

## Common causes

| Symptom | Cause | Fix |
|---|---|---|
| One pod consuming most node memory | Memory leak or undersized limit | Restart pod; raise the pod's `resources.limits.memory` |
| Multiple pods with steady high memory | Node too small | Scale node pool up |
| Memory grows over hours/days then alert | Slow leak (Java heap, in-memory caches) | Find the pod, restart it, file a bug |
| Spike + clear | Batch job ran (e.g., mongo-backup dump) | If routine, acknowledge; consider scheduling around peak hours |

## Recovery

If pods are OOMKilling on this node, evict everything off it and let
the autoscaler replace it:

```sh
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# Watch the cluster autoscaler add a replacement
kubectl get nodes -w
# Once a new node is up, uncordon if you didn't delete
kubectl uncordon <node-name>
```

For a specific leaky pod, raise its memory limits in the deployment
manifest under `apps/<svc>/k8s/manifest.yml` and re-deploy. Or as an
emergency: `kubectl rollout restart deployment/<svc> -n remote-falcon`.

## Tuning

Threshold + window in [ops/do-monitoring/alerts.yml](../../ops/do-monitoring/alerts.yml).
The 90% threshold is intentionally aggressive given the OOM-kill risk —
do NOT raise without compensating monitoring.
