# Runbook: doks-node-disk-high (DO Monitoring)

**Alert source:** DO Monitoring `rf-doks-node-disk-high` ([source](../../ops/do-monitoring/alerts.yml))
**Fires on:** any DOKS worker droplet (tagged `k8s:4f1406fe-1179-4a9c-9d2e-835c3da34984`) disk > 80% for 10min
**Severity:** P2 (kubelet starts evicting pods at 85% disk; act before then)

DOKS worker nodes have small local disks (~50GB on s-2vcpu-4gb). Logs,
container images, and ephemeral volumes share that. The 80% threshold
buffers against the kubelet's eviction threshold at ~85%.

## Triage

1. **Identify the disk-pressured node:**

   ```sh
   kubectl top nodes  # Doesn't show disk directly; use describe
   for n in $(kubectl get nodes -o name); do
     echo "== $n =="
     kubectl describe "$n" | grep -E "(MemoryPressure|DiskPressure|PIDPressure):"
   done
   ```

2. **SSH-equivalent (DO has no SSH to DOKS nodes by default) — use a
   debug pod to inspect:**

   ```sh
   kubectl debug node/<node-name> -it --image=alpine:3.20 -- sh
   # Inside: du -sh /host/var/log/* /host/var/lib/docker/* /host/var/lib/kubelet/* 2>/dev/null | sort -h | tail
   ```

   The biggest culprits are usually `/var/lib/docker/overlay2/` (image
   layer accumulation) and `/var/log/` (if log rotation isn't aggressive
   enough).

3. **Check current images on the node:**

   ```sh
   kubectl get pods --all-namespaces -o wide --field-selector spec.nodeName=<node-name> \
     | awk '{print $8}' | sort -u
   ```

## Common causes

| Symptom | Cause | Fix |
|---|---|---|
| Slow disk growth over days | Container image accumulation | DOKS prunes unused images; if disabled or stuck, drain the node and let autoscaler replace |
| Sudden disk spike | A pod is writing to an emptyDir / hostPath unchecked | Identify pod (often a stuck mongo-backup dump in /tmp); restart it |
| All nodes near threshold | Cluster on undersized disk tier | Migrate to a larger node-pool size (requires pool re-creation) |

## Recovery

If a specific pod is the cause, restart it:

```sh
kubectl delete pod -n <ns> <pod-name>
```

For node-level disk pressure, drain + autoscaler replacement is the
nuclear option:

```sh
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# Cluster autoscaler will provision a fresh node
```

## Tuning

Threshold + window in [ops/do-monitoring/alerts.yml](../../ops/do-monitoring/alerts.yml).
80% gives ~5 percentage points of headroom before kubelet eviction.
Don't raise without first lowering log-retention or moving big disk
consumers (mongo-backup `/tmp` dump) to a dedicated volume.
