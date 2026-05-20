# Runbook: doks-node-cpu-high (DO Monitoring)

**Alert source:** DO Monitoring `rf-doks-node-cpu-high` ([source](../../ops/do-monitoring/alerts.yml))
**Fires on:** any DOKS worker droplet (tagged `k8s:4f1406fe-1179-4a9c-9d2e-835c3da34984`) CPU > 85% for 10min
**Severity:** P2 (node degraded; pods on this node will be slow but probably not down)

## Triage

1. **Identify the offending node + workloads:**

   ```sh
   kubectl top nodes
   kubectl top pods --all-namespaces --sort-by=cpu | head -15
   ```

   The top consumers will usually point at the bad citizen.

2. **Check whether the node is throttling pods** (CPU pressure +
   `NoExecute` taints can evict pods):

   ```sh
   kubectl describe node <node-name> | grep -A 5 Conditions
   ```

## Common causes

| Symptom | Cause | Fix |
|---|---|---|
| One pod pegging CPU | Application bug or load spike | Restart pod; investigate why; consider raising container resource requests/limits |
| Many pods at moderate CPU summing high | Node too small for workload | Cluster autoscaler should add capacity; if not, check autoscaler status |
| Sustained ~85% across all nodes | Real organic load | Scale the cluster up (add nodes) and/or raise HPA replica counts |
| Spike then resolves | Transient burst (deploy, big query) | Acknowledge — no action |

## Recovery

If the cluster autoscaler isn't keeping up:

```sh
# Manually scale the node pool
doctl kubernetes cluster node-pool list 4f1406fe-1179-4a9c-9d2e-835c3da34984
doctl kubernetes cluster node-pool update 4f1406fe-1179-4a9c-9d2e-835c3da34984 <pool-id> --count <N>
```

For a single misbehaving pod, drain the node to force pods to migrate
to healthier nodes (autoscaler then adds a new node for the drained
workload):

```sh
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# After investigation
kubectl uncordon <node-name>
```

## Tuning

Threshold + window in [ops/do-monitoring/alerts.yml](../../ops/do-monitoring/alerts.yml).
Apply changes via `./ops/do-monitoring/apply.sh --apply`.
