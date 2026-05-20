# PostHog dashboards + insights — declarative config

Sources of truth:
- [`insights.yml`](./insights.yml) — saved HogQL queries, shared across dashboards
- [`dashboards.yml`](./dashboards.yml) — composes insights into dashboards

Reconciler: [`apply.py`](./apply.py) (run via [`apply.sh`](./apply.sh)).

This is the IaC layer for visualization. Manages 6 insights + 1 frontend
dashboard at the time of writing. Backend metrics live in the daily
digest (`ops/k8s/posthog-daily-digest/`) instead — PostHog saved insights
can't reach the logs table, only `events`.

## Prereqs

1. **PostHog Personal API Key with these scopes** (same key as
   `ops/posthog-alerts/`):
   - `insight:read`, `insight:write`
   - `dashboard:read`, `dashboard:write`
   - `query:read` — the HogQL queries need this

   Add at https://us.posthog.com/settings/user-api-keys, store as
   `POSTHOG_API_KEY` in `ops/.env.dev`.

2. **`apply.sh` handles Python deps** via a one-time venv at
   `~/.cache/rf-posthog-dashboards-venv`.

## Usage

```sh
set -a; source ops/.env.dev; set +a

# Dry-run: print plan
./ops/posthog-dashboards/apply.sh

# Reconcile
./ops/posthog-dashboards/apply.sh --apply
```

## How linking works

`dashboards.yml` references insights by **name** (not by ID). On apply:

1. Phase 1 — reconcile insights: create or patch each one by name.
2. Phase 2 — reconcile dashboards: create or patch the dashboard, then
   for each insight name in the dashboard's `insights:` list, fetch the
   insight's current `dashboards` array and add the dashboard ID if
   missing. This is a full-replace PATCH, so manually-attached dashboard
   memberships are preserved.

Renaming an insight means the reconciler can no longer find it (matches
by name). To rename: change the name in `insights.yml`, `apply.sh
--apply` to create the new one, then delete the old one manually in
PostHog UI.

## Adding a new insight

1. Append an entry to `insights.yml` under `insights:`. Required fields:
   `name`, `display`, `query`. Optional: `description`, `chart_x`,
   `chart_y` for line/bar graphs.
2. (Optional) Add the new insight's name to a dashboard's `insights:`
   list in `dashboards.yml` to surface it on that dashboard.
3. `apply.sh` (dry-run, then `--apply`).
4. Eyeball the result in PostHog. If the visualization looks off, edit
   the `display` field or chart axes and re-apply.

## Display types

PostHog supports these visualizations on `DataVisualizationNode`:
- `BoldNumber` — single number, big text
- `ActionsLineGraph` — time-series line chart
- `ActionsAreaGraph` — time-series area chart
- `ActionsBar` — bar chart
- `ActionsStackedBar` — stacked bar chart
- `ActionsTable` — tabular display (default)
- `TwoDimensionalHeatmap` — 2D heatmap

## Why HogQL and not TrendsQuery

PostHog has a TrendsQuery insight type that's more idiomatic for typical
event analytics (built-in breakdowns, comparison periods, etc.). We use
the HogQL/DataVisualizationNode form instead because:

1. Uniform shape across all insights — one query type to maintain.
2. Easier to read/review in YAML — the query is a plain SQL string.
3. Doesn't lose information — HogQL can express everything TrendsQuery
   can plus more (joins, custom aggregations, window functions).

Trade-off: HogQL insights don't inherit PostHog UI features like
breakdown filters and date-range overrides directly from the URL. If
that ever bites us, switching individual insights to TrendsQuery is a
local change.

## Drift detection

```sh
./ops/posthog-dashboards/apply.sh
```

`[CREATE]`, `[UPDATE]`, or `[OK]` lines per insight + dashboard. Any
non-`[OK]` line = drift. The reconciler never deletes — operator
decides which way to converge.

## Rollback

Delete the dashboard and/or insights via the PostHog UI, then remove
the matching entries from the YAML files. There's no `apply.sh
--destroy` flag by design — destructive ops are operator-driven.
