# Dashboards + scheduled reports inventory

One-page map of every Remote Falcon visualization surface managed as
IaC. Pairs with [`alerts-inventory.md`](./alerts-inventory.md), which
covers the alert-side.

## Live dashboards

| Dashboard | Audience | Source of truth | Where to view |
|---|---|---|---|
| `rf-frontend-health` | When you want to know how the UI's doing | [`ops/posthog-dashboards/dashboards.yml`](../../ops/posthog-dashboards/dashboards.yml) | PostHog → Dashboards → `rf-frontend-health` |

## Insights (saved queries)

All insights live in [`ops/posthog-dashboards/insights.yml`](../../ops/posthog-dashboards/insights.yml). They're surfaced on dashboards (above) and reusable across multiple dashboards if needed.

| Insight | Display | Data | Purpose |
|---|---|---|---|
| `rf-frontend-pageviews-7d` | BoldNumber | `events` ($pageview) | Top-line UI traffic |
| `rf-frontend-exceptions-7d` | BoldNumber | `events` ($exception) | Top-line UI stability |
| `rf-frontend-pageviews-trend-24h` | Line graph | `events` ($pageview) | Diurnal traffic pattern + anomalies |
| `rf-frontend-exceptions-trend-7d` | Line graph | `events` ($exception) | Sustained-or-spiky regression detection |
| `rf-frontend-top-pageview-paths-24h` | Table | `events` ($pageview) | What content is hot |
| `rf-frontend-top-exception-messages-7d` | Table | `events` ($exception_list) | First place to look when exceptions trend up |

## Scheduled reports

| Report | Schedule | Source of truth | Destination |
|---|---|---|---|
| Daily PostHog digest | Daily at 14:00 UTC | [`ops/k8s/posthog-daily-digest/cronjob.yml`](../../ops/k8s/posthog-daily-digest/cronjob.yml) | Discord `#alerts` |
| Post-deploy error-rate check | Per deploy (10min after rollout) | [`ops/release-validation/check.py`](../../ops/release-validation/check.py) | Discord `#alerts` (verdict ping) + GH Actions logs |

## Why no backend dashboard

PostHog Logs lives in a separate ClickHouse table (`logs_distributed`)
that's not reachable from saved HogQL insights — only via dedicated
`/logs/count/`, `/logs/query/`, `/logs/sparkline/` endpoints (which are
read-only and run on-demand).

Backend health visibility is delivered instead by:

1. **The daily digest** — summarizes yesterday vs last week (errors,
   log volume, mongo-backup status) so you see the trend in `#alerts`
   every morning.
2. **Ad-hoc Logs explorer** — for deep dives, open
   [PostHog → Logs](https://us.posthog.com/logs) with filters.
3. **Alerts** — the alerts in
   [`alerts-inventory.md`](./alerts-inventory.md) catch sustained
   problems in real time.

This means the only thing "missing" relative to a typical observability
stack is **at-a-glance backend metrics on a wall-mountable dashboard**.
If that becomes important, options are:
- Build a PostHog Logs Saved View per metric (manual UI, not scripted)
- Send a parallel metric stream (error rate, request rate) as PostHog
  *events* instead of *logs* and put them on insights
- Add Grafana Cloud free tier and ship a second OTel pipeline (heavier
  lift; flagged in `Observability-Plan.md` as future work)

## Adding a new insight or dashboard

1. Add to `ops/posthog-dashboards/insights.yml` and/or `dashboards.yml`.
2. `./ops/posthog-dashboards/apply.sh` (dry-run, then `--apply`).
3. Eyeball the result in PostHog. If a visualization renders wrong,
   tweak `display` / `chart_x` / `chart_y` and re-apply.
4. Add a row to the table above.

## Drift detection

```sh
./ops/posthog-dashboards/apply.sh
```

`[CREATE]`, `[UPDATE]`, or `[OK]` lines per insight + dashboard. The
reconciler never deletes; operator decides which direction to converge
on `[REMOTE-ONLY]` or stale entries.
