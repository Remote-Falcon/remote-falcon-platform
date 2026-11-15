#!/usr/bin/env python3
"""Season measurement gate: project December's DB CPU peak and pick a tier.

Implements "Measurement gates" from the Season Capacity Plan 2026:

    X = peak 5-minute DB CPU% in the show window - that afternoon's floor
    Gate 1: projected = floor * 1.5 + X * 9
    Gate 2: projected = floor * 1.2 + X * 4.4

then recommends the smallest DB tier whose threshold the projection beats,
and flags any "upsize regardless" trigger.

Data sources (live mode):
  - DB CPU: DO Monitoring API, /v2/monitoring/metrics/database/<engine>/cpu_usage.
    Only the mysql engine is documented; see README.md for the fallback.
  - WiredTiger cache %, dirty %, app-thread evictions: the in-cluster
    Prometheus (kube-prometheus-stack, scraping ops/k8s/mongo-metrics/),
    via `kubectl exec` into the Prometheus pod, or --prom-url.

Offline mode: --from-json <file> reads samples saved by --save-json (or
hand-written ones, e.g. read off DO Insights). Format in README.md.

Stdlib only. Run: ops/season/gate.py --date 2026-11-27 --gate 2
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Callable
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
DO_API = "https://api.digitalocean.com/v2"
# remote-falcon-mongo; same UUID as database_id in ops/do-monitoring/alerts.yml.
DEFAULT_DB_ID = "17b9ed48-501c-491d-94da-0892d942c368"
# Only mysql is documented. mongodb is tried first in case DO serves it.
DEFAULT_CPU_ENGINES = ("mongodb", "mysql")
PROM_NAMESPACE = "monitoring"
PROM_POD = "prometheus-prometheus-kube-prometheus-prometheus-0"
PROM_CONTAINER = "prometheus"
PROM_STEP_SECONDS = 60
BUCKET_SECONDS = 300

GATES = {
    1: {"floor_mult": 1.5, "x_mult": 9.0},
    2: {"floor_mult": 1.2, "x_mult": 4.4},
}

# (name, projection must be <= this). Last tier has no ceiling.
TIERS: list[tuple[str, float | None]] = [
    ("Basic 2/4", 60.0),
    ("GP 2/8", 70.0),
    ("GP 4/16", 120.0),
    ("GP 8/32", None),
]
# The table's thresholds carry a "~"; flag projections this close to one.
EDGE_POINTS = 5.0

UPSIZE_CPU_PCT = 70.0
UPSIZE_CACHE_PCT = 80.0
UPSIZE_DIRTY_PCT = 15.0

# Metric names from ops/k8s/mongo-metrics/ (percona/mongodb_exporter with
# --collector.diagnosticdata). WiredTiger stat names vary across Mongo
# versions, so the eviction counter is discovered (see find_evict_metric).
CACHE_USED = "mongodb_ss_wt_cache_bytes_currently_in_the_cache"
CACHE_DIRTY = "mongodb_ss_wt_cache_tracked_dirty_bytes_in_the_cache"
CACHE_MAX = "mongodb_ss_wt_cache_maximum_bytes_configured"
EVICT_CANDIDATES = (
    "mongodb_ss_wt_cache_pages_evicted_by_application_threads",
    "mongodb_ss_wt_eviction_pages_evicted_by_application_threads",
)

Series = list[tuple[float, float]]  # (unix seconds, value)


# --------------------------------------------------------------------------
# Windows
# --------------------------------------------------------------------------


def parse_window(day: date, spec: str) -> tuple[datetime, datetime]:
    """'20:00-22:00' on `day` in ET -> aware (start, end). End past midnight
    rolls to the next day."""
    try:
        start_s, end_s = spec.split("-")
        start_t = time.fromisoformat(start_s.strip())
        end_t = time.fromisoformat(end_s.strip())
    except ValueError:
        raise ValueError(f"bad window {spec!r}, expected HH:MM-HH:MM") from None
    start = datetime.combine(day, start_t, tzinfo=ET)
    end_day = day if end_t > start_t else day + timedelta(days=1)
    return start, datetime.combine(end_day, end_t, tzinfo=ET)


def in_window(series: Series, start: datetime, end: datetime) -> Series:
    lo, hi = start.timestamp(), end.timestamp()
    return [(t, v) for t, v in series if lo <= t < hi]


# --------------------------------------------------------------------------
# Computation (pure; everything here is covered by test_gate.py)
# --------------------------------------------------------------------------


def five_minute_means(series: Series) -> Series:
    """Mean per clock-aligned 5-minute bucket (xx:00, xx:05, ...)."""
    buckets: dict[int, list[float]] = {}
    for t, v in series:
        buckets.setdefault(int(t // BUCKET_SECONDS) * BUCKET_SECONDS, []).append(v)
    return [(float(b), statistics.fmean(vs)) for b, vs in sorted(buckets.items())]


def project(gate: int, floor: float, peak: float) -> tuple[float, float]:
    """-> (X, projected December peak)."""
    g = GATES[gate]
    x = peak - floor
    return x, floor * g["floor_mult"] + x * g["x_mult"]


def recommend_tier(projected: float) -> str:
    for name, ceiling in TIERS:
        if ceiling is None or projected <= ceiling:
            return name
    raise AssertionError("unreachable: last tier has no ceiling")


def edge_notes(projected: float) -> list[str]:
    notes = []
    for name, ceiling in TIERS:
        if ceiling is not None and abs(projected - ceiling) <= EDGE_POINTS:
            side = "under" if projected <= ceiling else "over"
            notes.append(
                f"projection is {abs(projected - ceiling):.1f} points {side} the "
                f"{name} threshold ({ceiling:.0f}%); thresholds are approximate"
            )
    return notes


@dataclass
class CacheReadings:
    cache_pct: Series = field(default_factory=list)
    dirty_pct: Series = field(default_factory=list)
    evict_rate: Series = field(default_factory=list)  # pages/s by app threads


def upsize_flags(
    window_buckets: Series, cache: CacheReadings | None, evict_threshold: float = 0.0
) -> list[str]:
    flags = []
    hot = [v for _, v in window_buckets if v > UPSIZE_CPU_PCT]
    if hot:
        flags.append(
            f"CPU: {len(hot)} five-minute reading(s) above {UPSIZE_CPU_PCT:.0f}% "
            f"(max {max(hot):.1f}%)"
        )
    if cache is None:
        return flags
    # Cache sits at 78-80% by design (WiredTiger's eviction target), so cache
    # alone is not a trigger: it has to coincide with app threads evicting.
    evicting_at = {int(t) for t, v in cache.evict_rate if v > evict_threshold}
    both = [(t, v) for t, v in cache.cache_pct if v > UPSIZE_CACHE_PCT and int(t) in evicting_at]
    if both:
        flags.append(
            f"cache: above {UPSIZE_CACHE_PCT:.0f}% while app threads were evicting "
            f"at {len(both)} sample(s) (max cache {max(v for _, v in both):.1f}%)"
        )
    dirty = [v for _, v in cache.dirty_pct if v > UPSIZE_DIRTY_PCT]
    if dirty:
        flags.append(
            f"dirty: above {UPSIZE_DIRTY_PCT:.0f}% at {len(dirty)} sample(s) "
            f"(max {max(dirty):.1f}%)"
        )
    return flags


@dataclass
class GateResult:
    gate: int
    floor: float
    peak: float
    peak_at: float
    x: float
    projected: float
    tier: str
    edges: list[str]
    flags: list[str]
    cache_available: bool
    cpu_samples_window: int
    cpu_samples_floor: int
    cache_summary: dict[str, float | None]


def evaluate(
    gate: int,
    cpu: Series,
    window: tuple[datetime, datetime],
    floor_window: tuple[datetime, datetime],
    cache: CacheReadings | None,
    evict_threshold: float = 0.0,
) -> GateResult:
    win = in_window(cpu, *window)
    flo = in_window(cpu, *floor_window)
    if not win:
        raise ValueError("no CPU samples in the measurement window")
    if not flo:
        raise ValueError("no CPU samples in the floor window")
    win_buckets = five_minute_means(win)
    # Floor = median 5-minute level of the afternoon, so one spike or dip
    # doesn't move it. Matches reading the baseline off DO Insights by eye.
    floor = statistics.median(v for _, v in five_minute_means(flo))
    peak_at, peak = max(win_buckets, key=lambda tv: tv[1])
    x, projected = project(gate, floor, peak)

    cache_in_window = None
    if cache is not None:
        cache_in_window = CacheReadings(
            in_window(cache.cache_pct, *window),
            in_window(cache.dirty_pct, *window),
            in_window(cache.evict_rate, *window),
        )

    def series_max(s: Series) -> float | None:
        return max((v for _, v in s), default=None)

    return GateResult(
        gate=gate,
        floor=floor,
        peak=peak,
        peak_at=peak_at,
        x=x,
        projected=projected,
        tier=recommend_tier(projected),
        edges=edge_notes(projected),
        flags=upsize_flags(win_buckets, cache_in_window, evict_threshold),
        cache_available=cache_in_window is not None,
        cpu_samples_window=len(win),
        cpu_samples_floor=len(flo),
        cache_summary={
            "max_cache_pct": series_max(cache_in_window.cache_pct) if cache_in_window else None,
            "max_dirty_pct": series_max(cache_in_window.dirty_pct) if cache_in_window else None,
            "max_evict_rate": series_max(cache_in_window.evict_rate) if cache_in_window else None,
        },
    )


def fmt_et(ts: float) -> str:
    return datetime.fromtimestamp(ts, ET).strftime("%a %b %d %H:%M %Z")


def report(r: GateResult, window: tuple[datetime, datetime], floor_window: tuple[datetime, datetime]) -> str:
    g = GATES[r.gate]

    def span(w: tuple[datetime, datetime]) -> str:
        return f"{w[0]:%a %b %d %H:%M}-{w[1]:%H:%M %Z}"

    lines = [
        f"Gate {r.gate}  window {span(window)}  floor window {span(floor_window)}",
        f"  CPU samples: {r.cpu_samples_window} in window, {r.cpu_samples_floor} in floor window",
        f"  floor (median 5-min, afternoon) {r.floor:6.1f}%",
        f"  peak 5-min in window            {r.peak:6.1f}%  at {fmt_et(r.peak_at)}",
        f"  X = peak - floor                {r.x:6.1f}",
        f"  projection = floor x {g['floor_mult']} + X x {g['x_mult']} = {r.projected:.1f}%",
        f"  recommended tier: {r.tier}",
    ]
    lines += [f"  note: {e}" for e in r.edges]
    if r.cache_available:
        def show(v: float | None, unit: str) -> str:
            return "no data" if v is None else f"{v:.1f}{unit}"
        s = r.cache_summary
        lines.append(
            f"  WiredTiger in window: cache max {show(s['max_cache_pct'], '%')}, "
            f"dirty max {show(s['max_dirty_pct'], '%')}, "
            f"app-thread evictions max {show(s['max_evict_rate'], '/s')}"
        )
    else:
        lines.append("  WiredTiger: no Prometheus data; cache/dirty/eviction triggers NOT checked")
    if r.flags:
        lines.append("  UPSIZE REGARDLESS:")
        lines += [f"    - {f}" for f in r.flags]
    else:
        lines.append("  upsize-regardless triggers: none")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Live data: DO Monitoring API
# --------------------------------------------------------------------------


def do_token() -> str:
    # DIGITALOCEAN_ACCESS_TOKEN in the shell is stale, and plain
    # `doctl auth token` echoes it, so unset it for the doctl call.
    if tok := os.environ.get("RF_GATE_DO_TOKEN"):
        return tok
    env = {k: v for k, v in os.environ.items() if k != "DIGITALOCEAN_ACCESS_TOKEN"}
    out = subprocess.run(
        ["doctl", "auth", "token"], env=env, capture_output=True, text=True, check=False
    )
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError(f"doctl auth token failed (run `doctl auth login`): {out.stderr.strip()}")
    return out.stdout.strip()


def parse_matrix(payload: dict) -> list[Series]:
    """Prometheus-style matrix response (DO Monitoring and Prometheus both
    use it) -> one Series per result."""
    if payload.get("status") not in (None, "success"):
        raise ValueError(f"metric query failed: {payload}")
    data = payload.get("data", {})
    out = []
    for res in data.get("result", []):
        if "values" in res:
            out.append([(float(t), float(v)) for t, v in res["values"]])
        elif "value" in res:
            t, v = res["value"]
            out.append([(float(t), float(v))])
    return out


def merge_max(series_list: list[Series]) -> Series:
    """Combine per-node series into one by taking the max at each timestamp."""
    merged: dict[float, float] = {}
    for s in series_list:
        for t, v in s:
            merged[t] = max(v, merged.get(t, v))
    return sorted(merged.items())


def fetch_do_cpu(
    db_id: str, start: datetime, end: datetime, aggregate: str, engines: tuple[str, ...],
    http_get: Callable[[str, str], dict] | None = None,
) -> tuple[Series, str]:
    """-> (series, path used). Tries each engine path in order."""
    get = http_get or _do_get
    token = do_token()
    qs = urllib.parse.urlencode(
        {"db_id": db_id, "aggregate": aggregate,
         "start": int(start.timestamp()), "end": int(end.timestamp())}
    )
    errors = []
    for engine in engines:
        path = f"/monitoring/metrics/database/{engine}/cpu_usage"
        try:
            series = merge_max(parse_matrix(get(f"{DO_API}{path}?{qs}", token)))
        except (urllib.error.HTTPError, ValueError) as e:
            errors.append(f"{path}: {e}")
            continue
        if series:
            return series, path
        errors.append(f"{path}: empty result")
    raise RuntimeError(
        "DO Monitoring API returned no DB CPU data:\n  " + "\n  ".join(errors)
        + "\nRead the window off DO Insights and use --from-json (see README.md)."
    )


def _do_get(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


# --------------------------------------------------------------------------
# Live data: Prometheus
# --------------------------------------------------------------------------


def prom_get(path: str, params: dict[str, str], prom_url: str | None) -> dict:
    qs = urllib.parse.urlencode(params)
    if prom_url:
        with urllib.request.urlopen(f"{prom_url.rstrip('/')}{path}?{qs}", timeout=60) as resp:
            return json.load(resp)
    out = subprocess.run(
        ["kubectl", "-n", PROM_NAMESPACE, "exec", PROM_POD, "-c", PROM_CONTAINER, "--",
         "wget", "-qO-", f"http://localhost:9090{path}?{qs}"],
        capture_output=True, text=True, check=False, timeout=90,
    )
    if out.returncode != 0:
        raise RuntimeError(f"kubectl exec into {PROM_POD} failed: {out.stderr.strip()}")
    return json.loads(out.stdout)


def find_evict_metric(names: list[str]) -> str | None:
    for cand in EVICT_CANDIDATES:
        if cand in names:
            return cand
    for n in names:
        if n.startswith("mongodb_ss_wt_") and "evict" in n and "application" in n:
            return n
    return None


def fetch_prometheus(start: datetime, end: datetime, prom_url: str | None) -> tuple[CacheReadings, list[str]]:
    notes = []
    names = prom_get("/api/v1/label/__name__/values", {}, prom_url).get("data", [])
    if CACHE_USED not in names:
        raise RuntimeError(
            f"{CACHE_USED} not in Prometheus; is ops/k8s/mongo-metrics/ applied and mongodb_up 1?"
        )
    window = {"start": str(int(start.timestamp())), "end": str(int(end.timestamp())),
              "step": str(PROM_STEP_SECONDS)}

    def q(expr: str) -> Series:
        return merge_max(parse_matrix(prom_get("/api/v1/query_range", {**window, "query": expr}, prom_url)))

    cache = CacheReadings(
        cache_pct=q(f"max(100 * {CACHE_USED} / {CACHE_MAX})"),
        dirty_pct=q(f"max(100 * {CACHE_DIRTY} / {CACHE_MAX})") if CACHE_DIRTY in names else [],
    )
    if CACHE_DIRTY not in names:
        notes.append(f"{CACHE_DIRTY} missing; dirty trigger not checked")
    evict = find_evict_metric(names)
    if evict:
        cache.evict_rate = q(f"max(rate({evict}[5m]))")
        notes.append(f"app-thread evictions from {evict}")
    else:
        notes.append("no app-thread eviction metric found; cache trigger not checked")
    return cache, notes


# --------------------------------------------------------------------------
# Saved samples
# --------------------------------------------------------------------------


def load_samples(path: Path) -> tuple[Series, CacheReadings | None]:
    """{"cpu": [[t, pct], ...], "wiredtiger": {"cache_pct": [...], "dirty_pct": [...],
    "evict_rate": [...]}}. t is unix seconds or an ISO 8601 string with offset."""
    raw = json.loads(path.read_text())

    def series(items: list) -> Series:
        out = []
        for t, v in items:
            ts = datetime.fromisoformat(t).timestamp() if isinstance(t, str) else float(t)
            out.append((ts, float(v)))
        return sorted(out)

    wt = raw.get("wiredtiger")
    cache = None
    if wt:
        cache = CacheReadings(
            series(wt.get("cache_pct", [])),
            series(wt.get("dirty_pct", [])),
            series(wt.get("evict_rate", [])),
        )
    return series(raw["cpu"]), cache


def save_samples(path: Path, cpu: Series, cache: CacheReadings | None, meta: dict) -> None:
    doc: dict = {"meta": meta, "cpu": cpu}
    if cache is not None:
        doc["wiredtiger"] = {
            "cache_pct": cache.cache_pct, "dirty_pct": cache.dirty_pct, "evict_rate": cache.evict_rate,
        }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1) + "\n")


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", required=True, type=date.fromisoformat, help="show night, YYYY-MM-DD (ET)")
    ap.add_argument("--window", default="20:00-22:00", help="show window in ET (default 20:00-22:00)")
    ap.add_argument("--floor-window", default="14:00-16:00", help="same-day floor window in ET (default 14:00-16:00)")
    ap.add_argument("--gate", required=True, type=int, choices=sorted(GATES))
    ap.add_argument("--from-json", type=Path, help="read saved samples instead of DO + Prometheus")
    ap.add_argument("--save-json", type=Path, help="write the fetched samples here for re-runs")
    ap.add_argument("--db-id", default=DEFAULT_DB_ID)
    ap.add_argument("--do-aggregate", default="max", choices=["max", "avg", "min"],
                    help="how DO combines the cluster's nodes (default max: the primary)")
    ap.add_argument("--do-engine", action="append", dest="do_engines",
                    help=f"DO metrics path engine(s) to try (default {', '.join(DEFAULT_CPU_ENGINES)})")
    ap.add_argument("--prom-url", help="use a port-forwarded Prometheus instead of kubectl exec")
    ap.add_argument("--no-prometheus", action="store_true", help="CPU only; skip WiredTiger triggers")
    ap.add_argument("--evict-threshold", type=float, default=0.0,
                    help="app-thread evictions/s above which threads count as evicting (default 0)")
    args = ap.parse_args(argv)

    try:
        window = parse_window(args.date, args.window)
        floor_window = parse_window(args.date, args.floor_window)
    except ValueError as e:
        ap.error(str(e))

    notes: list[str] = []
    try:
        if args.from_json:
            cpu, cache = load_samples(args.from_json)
            notes.append(f"samples from {args.from_json}")
        else:
            span_start = min(window[0], floor_window[0])
            span_end = max(window[1], floor_window[1])
            cpu, path = fetch_do_cpu(
                args.db_id, span_start, span_end, args.do_aggregate,
                tuple(args.do_engines or DEFAULT_CPU_ENGINES),
            )
            notes.append(f"DB CPU from DO {path} (aggregate={args.do_aggregate})")
            cache = None
            if not args.no_prometheus:
                try:
                    cache, prom_notes = fetch_prometheus(*window, args.prom_url)
                    notes += prom_notes
                except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as e:
                    notes.append(f"Prometheus unavailable: {e}")
            if args.save_json:
                save_samples(args.save_json, cpu, cache, {
                    "date": args.date.isoformat(), "window": args.window,
                    "floor_window": args.floor_window, "db_id": args.db_id,
                })
                notes.append(f"samples saved to {args.save_json}")
        result = evaluate(args.gate, cpu, window, floor_window, cache, args.evict_threshold)
    except (RuntimeError, ValueError, OSError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    print(report(result, window, floor_window))
    for n in notes:
        print(f"  ({n})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
