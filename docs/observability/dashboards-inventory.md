# Dashboards + scheduled reports inventory

One-page map of every Remote Falcon visualization surface managed as
IaC. Pairs with [`alerts-inventory.md`](./alerts-inventory.md), which
covers the alert-side.

Every saved insight in PostHog project 425428 is defined in
[`ops/posthog-dashboards/insights.yml`](../../ops/posthog-dashboards/insights.yml).
The portfolio was rebuilt on 2026-10-16 after an audit found most of the
previous hand-built insights miscounted (see "Measurement rules" below).
Anything in PostHog that is not in the YAML is drift.

## Live dashboards

| Dashboard | Question it answers | Insights |
|---|---|---|
| `Owner Engagement` | Project home. Are owners active, coming back, and using features? | 8 |
| `Owner Onboarding` | Are new signups verifying and getting set up? | 5 |
| `Fan-Side Activity` | Are fans getting requests/votes through, and which shows need help? | 8 |
| `Platform Health` | Is the UI healthy for owners and fans (errors, vitals, reload loops)? | 9 |
| `Remote Falcon Integration` | Are shows using RF Page Builder from the control panel? | 5 |

## Measurement rules

These come from the 2026-10-16 audit. Every query in the YAML follows them;
new ones must too.

- **Owners**: identified events on the control-panel host
  (`$host IN ('remotefalcon.com', 'www.remotefalcon.com')`). On identified
  events `distinct_id` is the show subdomain, so `uniq(distinct_id)` = shows.
- **Do not key owner funnels on person.** `sign_up` and `email_verified` are
  anonymous, and the verify link is often opened on another device, which
  never merges. A person-keyed funnel read 51% at verification when the real
  rate was 95%. Key on the show subdomain.
- **`signin` is not "active".** It only fires on password login, not when a
  saved session resumes, so it undercounts active owners by about 40%. Use
  identified control-panel `$pageview`.
- **Fans are not users.** The viewer-page `distinct_id` resets on nearly every
  page load. Count page loads, or `uniq($ip)` as an approximate fan count.
- **Count fan outcomes per page load, not per tap.** Repeat tapping skews
  per-tap rates (49.6% per tap vs 83% per load for interaction success).
- **Kiosk / reload-loop devices are excluded** from fan queries and from the
  project's test-account filters. `platform-viewer-reload-loops-14d` finds new
  ones; add them to both places.
- **Page Builder's own events (`rf_*`, `guestbook_*`) are not in this
  project.** RF Page Builder captures to its own PostHog project. RF-side
  Page Builder signal is `viewer_page_launched_external_editor` plus the
  external-api `rfpb_audit` log lines.
- **2026-08-23**: `capture_pageview: 'history_change'` made in-app route
  changes count as pageviews (control-panel pageviews about 15x). Don't
  compare across that date.

## Insights (saved queries)

### Owner Engagement

| Insight | Display | What it shows |
|---|---|---|
| `owner-active-7d` | Number | Unique shows (owners) that loaded the control panel in the last 7 days. |
| `owner-wau-90d` | Line | Unique shows loading the control panel per week (Mon-start), last ~90 days. |
| `owner-weekly-retention-90d` | Line | Of the shows active in the control panel in week W, the % that came back in week W+1. |
| `owner-shows-back-online-weekly-90d` | Stacked bar | Shows that came online each week (plugin seen connected, or viewer control turned on), split into new (signed up within 180 days) and established. |
| `owner-dau-30d` | Line | Unique shows loading the control panel per day, last 30 days. |
| `owner-feature-adoption-weekly-90d` | Line | Unique shows using each feature per week: QR codes tab, RF Page Builder launch, sequence analytics tab, notification bell, show-map visibility toggle (on or off), free page templates. |
| `owner-notification-bell-weekly-90d` | Line | Weekly bell opens, unique shows opening, unique shows clicking a notification (click_through_pct = clicking / opening), and unique shows using mark-all-read (the "dismiss without reading" counter-signal). |
| `owner-top-actions-30d` | Table | Control-panel actions ranked by unique shows over the last 30 days, with total count. |

### Owner Onboarding

| Insight | Display | What it shows |
|---|---|---|
| `onboarding-activation-funnel-14d` | Bar | Show-keyed activation funnel for shows that signed up 14–90 days ago (so every show has had its full 14 days). |
| `onboarding-cohort-weekly-14d` | Table | One row per signup week (Monday start) for shows that signed up 14–104 days ago: % of that week's signups reaching each milestone within 14 days of signup, plus median hours from signup to the first viewer-control enable. |
| `onboarding-signups-weekly-90d` | Bar | New shows signed up per week (Monday start), last 90 days, counted once per show subdomain. |
| `onboarding-signups-7d` | Number | New shows signed up in the last 7 days, counted once per show subdomain. |
| `onboarding-stuck-at-verification-90d` | Table | Shows that signed up more than 48 hours ago (within the last 90 days) and have never verified their email. |

