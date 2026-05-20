# OTel Collector — prod k8s manifests

DaemonSet that runs `otel/opentelemetry-collector-contrib:0.119.0` on every node, tails container stdout via filelog from `/var/log/pods/`, and ships logs to PostHog Logs over OTLP/HTTP.

This is the prod equivalent of the local-dev collector defined in [`ops/docker-compose.dev.yml`](../../docker-compose.dev.yml) + [`ops/otel-collector-config.yaml`](../../otel-collector-config.yaml). The two configs differ only in the filelog include path (kubelet's layout vs. docker's).

## Layout

| File | Role |
|---|---|
| [`configmap.yml`](configmap.yml) | Collector config — receivers (OTLP + filelog), processors (batch, filter), exporter (PostHog), health_check extension |
| [`daemonset.yml`](daemonset.yml) | One collector pod per node; reads `/var/log/pods` + `/var/log/containers` via hostPath; runs as root for log access; 64Mi/10m requested, 256Mi/200m limit |
| [`service.yml`](service.yml) | ClusterIP exposing :4317 (OTLP gRPC) + :4318 (OTLP HTTP) — cluster-internal |
| Secret `remote-falcon-otel-collector` | Created by the deploy workflow from the `PUBLIC_POSTHOG_KEY` GH org secret; mounted as env var into the DaemonSet pods |

## Deployment

Triggered automatically by [`.github/workflows/deploy-collector.yml`](../../../.github/workflows/deploy-collector.yml) on push to `main` when any file under `ops/k8s/otel-collector/**` changes.

Manual deploy (when iterating on config locally):
```bash
# Auth to the cluster first
doctl kubernetes cluster kubeconfig save 4f1406fe-1179-4a9c-9d2e-835c3da34984

# Idempotently create/update the secret
kubectl create secret generic remote-falcon-otel-collector \
  --namespace=remote-falcon \
  --from-literal=PUBLIC_POSTHOG_KEY="<phc_...>" \
  --dry-run=client -o yaml | kubectl apply -f -

# Apply manifests
kubectl apply -f ops/k8s/otel-collector/

# Watch rollout
kubectl rollout status daemonset/otel-collector -n remote-falcon
```

## How services point at it

Each service's `apps/<svc>/k8s/manifest.yml` adds an env var:

```yaml
env:
  - name: OTEL_URI
    value: "http://otel-collector.remote-falcon.svc.cluster.local:4317"
```

The service's `application.properties` then reads `${OTEL_URI:default}` and ships OTLP traces/metrics to the collector. Logs are picked up automatically via the filelog receiver — no service-side wiring required for the log path.

Rollover status (today):

| Service | Reads OTEL_URI in app code? | k8s manifest sets OTEL_URI env? |
|---|---|---|
| `mongo-backup` | yes (Obs-1a) | yes (this PR) |
| `account-archive` | no — prepositioning | yes (this PR, no-op until app wired) |
| `viewer` | pending (Obs-1b PR) | deferred |
| `plugins-api` | pending (Obs-1b PR) | deferred |
| `control-panel` | no — Spring, needs OTel Agent JVM-opts work | deferred |
| `external-api` | no — same | deferred |
| `gateway` | no — `OTEL_OPTS=` is empty in deploy.yml | deferred |

filelog picks up *all* containers in the `remote-falcon` namespace regardless — including services that haven't been rolled over yet. So you'll see logs in PostHog from every pod the moment this DaemonSet is healthy.

## Rollback

Revert this PR and let `deploy-collector.yml` re-apply: the DaemonSet + Service + ConfigMap go away, and services fall back to trying `http://otel-collector:4317` which won't resolve (silent for services that haven't been rolled over, log warnings for services that have).

Or, manual fast rollback:
```bash
kubectl delete daemonset/otel-collector -n remote-falcon
kubectl delete service/otel-collector -n remote-falcon
kubectl delete configmap/otel-collector-config -n remote-falcon
kubectl delete secret/remote-falcon-otel-collector -n remote-falcon
```

## Resource footprint

3-node cluster (today):
- 3× pods × 64Mi memory request = 192Mi total cluster memory request (~2% of allocatable)
- 3× pods × 10m CPU request = 30m total cluster CPU request (~0.5%)
- $0/mo DigitalOcean impact — sits inside existing node capacity

If the cluster grows, the DaemonSet scales linearly (one pod per new node).

## Known follow-ups

- **#142** — Service-name derivation from container metadata so PostHog filters cleanly by service rather than container ID
- **#141 (rest)** — Rolling out OTEL_URI env to viewer + plugins-api (after #34) and the Spring services (after OTel Agent JVM-opts work)
