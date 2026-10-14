# mongo-metrics

Prometheus metrics for the DO Managed Mongo cluster `remote-falcon-mongo`
(`17b9ed48-501c-491d-94da-0892d942c368`), scraped by the
kube-prometheus-stack that already runs in the `monitoring` namespace.
Season Capacity Plan 2026, Appendix D, P1-6. On 2026-10-12 nobody could
see connection counts or queued operations on the DB while it saturated.

## Why an exporter and not DO's :9273 endpoint

DO documents a Prometheus endpoint on port 9273 for managed databases
(`metrics_endpoints` on `GET /v2/databases/{uuid}`, basic-auth credentials
from `GET /v2/databases/metrics/credentials`). **MongoDB doesn't have it.**
Verified 2026-10-13:

- `GET /v2/databases/17b9ed48-...` returns no `metrics_endpoints` field
  for this cluster.
- DO's "Monitor MongoDB" page only covers the console graphs (CPU, load,
  memory, disk). The 9273 scrape procedure is documented for PostgreSQL,
  MySQL, Kafka, and OpenSearch, and only for Standard Edition clusters.

If DO adds it for MongoDB later, the ScrapeConfig is in
[the appendix below](#if-do-ships-a-mongodb-metrics-endpoint). Until
then, [`exporter.yml`](./exporter.yml) runs `percona/mongodb_exporter`
in the `remote-falcon` namespace with the existing `mongodb-connection`
Secret. The cluster is already a trusted source on the DB firewall
(`doctl databases firewalls list`), so nothing changes on the DO side.

## What it costs the DB

One connection plus monitoring, and one `serverStatus` (plus
`replSetGetStatus`) every 30s. `--collect-all` is deliberately off: the
collstats, indexstats and dbstats collectors walk every collection, which is
real load on a 1 vCPU / 1 GB node.

## Apply (manual, not wired to a workflow)

```sh
kubectl apply --dry-run=server -f ops/k8s/mongo-metrics/exporter.yml
kubectl apply -f ops/k8s/mongo-metrics/exporter.yml
kubectl -n remote-falcon logs deploy/mongo-metrics-exporter --tail=20
```

Verify Prometheus picked it up:

```sh
kubectl -n monitoring exec prometheus-prometheus-kube-prometheus-prometheus-0 -c prometheus -- \
  wget -qO- 'http://localhost:9090/api/v1/query?query=mongodb_up'
```

`mongodb_up` should be 1. If it's 0, the DO `doadmin` user may lack
`clusterMonitor` for `serverStatus`. Check the exporter log for
`not authorized`.

Smoke-tested 2026-10-13 against the local dev Mongo with the same flags
and `--user 65534 --read-only`: all the metrics below are emitted.

## Panels / queries

| Panel | PromQL |
|---|---|
| Connections (current vs available) | `mongodb_ss_connections{conn_type=~"current\|available"}` |
| Ops/s by type | `sum by (legacy_op_type) (rate(mongodb_ss_opcounters[1m]))` |
| Queued readers/writers | `mongodb_mongod_global_lock_current_queue` |
| WiredTiger cache fill | `mongodb_ss_wt_cache_bytes_currently_in_the_cache / mongodb_ss_wt_cache_maximum_bytes_configured` |
| Exporter health | `mongodb_up` |

Grafana is `prometheus-grafana` in `monitoring`:
`kubectl -n monitoring port-forward svc/prometheus-grafana 3001:80`.

CPU and memory of the DB node itself are not in `serverStatus`. Those stay
in the DO console and the `rf-mongo-*` DO Monitoring alerts
([`ops/do-monitoring/`](../../do-monitoring/)).

## The app ServiceMonitors are not scraped today

Found while wiring this up (2026-10-13): the Prometheus CR selects
ServiceMonitors with `release: prometheus` (the helm release in
`monitoring` is named `prometheus`, chart kube-prometheus-stack-84.0.1).
The viewer and plugins-api manifests label theirs
`release: kube-prometheus-stack-1768012917` and put them in `default`.
Prometheus's active targets have no viewer or plugins-api job, so
`/q/metrics` (and any Mongo pool gauges added there) never reaches
Prometheus. The fix is a one-line label change in each manifest. It's
left out of this change because those manifests are being edited in
parallel for the probe and replica work.

## If DO ships a MongoDB metrics endpoint

Credentials are account-wide (one pair for every DB cluster). Create the
Secret from the API without the values touching disk or shell history
(doctl has no verb for this, so use the API):

```sh
curl -s -H "Authorization: Bearer $DIGITALOCEAN_ACCESS_TOKEN" \
  https://api.digitalocean.com/v2/databases/metrics/credentials \
  | jq -r '.credentials | "username=\(.basic_auth_username)\npassword=\(.basic_auth_password)"' \
  | kubectl -n monitoring create secret generic do-dbaas-metrics --from-env-file=/dev/stdin
```

Then apply a ScrapeConfig (the Prometheus CR selects
`release: prometheus` ScrapeConfigs in any namespace):

```yaml
apiVersion: monitoring.coreos.com/v1alpha1
kind: ScrapeConfig
metadata:
  name: do-dbaas-mongo
  namespace: monitoring
  labels:
    release: prometheus
spec:
  scheme: HTTPS
  metricsPath: /metrics
  scrapeInterval: 30s
  staticConfigs:
    - targets: ["<metrics_endpoints[0].host>:9273"]
      labels:
        cluster: remote-falcon-mongo
  basicAuth:
    username: {name: do-dbaas-metrics, key: username}
    password: {name: do-dbaas-metrics, key: password}
  tlsConfig:
    # CA from `doctl databases get-ca <uuid>` into a ConfigMap is better
    # than skipping verification.
    insecureSkipVerify: true
```
