# ops/season

Season capacity tooling. The plan and its numbers live in the Obsidian vault
(`Season Capacity Plan 2026`, section "Measurement gates").

## Gate script: `gate.py`

Projects December's peak DB CPU from one show night and recommends the DB tier
for the Dec 1 resize.

```
X          = peak 5-minute DB CPU% in the show window - that afternoon's floor
Gate 1     = floor x 1.5 + X x 9      (Oct, ~9x to Christmas Eve peak hour)
Gate 2     = floor x 1.2 + X x 4.4    (Black Friday)
```

| Tier | Projection must be |
|---|---|
| Basic 2/4 | <= 60% |
| GP 2/8 | <= ~70% |
| GP 4/16 | <= ~120% |
| GP 8/32 | anything higher |

The script picks the smallest tier that fits and prints a note when the
projection is within 5 points of a threshold, because those thresholds are
approximate. Treat a note as "at the edge", not as a precise answer.

**Upsize regardless** (printed as `UPSIZE REGARDLESS`) if, inside the show window:

- any 5-minute CPU mean is above 70%;
- WiredTiger cache is above 80% **at the same time as** app threads are
  evicting. Cache alone does not count: it sits at 78-80% by design;
- dirty cache is above 15%.

How the numbers are taken:

- **Floor** = median of the 5-minute means in the floor window (default
  14:00-16:00 ET the same day). A median, so one afternoon spike doesn't move it.
- **Peak** = highest clock-aligned 5-minute mean (xx:00, xx:05, ...) in the
  window. A single 1-minute blip doesn't count on its own.
- Windows are ET wall-clock and follow DST (Oct 31 is EDT, Nov 27 is EST).
- DB CPU uses the max across the cluster's nodes (`--do-aggregate max`), i.e.
  the primary. A second node joined on Nov 13; check which line DO Insights
  shows before comparing against old by-eye readings.

### Invocations

```sh
# Gate 1b: Sat Oct 31, the post-#182 Halloween reading that was never taken
ops/season/gate.py --date 2026-10-31 --window 20:00-22:00 --gate 1

# Gate 2: Fri Nov 27 (Black Friday). Run it the next morning; it picks the Dec 1 tier.
ops/season/gate.py --date 2026-11-27 --window 20:00-22:00 --gate 2 \
  --save-json ops/season/readings/2026-11-27-gate2.json

# Re-run a saved or hand-entered reading offline
ops/season/gate.py --date 2026-10-24 --gate 1 --from-json ops/season/fixtures/oct24-gate1.json
```

Gate 1b on Oct 31 is a Gate 1 formula on purpose: it measures October load
and projects the full ~9x to Christmas.

Other flags: `--floor-window 13:00-15:00`, `--prom-url http://localhost:9090`
(port-forward instead of `kubectl exec`), `--no-prometheus` (CPU only),
`--db-id`, `--do-engine`, `--evict-threshold`. `--help` lists them all.

### Prerequisites

- **DO token.** The script runs `env -u DIGITALOCEAN_ACCESS_TOKEN doctl auth token`
  (the env var in the shell is stale, and plain `doctl auth token` echoes it).
  Set `RF_GATE_DO_TOKEN` to override. Needs `monitoring:read`.
- **kubectl** on the prod context for Prometheus (`kubectl -n monitoring exec
  prometheus-prometheus-kube-prometheus-prometheus-0 -c prometheus -- wget ...`).
  kubectl auth depends on doctl, so `doctl auth login` first.
- The `mongo-metrics-exporter` from [`ops/k8s/mongo-metrics/`](../k8s/mongo-metrics/)
  must be applied and `mongodb_up` 1, or the WiredTiger triggers are skipped
  (the report says `triggers NOT checked`).

### Data sources and their limits

**DB CPU, DO Monitoring API.** The documented database metrics endpoint is
`GET /v2/monitoring/metrics/database/mysql/cpu_usage?db_id=&aggregate=&start=&end=`.
DO documents it for MySQL only, and no MongoDB equivalent exists in the
OpenAPI spec (checked 2026-11-15). The script tries
`/database/mongodb/cpu_usage` first, then the documented `mysql` path with the
Mongo cluster's `db_id`, and prints which one answered. **Neither is verified
against the Mongo cluster yet** (doctl auth was dead when this was written).
If both fail, the script stops and says so. Then read DO Insights by eye and
use `--from-json` (below). That is how Gate 1 was taken.

**WiredTiger, in-cluster Prometheus.** From the percona exporter:

| Reading | PromQL |
|---|---|
| cache used % | `100 * mongodb_ss_wt_cache_bytes_currently_in_the_cache / mongodb_ss_wt_cache_maximum_bytes_configured` |
| dirty % | `100 * mongodb_ss_wt_cache_tracked_dirty_bytes_in_the_cache / mongodb_ss_wt_cache_maximum_bytes_configured` |
| app-thread evictions/s | `rate(mongodb_ss_wt_cache_pages_evicted_by_application_threads[5m])` |

WiredTiger stat names shift between Mongo versions, so the eviction metric is
discovered from Prometheus' metric names (the report prints which one it
used). If none is found, the cache trigger is skipped and the report says so.

**Retention.** Prometheus keeps 10 days, so the Oct 31 WiredTiger data is
already gone: Gate 1b is CPU-only. Run Gate 2 within a few days of Nov 27,
with `--save-json`, so the raw samples outlive retention.

### Sample file format (`--from-json`, `--save-json`)

```json
{
  "cpu": [[1795827600, 22.5], ["2026-11-27T20:01:00-05:00", 23.0]],
  "wiredtiger": {
    "cache_pct":  [[1795827600, 78.4]],
    "dirty_pct":  [[1795827600, 3.1]],
    "evict_rate": [[1795827600, 0.0]]
  }
}
```

Timestamps are unix seconds or ISO 8601 with an offset. `cpu` must cover both
the floor window and the show window. `wiredtiger` is optional; its three
series should share timestamps, because the cache trigger needs cache and
evictions at the same sample. For a by-eye reading off DO Insights, one CPU
point per 5 minutes in each window is enough.

### Tests

```sh
python3 -m unittest ops/season/test_gate.py
```

`fixtures/oct24-gate1.json` reconstructs the Sat Oct 24 Gate 1 reading (floor
15%, peak 5-minute 25.8%, so 119.7%: GP 4/16, at the edge). It is synthetic
1-minute data shaped to match the by-eye reading, not an API export. Note that
exactly 15/26 projects 121.5%, which the script calls GP 8/32. The by-eye
reading was +-2 points, so that edge is real.