### Fan-Side Activity

| Insight | Display | What it shows |
|---|---|---|
| `fan-rejection-rate-by-show-30d` | Table | Who to contact: shows where fans tap and get turned away, last 30d, ranked by page loads that never got a single success. |
| `fan-load-success-rate-weekly-90d` | Line | Of the page loads where a fan tapped request/vote at least once, the % that got at least one success, weekly over 90d. |
| `fan-daily-page-loads-30d` | Line | Daily viewer page loads, unique fan IPs (approx. |
| `fan-rejection-reasons-30d` | Table | Why fan requests/votes are rejected, last 30d, ranked by page loads affected rather than raw taps. |
| `fan-invalid-location-causes-30d` | Table | Invalid Location rejections split by what the browser reported (cause) and where the page was opened (client_class), last 30d, in page loads. |
| `fan-location-recovery-weekly-90d` | Line | Of the page loads that showed the location-recovery prompt, the % where the fan clicked it, in the same page load, weekly over 90d. |
| `fan-sequence-popularity-30d` | Table | Most-requested/voted sequences across all shows, last 30d, ranked by page loads that tapped them, with the number of shows offering them. |
| `fan-referrers-30d` | Table | Where fans come from, last 30d, in page loads grouped by channel, with the top 3 referring domains per channel. |

### Platform Health

| Insight | Display | What it shows |
|---|---|---|
| `platform-viewer-active-shows-7d` | Number | Distinct show viewer pages (<show>.remotefalcon.com) that got at least one page load in the last 7 days. |
| `platform-cp-pageviews-7d` | Number | Control-panel (owner app) pageviews in the last 7 days, apex host only. |
| `platform-top-error-issues-7d` | Table | Top 20 Error Tracking issues by event count in the last 7 days, one row per $exception_issue_id, with surface and blast radius. |
| `platform-exceptions-by-surface-30d` | Line | Daily $exception count, control panel vs viewer pages, last 30 days. |
| `platform-traffic-trend-30d` | Line | Daily control-panel pageviews vs distinct viewer shows with traffic, last 30 days. |
| `platform-viewer-reload-loops-14d` | Table | Viewer host + IP pairs with more than 500 page loads in one day, last 14 days. |
| `platform-viewer-script-failures-30d` | Table | Viewer page loads where the operator's viewer scripts failed, by day and show, last 30 days. |
| `platform-web-vitals-weekly-90d` | Table | Weekly p75 LCP / INP (ms) and CLS by surface, last 90 days. |
| `platform-cp-top-paths-7d` | Table | Top 15 control-panel paths by pageviews in the last 7 days, with the number of distinct owner shows (identified events) behind each. |

### Remote Falcon Integration

| Insight | Display | What it shows |
|---|---|---|
| `rfpb-shows-launching-7d` | Number | Unique shows that opened RF Page Builder from the control panel in the last 7 days. |
| `rfpb-launches-weekly-90d` | Line | Weekly unique shows launching RF Page Builder and total launches. |
| `rfpb-adoption-share-weekly-90d` | Line | RF Page Builder launchers as a % of shows active in the control panel that week. |
| `rfpb-repeat-usage-90d` | Table | Shows bucketed by how many distinct weeks they launched RF Page Builder in over 90 days. |
| `rfpb-top-shows-30d` | Table | Shows with the most RF Page Builder launches in the last 30 days, with distinct days, distinct pages and first/last launch. |

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
4. **In-cluster Prometheus + Grafana** (kube-prometheus-stack, still
   running in `monitoring`) for DO Managed Mongo metrics: connections,
   ops/s, queued readers/writers, WiredTiger cache. Exporter and PromQL
   in [`ops/k8s/mongo-metrics/`](../../ops/k8s/mongo-metrics/). Not
   IaC-managed dashboards yet.

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
4. Add a row to the matching table above, and follow the measurement rules.

## Drift detection

```sh
./ops/posthog-dashboards/apply.sh
```

`[CREATE]`, `[UPDATE]`, or `[OK]` lines per insight + dashboard. The
reconciler never deletes; operator decides which direction to converge
on `[REMOTE-ONLY]` or stale entries.
