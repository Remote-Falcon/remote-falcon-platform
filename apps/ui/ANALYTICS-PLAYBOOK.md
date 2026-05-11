# Remote Falcon Analytics PRD

A grounded, end-to-end product plan for the next-gen Analytics offering. Every chart and view in this document is backed by data we **actually collect** today (or by a small, surgical schema addition called out explicitly). Nothing here is invented or aspirational.

**Status:** Approved scope, pending implementation kickoff.
**Authored:** 2026-05-09. Update this document as the implementation lands.
**Related:** future system-admin aggregate playbook (deferred — see Forward-looking constraint).

---

## Problem & goals

**Problem:** Show owners on Remote Falcon today have a live operations dashboard that answers "is my show running right now?" in three seconds. They have **nothing** that answers the next-most-important questions: "how is my audience engaging with my show?" / "which songs are landing?" / "are people coming back?" / "how did this season compare to last?" Without those answers, owners can't curate their sequence list intelligently, can't market their show with confidence, and can't share their wins.

A new Analytics page closes that gap. It is a separate, deeper destination from the Dashboard — built for reflection, comparison, and sharing rather than for live operation.

**Goals (in priority order):**

1. **Give every show owner a reflection layer** that answers the audience-engagement and curation questions above using only data we already collect.
2. **Ship the differentiator (End-of-Season Wrapped) in time for the 2026 Christmas wrap-up** (Jan 8, 2027). A holiday product without a Spotify-Wrapped equivalent in 2026 is leaving the marketing layup on the table.
3. **Set up the data primitives** (viewer sessions, viewer ID, nightly rollup) so that a future system-admin aggregate view is a query-shape problem, not a re-instrumentation problem.
4. **Don't break the existing Dashboard.** It already does its job; analytics is purely additive.

**Non-goals:** see [Out of scope](#out-of-scope--explicit-non-goals) — explicitly: no identity tracking, no demographic data, no A/B test infrastructure, no viewer-side analytics surface, no real-time streaming charts, no system-admin aggregate view (deferred).

---

## TL;DR

The Dashboard answers **"is my show running and healthy right now?"** in three seconds.

A new Analytics page answers **"tell me about my audience and how my show is performing"** with depth, filters, comparisons, and shareable links.

The defining mental model: **this is a local-audience product.** The geofence (server default 1 mi, UI default text says 0.5 mi, all sub-2mi residential in practice) means everyone who requests or votes is literally parked outside the show. The audience isn't a global stream of viewers — it's neighbors, passers-by, and out-of-town family pulling over to watch. That reframes the entire analytics offering: time, foot-traffic, dwell, repeat visits, and curation insight matter; geographic-spread maps don't.

We propose a **4-section Analytics page** (Overview / Audience / Sequences / Health), backed by data we already collect plus **three small backend additions** (viewer-session history, anonymous viewer ID via browser localStorage, and a precomputed nightly rollup) that unlock 80% of the high-value charts. Implementation breaks into three phases: P0 (foundation, ~1 week, ships open), P1 (sessions + viewer-id + season views, ~2 weeks, ships behind beta flag), P2 (novel differentiators — Wrapped, AI recap, live panel — ~2 weeks, ships behind beta flag).

The kill shot: **End-of-Season Wrapped**. A holiday product *demands* a Spotify-Wrapped equivalent.

---

## Forward-looking constraint: don't paint admin into a corner

This playbook is scoped to the **per-show owner** view. A separate, future playbook will design the **system-admin aggregate view** — total viewers across all shows tonight, plugin-version distribution platform-wide, geographic spread of shows on the map, top sequences across the platform, etc.

We will not design that view here. But every data shape and schema addition below is chosen so an admin aggregate is a **simple sum / group-by**, not a rebuild:

- **A1 viewer sessions are per-show.** Admin aggregate is "sum over all shows" — the schema shape doesn't change. The admin "platform-wide dwell distribution" is the union of every `Show.viewerSessions[]`, no extra fields required.
- **A2 nightly rollup is per-show-per-night.** This is the killer enabler for admin: a platform-wide "tonight" view is just `db.showNightlyRollup.aggregate({ $match: { date: today } })` summed by metric — no scanning raw `Stat.Page` events across thousands of shows. **Make sure A2 captures every metric the per-show views need**, so admin queries never have to fall back to raw events.
- **Show-level geography already exists.** `Show.preferences.showLatitude` / `showLongitude` are stored per show. The admin aggregate "map of where Remote Falcon shows are running tonight" works today with no schema change — that's where geo *does* matter, not at the viewer level.
- **AI recap (V20) generation should run server-side from the rollup, not from raw stats.** That keeps the same code path reusable for an eventual "platform recap" or "weekly admin summary email."
- **Wrapped (V21) data flow** should pull from A2 rollup. An admin can later build a "platform Wrapped" — total viewers across the network, top sequence platform-wide — from the same source, just summed differently. Auth gating differs (per-show is public, platform-wide is admin-only) but the data path is shared.
- **Session-window definition** (the 5-min idle threshold from open question #1) needs to be the **same** server-side constant, so per-show "dwell" and admin "platform-wide median dwell" are always apples-to-apples.

The admin playbook will inherit all these primitives. **No additional schema work should be needed for the admin view** beyond what's specified here — the wins are all in query patterns and presentation. If the admin playbook later finds it needs a new schema field, that's a signal we got something wrong here and should fix it in this playbook first.

This is the only mention of admin in this document. Everything below is per-show.

---

## Principle: Dashboard vs Analytics

| | Dashboard | Analytics |
|---|---|---|
| **Question** | "Is it working right now?" | "How did it go and why?" |
| **Refresh** | Live (5s polling) | On-demand, filterable |
| **Time scope** | Now / today | Tonight / season / custom range |
| **Cardinality** | One number per stat | Distributions, trends, breakdowns |
| **Interaction** | Glance, then go | Click, filter, drill, share |
| **Audience** | Show operator mid-show | Show owner before/after the show |
| **Stays in scope today** | 4 stat tiles, Now Playing card, charts hint area | Full sub-route at `/control-panel/analytics` with its own SubNav |

**The current dashboard already does the first job well.** This playbook does *not* propose changes to the live dashboard chrome. The new Analytics page is a separate first-class destination.

---

## Personas & jobs-to-be-done

We have one primary persona, two adjacent ones. All work below targets the primary; adjacents are validated as "doesn't break for them."

### Primary: The hobbyist show owner ("Owner")
Sets up an FPP/xLights show in their front yard for a holiday season (Christmas dominantly, Halloween secondarily, sometimes year-round). Sub-2mi residential geofence. Tens to a few hundred concurrent viewers on a busy night. Tech-comfortable but not professional — they configure things, they don't write SQL. They're proud of their show and active in Facebook groups for Remote Falcon, FPP, and Christmas-light hobbyists.

**Jobs-to-be-done:**
- *Reflective:* "After tonight's show, tell me how it went compared to other nights — did more people come? Did the new song go over well? Did anyone come back?"
- *Curatorial:* "Which sequences are getting requested or voted-on the most? Which fall flat? Should I drop the songs nobody's choosing?"
- *Schedulability:* "Should I run my show on Tuesday too, or only weekends?" / "When does the audience peak so I know when to start the show?"
- *Bragging-rights:* "Give me something I can post on Facebook at the end of the season that makes my neighbors and the show-owner community go 'whoa.'"
- *Operational hygiene:* "Is my plugin connected? Were there gaps tonight? Is everything pre-show ready?"

### Adjacent: The new show owner ("Newcomer")
Just signed up. No historical data yet. Should not see error states or "no data" walls of empty charts. Should see a friendly "you'll have data here after your first show" treatment.

**JTBD:** "Show me what this is going to look like once I have data, so I know I'm getting value."

### Adjacent: The seasonal returning show owner ("Returner")
Set up Remote Falcon two seasons ago, ran it for Christmas, came back this October to start their Halloween prep. Wants to remember what worked last time. Wants Wrapped from last year. Wants year-over-year compare.

**JTBD:** "Carry forward what I learned last season. Show me last-Christmas-vs-this-Christmas at any point during the season."

---

## Success metrics

We'll know the analytics page worked if all of these hit by end of the 2026 Christmas season (Jan 8, 2027 measurement date):

| Metric | Target | Measurement |
|---|---|---|
| **Engagement** | ≥40% of weekly active show owners visit `/control-panel/analytics` at least once during their season | PostHog page-view event on `analytics_*` route |
| **Wrapped reach** | ≥25% of generated Wrapped pages get at least one outbound share-button click | Click-tracking on the share button |
| **Stickiness** | Median session duration on the analytics page ≥ 90 seconds | PostHog session-recording duration on `analytics_*` routes |
| **Support deflection** | Zero net increase in support tickets in the 30 days post-launch vs the 30 days prior | Support ticket count comparison |
| **Beta adoption** | ≥30% of show owners opt-in to the beta flag for P1+ features within 30 days of P1 launch | Count of `preferences.analyticsBetaOptIn = true` |
| **AI recap value** | ≥20% of beta opt-in owners view the AI recap on at least 5 distinct nights of their season | PostHog event |

**What we're explicitly not measuring as success:** subscription retention (too noisy, too many other variables). We'll track it directionally but not as a pass/fail bar for this work.

---

## Current state inventory

Source: full code audit, [GraphQL queries](src/utils/graphql/controlPanel/queries.jsx) + [DashboardService.java](../control-panel/src/main/java/com/remotefalcon/controlpanel/service/DashboardService.java).

**Actively visualized** today (in `dashboard/DashboardCharts.jsx`):
- `Unique Viewers by Date` — line, deduplicated IPs per day
- `Total Viewers by Date` — line, all page visits per day
- `Sequence Requests by Date` — line, daily totals (jukebox mode)
- `Sequence Requests` — bar, all-time per-sequence totals (jukebox mode)
- `Sequence Votes by Date` — line, daily totals (voting mode)
- `Sequence Votes` — bar, all-time per-sequence totals (voting mode)
- `Total Wins by Date` — line, votes that *won* a round, daily (voting mode)
- `Sequence Wins` — bar, all-time per-sequence wins (voting mode)
- Date range picker + CSV export of all the above

All seven charts are implemented in [ApexLineChart.jsx](src/views/pages/controlPanel/dashboard/ApexLineChart.jsx) / [ApexBarChart.jsx](src/views/pages/controlPanel/dashboard/ApexBarChart.jsx) on `react-apexcharts`. Re-use the same components.

**Collected at IP-level but only shown as daily aggregates:**
- Every `Stat.Page` event (IP + UTC timestamp) — we know exactly when each visitor arrived
- Every `Stat.Jukebox` request (sequence name + UTC timestamp)
- Every `Stat.Voting` event (sequence name + UTC timestamp)
- Every `Stat.VotingWin` event (sequence name + win count + timestamp)
- Per-vote voter IP list (`Vote.viewersVoted`) and per-request requester IP (`Request.viewerRequested`)
- Active viewers (latest visit per IP, with timestamp)

**Captured at request-time but intentionally discarded:**
- **Geolocation lat/long** on every request and every vote. This is *only* used to enforce the geofence: if the viewer is inside the show owner's `allowedRadius` (default 0.5 mi), the request/vote is allowed; otherwise blocked. Persisting it would tell us nothing useful — by definition every saved value would cluster within a tiny radius of the show. **Don't store it.**
- *Page views* are not geofenced — anyone on the public viewer page generates a `Stat.Page` event. The IP itself can be reverse-geocoded server-side via a free MaxMind GeoLite2 lookup if we ever want a "viewers came from N states / countries" line for Wrapped, but it's a low-priority, low-signal add. Most viewers are local; the IP geo would correctly say "everyone is within 5 miles" most of the time.

**Operational data on the Show document, never surfaced:**
- `pluginVersion` / `fppVersion` (FPP plugin versions)
- `lastFppHeartbeat` (plugin connectivity timestamp)
- `lastLoginDate` / `createdDate` / `expireDate`
- `psaSequences[].lastPlayed` (PSA scheduling history)
- `preferences.sequencesPlayed` (counter)

**Not collected at all (and we shouldn't pretend otherwise):**
- Viewer identity beyond IP — no auth, no cookies, no demographics
- Session duration — we don't log "viewer left" events
- User agent / device class
- Referrer / how the viewer found the show
- Subscription/payment data (it's open-source)

---

## Proposed schema additions (small, surgical)

Two changes to `libs/schema` unlock most of the high-signal views. Each is independently shippable.

### A1. Persist viewer session history (not just latest visit)
**Change:** new `Show.viewerSessions[]` collection-style field. Each session = `{ ip, firstSeen, lastSeen, eventCount, nightDate }`. On `updateActiveViewers` and `insertViewerPageStats` mutations: if an entry exists for this IP and `lastSeen` was within the last 5 minutes (same dwell session), extend `lastSeen` and bump `eventCount`; otherwise append a new session row tagged with the show's local date.
**Unlocks:** **dwell-time distribution** ("how long do cars park outside?" — the killer chart for this product), "new tonight" vs "returning tonight" cohort split, "regulars" detection across the season (same IP appearing on multiple show-night dates), churn-during-show timeline.
**Effort:** ~4 hours backend. ActiveViewer write path already does an atomic pull+push — same pattern with a session-window accumulator.

### A2. Nightly precomputed rollup document
**Change:** new `ShowNightlyRollup` document — one per show per night — populated by a midnight cron in `mongo-backup` or a new tiny scheduled job. Holds: viewer count (unique viewerIds / total page hits), peak concurrent, peak hour, median dwell, top sequence requested, top sequence voted, top winning sequence, request count, vote count, returning-viewer percentage.
**Unlocks:** calendar heatmap, season-summary, end-of-season Wrapped — without scanning years of raw `Stat.Page` events on every page load.
**Effort:** ~4 hours. Reuses the existing `DashboardService` aggregation methods inside a new daily job.
**Admin-aggregate enabler:** this document is the foundation for the future admin view. Be generous about which metrics get rolled — anything any per-show chart shows should appear here at least as a single number, so admin queries never have to fall back to scanning raw events across thousands of shows.

### A3. Anonymous viewer ID via browser localStorage
**Change:** the viewer page generates a random UUID on first visit, persisted in `localStorage` under key `rf-viewer-id`. Every GraphQL mutation from the viewer page (page-view ping, request, vote, active-viewer update) passes the UUID as an argument. Backend stores it as a new `viewerId: String?` field on `Stat.Page`, `Stat.Jukebox`, `Stat.Voting`, `ActiveViewer`, and the relevant slot on `Vote.viewersVoted` / `Request.viewerRequested`. **Always nullable** so historical events without an ID stay valid.

This solves the IP-stability problem (mobile carriers rotating IPs, CGNAT collapsing many users to one IP) cleanly. localStorage > cookie because cookies auto-attach to every request (CSRF surface, bandwidth) and have heavier legal connotations under GDPR. Both are user-defeatable by clearing browser data — that's fine, the UUID is for stat quality, not authentication.

**Implementation pieces:**
- New script in `remote-falcon-viewer-page-js/viewer-id.js` (~15 lines): lazy-create UUID, expose via `window.rfViewerId()`. Gets injected into the user-customized viewer-page HTML the same way the existing countdown/snow scripts do.
- Update viewer-quarkus mutation signatures to accept `viewerId: String?` as an optional arg. Pass through to the existing repository write paths.
- Schema-additive only — every field is nullable; legacy events fall back to IP.

**Unlocks (cleanly):**
- V7 New vs returning: viewerId-first, IP-fallback. Honest for the modern browser visitor; older visits still counted approximately.
- V8 Season regulars: same. Now genuinely tells the truth — "Viewer #1 has visited from this device on 12 distinct nights."
- Cross-night dedup in the rollup `unique viewers` count is now meaningful even when mobile IPs rotate.

**Effort:** ~6 hours total. Requires touching three repos (viewer-page-js, viewer-quarkus, libs/schema) but each touch is small.

**Privacy posture:** this is a **first-party, non-tracking, non-identifying** browser-local UUID. No data leaves the show's own domain. Worth a one-line passive privacy notice in the viewer-page footer ("This show uses anonymous device identifiers to count returning visitors") to be tidy under GDPR/CCPA. Not strictly required for first-party first-purpose analytics, but cheap and right.

**Total schema work to enable everything below:** ~1.5 days of backend work, all backwards-compatible (additive only).

**What we are explicitly NOT adding:** persistent viewer geolocation. Lat/long is geofence-only and saving it would just cluster every record within 0.5 mi of the show — no signal worth the privacy footprint. If we ever want a marketing-style "viewers came from N states" line, we can do a one-shot IP→country lookup against `Stat.Page` IPs at rollup-time without storing anything sensitive.

---

## Season model

Remote Falcon supports "any light show" — Christmas dominantly, Halloween secondarily, with some users running year-round. The season concept therefore needs to be flexible without becoming a settings-page nightmare.

**Built-in presets** (always available to every show, no config required):
- **Halloween:** Oct 1 – Nov 7
- **Christmas:** Nov 15 – Jan 7

**Per-show preferences** (new fields on `Preference`):
- `customSeasons: List<Season>` where `Season = { name: String, startMonthDay: String, endMonthDay: String }`. Default empty. Owner can add e.g. `{ name: 'Fourth of July', startMonthDay: '06-15', endMonthDay: '07-10' }`. Cap at 4 custom seasons per show to keep the date-picker tidy.
- `yearRoundMode: Boolean` (default false). When true, the season presets disappear from the date-range picker and rolling-window presets take over (Last 7 nights / Last 30 nights / Last 90 nights / This year / Last year).

**Season computation is date-math, not stored.** `ShowNightlyRollup` does NOT carry a `season` field — seasons are derived from each rollup's date when the data is queried. Adding/removing custom seasons doesn't trigger backfill or rebuild; it just changes how the picker labels things.

**Wrapped per-season firing:**
- Christmas Wrapped becomes available Jan 8 (day after Christmas season end), persists indefinitely
- Halloween Wrapped becomes available Nov 8
- Custom-season Wrapped becomes available the day after `endMonthDay`
- Year-round-mode owners get a **Year in Review** Wrapped on Jan 1 instead of seasonal ones

**Settings UI** lives as a single new card in `/control-panel/remote-falcon-settings/viewer-page` — "Show seasons" with the year-round toggle and the custom-seasons editor. Hidden behind a "Show advanced" disclosure so newcomers don't see it.

---

## Proposed Analytics page structure

New first-class route: `/control-panel/analytics`. Sub-route layout (per the SubNav pattern from [Settings](src/views/pages/controlPanel/viewerSettings/index.jsx)):

```
/control-panel/analytics
  /overview        ← default
  /audience
  /sequences
```

**Health views live on the Dashboard, not in Analytics.** Operational readiness is an at-a-glance Dashboard concern by the playbook's own Dashboard-vs-Analytics framing. V19 (pre-show checklist) moved to the Dashboard during the P0 build. V17 (FPP heartbeat timeline) and V18 (plugin version distribution) are reflective and could land in either Dashboard or Analytics — to be decided when they're built in P2.

Header chrome: PageHead with `title="Analytics"`, smart-preset date range in `actions` slot (Tonight / Last show / This weekend / Season-to-date / Last season / Custom). All filter state is **URL-encoded** (`?range=last-week&compare=prior&filter=jukebox`) so views are shareable and bookmarkable.

Add a new menu entry under `Show` group in [controlPanel.jsx menu items](src/menu-items/controlPanel.jsx), positioned between Sequences and Viewer Page (`{ id: 'analytics', icon: IconChartHistogram, url: '/control-panel/analytics' }`).

---

## View catalog

Each view below maps to specific data we already collect (or a P1/P2 schema addition labeled in `[brackets]`). Effort is rough: S = ≤4h, M = 4–12h, L = >12h.

### Overview tab (`/analytics/overview`)

#### V1. Narrative auto-summary
**What:** A single paragraph at the top of the page. Templated, no LLM (yet — see V18).
*"On 12 nights (Nov 24 – Dec 8), 2,341 unique viewers watched your show. Saturday Dec 7 was your peak (412 viewers, +28% vs. average). Carol of the Bells was your top requested sequence (84 plays). 67% of viewers came from within 25 miles."*
**Data:** `Stat.Page`, `Stat.Jukebox`, `Stat.Voting`, `[A1]` for the geo line.
**Effort:** S (just string templating against existing aggregates).

#### V2. 4-stat hero row with sparklines
"Viewers (this period)" / "Requests (this period)" / "Votes (this period)" / "Show nights live". Each with a sparkline of the last 14 days and a "+18% vs. prior period" delta. Modeled on the existing `LiveStatsRow.jsx` but with sparkline and compare-to-prior added.
**Data:** existing `dashboardStats.page`, `jukeboxByDate`, `votingByDate`.
**Effort:** S.

#### V3. Calendar heatmap (season-level)
GitHub-contributions-style grid. Rows = months in the season, columns = days. Cell color = total viewers that day. Hover for tooltip with stats. Click to filter all other views to that night.
**Data:** `Stat.Page` aggregated to daily. `[A3]` makes it scale; without A3 it's slow on multi-season ranges.
**Effort:** M. No off-the-shelf MUI component — build with SVG (~150 lines) or pull `react-calendar-heatmap`.

#### V4. Hourly engagement heatmap (the killer chart)
Per agent 2: *"the single most underrated chart for show analytics."* Rows = nights in the date range, columns = 5-minute buckets from configured show start to end. Cell color = viewer count. Reveals patterns like "Saturday 7:45 is your peak" instantly.
**Data:** `Stat.Page` raw timestamps bucketed by 5min × LocalDate (timezone-aware via existing `convertStatDateTime` helper).
**Effort:** M.

### Audience tab (`/analytics/audience`)

This whole tab leans into the local-audience reality: people are parking outside, watching, requesting, and leaving. The interesting questions are about *time spent*, *return visits across the season*, and *foot-traffic curves*.

#### V5. Concurrent viewers timeline (per-night)
Stacked area chart, x = time-of-night, y = concurrent viewer count — a proxy for "how many cars are parked outside right now." Pin via dropdown to a specific night, or aggregate across the date range with one line per night. Vertical markers for sequence-change events overlaid (we have `Stat.Jukebox` timestamps already).
**Data:** Derived from `Stat.Page` + `[A1]` viewer sessions. Each IP is "active" between `firstSeen` and `lastSeen` of its session.
**Effort:** S with A1.

#### V6. Dwell-time distribution (the foot-traffic killer chart)
Histogram, x = how long an IP stayed (1–5 min / 5–15 min / 15–30 min / 30+ min), y = number of viewers. Reveals "drive-by" viewers vs. ones who actually parked and engaged. Compare nights or compare to the season median.
**Data:** `[A1]` viewer sessions, `lastSeen − firstSeen`.
**Effort:** S after A1. **High-signal — this answers a question no other Christmas-light platform answers.**

#### V7. New tonight vs returning tonight
Two-bar comparison per show-night: "first time tonight" vs "returning visitor tonight." Uses the viewerId (`[A3]`) as primary identifier; falls back to IP for visits that pre-date A3 or have localStorage disabled.
**Data:** session counts from `[A1]` grouped by `nightDate`, identity from `[A3]` viewerId with IP fallback.
**Effort:** S.

#### V8. Season regulars
Horizontal bar chart of the top 20 viewerIds by number of distinct show-nights attended. Anonymized as "Viewer #1," "Viewer #2" etc. — never expose the IP or UUID. *"You have 8 regulars who've watched 5+ nights this season."* Owners love this — these are their neighbors.
**Data:** `[A1]` sessions grouped by `[A3]` viewerId (IP-fallback for legacy events), distinct `nightDate` count.
**Effort:** S after A1 + A3. **Genuinely novel for this domain. The viewerId addition (A3) is what makes this rigorous instead of approximate** — without it, mobile carriers rotating IPs would collapse many regulars into noise.

**Honesty footnote in the UI:** "Returning-visitor counts are based on a per-device identifier stored in the browser. Cleared browser data and incognito sessions count as new viewers. Multi-device viewers (phone + tablet) count once per device."

#### V9. Active-hour distribution
Bar chart, x = hour-of-night, y = average viewers at that hour across all show nights in range. Answers "when should I tell people to come?" Especially useful pre-season for the owner's social-media post.
**Data:** `Stat.Page` timestamps, hour bucket via timezone-aware grouping.
**Effort:** S.

#### V10. Foot-traffic per night-of-week
Bar chart, x = day of week (Sun–Sat), y = average viewers per night that day-of-week. Saturday vs Tuesday is the obvious split, but seeing it quantified influences scheduling decisions ("worth running the show Tuesday, or just on weekends?").
**Data:** `Stat.Page` daily aggregates grouped by day-of-week.
**Effort:** S.

### Sequences tab (`/analytics/sequences`)

#### V11. Top requested sequences with rank delta
Horizontal bar chart, top 20 sequences by request count. Each bar shows the rank change (`+3 ▲` / `−2 ▼`) vs. the prior period. Spotify-for-Artists pattern. Click a row → filters the page to that sequence.
**Data:** `dashboardStats.jukeboxBySequence` (current period) + same query for prior period.
**Effort:** S.

#### V12. Top voted sequences with win rate
Same shape as V11 but for votes, with an extra column: "win rate" = `votingWinBySequence / votingBySequence`. Reveals "this sequence gets votes but never wins" — a real insight for show curation.
**Data:** `dashboardStats.votingBySequence` + `votingWinBySequence`.
**Effort:** S.

#### V13. Sequence-detail entity page
Per agent 2's "dedicated entity pages" recommendation. New route `/analytics/sequences/:sequenceName` with:
- Header: sequence name + image + tonight/season totals
- Time-series of requests/votes for this sequence
- Hour-of-night bucket: when do people request this song? ("Carol of the Bells peaks at 7:45 PM")
- Position-in-queue distribution (where does it land when requested?)
- Repeat-requester ratio: of all the times this song was requested, how many came from a returning IP?
**Data:** `Show.stats` filtered to a single sequence name + `[A1]` sessions for the repeat-requester line.
**Effort:** M. Bookmarkable URL is the key win — show owners will share these to Facebook groups.

#### V14. Sequence ↔ category mix donut
One donut per period: requests/votes broken down by sequence `category` (Christmas / Halloween / Pop / etc.). Use sparingly — only one donut, never more.
**Data:** join `Stat.Jukebox` against `Show.sequences[].category`.
**Effort:** S.

#### V15. Request → play conversion
Funnel: requests → made-it-to-the-queue → actually played. With the jukebox queue depth limit, some requests get rejected for "queue full" — this surfaces how often that happens, which informs whether the depth limit is set right.
**Data:** `Show.stats.jukebox` (successful requests) + the rejection log if we add one.
**Effort:** M (needs rejection events to be logged — small backend add).

#### V16. PSA effectiveness panel
For owners using managed PSAs: when did each PSA play? How many viewers were active when it played? Did request rate dip after it played?
**Data:** `Show.psaSequences[].lastPlayed` + `Stat.Page` correlation.
**Effort:** M. Niche but a clean differentiator for owners running ad-supported shows.

### Health views (live on the Dashboard, not Analytics)

V19 ships on the Dashboard. V17 and V18 are deferred to P2 — placement (Dashboard vs Analytics) decided then.

#### V17. FPP heartbeat timeline
Visual gantt-style "uptime bar" showing connectivity across the season. Green bands = healthy heartbeats received, red bands = gaps >5 min, gray = before first connection. Hover for exact duration.
**Data:** `lastFppHeartbeat` history — currently we only store the latest. Needs minor backend change to keep a rolling 30-day heartbeat log (could be the simplest version of `[A2]` rollup).
**Effort:** M.

#### V18. Plugin / FPP version distribution
Useful to support: bar chart of plugin versions across time. Shows when an owner upgraded.
**Data:** `pluginVersion` / `fppVersion` change history — needs to be logged on each plugin connect (currently overwritten in place).
**Effort:** M (requires log-on-change). Skip if scope is tight.

#### V19. Pre-show checklist health
A standalone card pinned at the top of the Health tab. Today/before-tonight checks: viewer page set? location radius reasonable? at least one active sequence? plugin connected in the last hour? Each as a green check or amber warning row. Reuses the existing `checkErrorsAndWarnings` logic from MainLayout (already hidden because the alerts now show in-content).
**Data:** show preferences + current state.
**Effort:** S.

### Differentiators (across tabs, P2)

#### V20. AI nightly recap
A 2-sentence written narrative beneath V1 ("Last night had your highest single-hour engagement of the season — 142 viewers between 7:45 and 8:00 PM, with median dwell of 18 minutes (well above your 11-minute season average). Carol of the Bells was requested 12 times — 4 by returning regulars.") Generated nightly via a server-side LLM call against the rollup. Linear and PostHog shipped these in 2025; users actually read them.
**Data:** the `[A2]` rollup, fed to Claude Haiku or similar.
**Effort:** M. Entire feature is one prompt + one API call + one nightly trigger. Cost: pennies per show per season.

#### V21. End-of-Season Wrapped (the "kill shot" for a holiday product)
Single shareable URL `/wrapped/:showSubdomain/:season`. Spotify-Wrapped-style scrolling card stack:
- "You hosted XX show nights this season"
- "YYY unique viewers parked outside"
- "Median visitor stayed N minutes" (dwell — this is the magic stat)
- "Your most loyal regular came back N nights"
- "Top requested sequence: Carol of the Bells (47 plays)"
- "You played Carol of the Bells for 3 hours and 41 minutes total"
- "Your peak night was Saturday Dec 7, with N viewers between 7:45 and 8:15 PM"
- "Your busiest hour all season: Saturdays at 7:30 PM"
PNG export per card for Facebook sharing.
**Data:** rolled-up from `[A1]` sessions + `[A2]` nightly rollup. **Public URL — no auth required**, only "season has ended" gating.
**Effort:** L. Worth it. This is the marketing moment for the Remote Falcon brand each January.

#### V22. Live "right now" panel
Show-night-only floating panel (small persistent card in lower-right when on Analytics tab): current viewer count + current song + queue depth + average dwell-so-far tonight, refreshing every 30s. Twitch creator-dashboard style. Could double as "kiosk mode" for someone running the show off a tablet.
**Data:** `dashboardLiveStats` + `[A1]` sessions for the dwell line.
**Effort:** M.

---

## Filter and interaction patterns

Apply consistently across all tabs:

- **Date-range with smart presets**: Tonight / Last show / This weekend / Season-to-date / Last 7 nights / Last season / Custom. Default = "Season-to-date." Live in topbar PageHead `actions`.
- **Compare-to-prior toggle**: dotted overlay on every time-series; delta % in every stat tile. Default off, sticky once enabled.
- **Sticky filter chip row** under the SubNav: active filters render as removable chips (sequence name, day-of-week, jukebox-vs-voting, etc.).
- **URL-encoded everything**: `?range=last-7&compare=prior&filter=carol-of-the-bells&dow=sat` — Linear / PostHog table-stakes pattern.
- **Click-to-filter cascade**: click a sequence in V11 → opens V13 sequence-detail. Click a night-of-week bar in V10 → filters all charts to that day-of-week.
- **Hover-then-pin tooltips** on charts (Vercel Analytics 2025 pattern) — click a point to pin its tooltip so you can compare two points without losing either.

---

## Acceptance criteria

Per-view acceptance is uniform across the catalog unless explicitly noted otherwise. A view ships when **all** of:

1. **Renders without error** in Chrome, Firefox, and Safari at 1440px desktop; collapses cleanly at 768px and 375px (single-column stack, charts shrink, no horizontal scroll on a phone).
2. **Matches the documented data source** — the underlying GraphQL query / aggregation reflects the value shown. Verified by hand-spotting at least one data point against the mongo source.
3. **Empty state is intentional** — no raw "no data" or 500 banner. New show with zero history sees the friendly "you'll have data here after your first show" treatment ([EmptyState](src/ui-component/EmptyState.jsx) component already exists).
4. **Loading state is intentional** — skeleton, not spinner; respects the existing skeleton pattern in `ui-component/cards/Skeleton/`.
5. **Filter cascade works** — when the page-level date range or any chip filter changes, this view re-fetches and re-renders correctly with no stale data flashes.
6. **URL-encoded state round-trips** — share the URL, paste in a new tab, see the same view.
7. **Telemetry instrumented** — PostHog event fires on first render and on any user interaction (filter change, click-to-drill, chart tooltip pin).
8. **Accessible** — keyboard-navigable filter controls, chart elements have `aria-label` summaries, color is not the only signifier of state (icons or text accompany).

Views that need extra acceptance bars are noted inline in their catalog entry (e.g., V19 Wrapped has a separate "PNG export renders correctly" bar).

---

## Non-functional requirements

### Performance
- **Initial page load** (P0 views, no schema changes): ≤ 2.0s on a typical broadband connection from cold cache. ≤ 3.5s on slow 4G (Lighthouse mobile profile). Bundle the analytics page as a separate Loadable chunk so it doesn't bloat the existing app shell.
- **Chart render**: any chart on the page renders within 600ms of its data being available.
- **Date-range change**: ≤ 800ms from interaction to all charts re-rendered with new data on Season-to-date queries.
- **Live tile refresh** (V20 Live panel): polling cadence stays at the existing dashboard's 5s. Non-live analytics polling on the Tonight preset: 30s.
- **A2 nightly rollup query**: ≤ 200ms server-side for any date-range Wrapped or season-summary query (the rollup is small enough to scan unindexed for years; add a `(showId, date)` compound index to be safe).

### Scale
- Built for the realistic ceiling: a few hundred concurrent viewers per show, ≤ 500 active shows in any given hour platform-wide, season totals up to ~10,000 page-view events per show. Heatmap caps at 6h × 30 nights × 5-min buckets = 2,160 cells — well within ApexCharts comfort zone.
- No SSE/WebSockets — polling is fine at this scale.

### Browser & device support
- **Primary:** modern desktop Chrome, Firefox, Safari (last 2 versions). Owner does most analytics review at a desk.
- **Secondary:** mobile-responsive via the existing MUI breakpoints. Single-column collapse below 900px. No separate mobile design pass.
- No IE11. No "responsive but broken on iPad" — iPad Safari is included in the primary tier.

### Accessibility
- WCAG 2.1 AA target. Keyboard nav for all filter controls. Chart `<svg>` elements wrapped with `role="img"` and an `aria-label` summary ("Hourly engagement heatmap, 30 nights × 12 5-minute buckets, peak Saturday 7:45 PM with 142 viewers"). Color is paired with icons or text in every state indicator.

### Internationalization & timezones
- All chart aggregations remain timezone-aware via the existing `convertStatDateTime` helper. "Tonight," "Last show night," and similar relative presets resolve in the show's configured timezone (`Show.timezone`), not the viewer's browser timezone.
- Copy is English-only for v1. Prepared for i18n via `react-intl` (already a dep) but no string-extraction work in scope.

---

## Telemetry plan

The analytics page itself needs analytics. We'll wire PostHog events for:

**Per-page-view events:**
- `analytics_page_viewed` — properties: `tab` (overview/audience/sequences/health), `dateRangePreset`, `compareToPrior` boolean, `viewerIdPresent` boolean
- `analytics_view_rendered` — properties: `viewName` (V1–V22), `tab`, render time ms (P95 visibility)

**Per-interaction events:**
- `analytics_filter_changed` — properties: `filterType` (date / chip / sequence / day-of-week), `previousValue`, `newValue`
- `analytics_drilled` — properties: `from` (e.g. "v11_top_requested"), `to` (e.g. "v13_sequence_detail"), `entityName`
- `analytics_tooltip_pinned` — for the Vercel-style pinned-tooltip pattern; tells us if anyone uses it

**P2-specific events:**
- `wrapped_viewed` — properties: `showSubdomain`, `season`, `referrer` (auth'd vs public link)
- `wrapped_card_shared` — properties: `cardName`, `shareDestination` (PNG download / native share API)
- `ai_recap_viewed` — properties: `nightDate`, `recapTokenCount`
- `ai_recap_clicked_followup` — if the recap surfaces a follow-up CTA

These flow into the same PostHog project the marketing site uses ([memory: feedback_no_brand_inference](#) — confirm with user before assuming the project name). Success metrics in the PRD are computed from these events.

---

## Privacy & compliance posture

Remote Falcon is a first-party, first-purpose analytics setup: every metric is for the show's own use, no data leaves the show's domain, no cross-site tracking, no third-party trackers embedded in the viewer page.

**What we collect on the viewer page:**
- IP address (already collected today, used for geofence enforcement and request dedup)
- A new anonymous viewer-ID UUID stored in browser localStorage (A3, this PRD)
- Page-load timestamp, sequence-request and vote events with timestamp

**What we do NOT collect:**
- Names, emails, accounts (no auth on viewer side)
- Cross-site cookies, tracking pixels, third-party scripts
- Persistent device fingerprinting beyond the localStorage UUID
- Lat/long (received transiently for geofence check, never persisted)

**GDPR / CCPA stance:** under both regulations, first-party analytics for the operator's own purposes does **not** require explicit consent. We do not need a cookie banner. We will, however, ship a one-line passive notice in the viewer-page footer:

> *"This show counts visits and remembers returning devices via an anonymous browser ID. No personal information is collected."*

This is hygiene, not legal-required. Owners running shows in EU jurisdictions can layer their own additional notice if they choose. The notice is part of the viewer-page template chrome, not a modal — it does not block anything.

**Data retention:**
- Raw `Stat.Page`, `Stat.Jukebox`, `Stat.Voting` events: existing 18-month auto-purge keeps as-is.
- `ShowNightlyRollup` documents (A2): **never expire.** They're tiny (~150 rows per show, ever) and they're what Wrapped and year-over-year compare query. This is the data lifecycle change that makes long-horizon Wrapped possible.
- `Show.viewerSessions[]` (A1): trim entries older than 18 months on the same purge cycle that handles raw stats.
- localStorage viewer-ID: persists per browser indefinitely; user can clear it at any time via standard browser controls.

---

## Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A1 viewer-session tracking adds write-amplification on the hot `updateActiveViewers` mutation, slowing every viewer-page poll | Medium | High | Use the same atomic pull/push pattern the existing ActiveViewer write uses. Bench against a synthetic 500-IP show before P1 ships. Shed sessions older than the dwell window from the doc, not just the rollup. |
| R2 | A3 viewer-ID rollout breaks an existing user-customized viewer page that didn't expect the new arg | Low | Medium | New mutation arg is optional. Existing viewer pages call mutations without `viewerId` — backend stores `null`, falls back to IP. Communicate in changelog so owners customizing their own templates know the new script is available. |
| R3 | "Season regulars" view (V8) gets a privacy complaint when an owner recognizes "Viewer #1" as a specific neighbor and tries to act on it | Low | Medium | Only show counts and night-totals, never the IP or UUID. Footnote framing emphasizes anonymity. If complaints accumulate, add an admin opt-in toggle (Q6 in old open-questions). |
| R4 | AI recap (V20) generates a hallucinated stat (e.g. "your viewers stayed 2 hours") because the prompt context was wrong | Medium | Medium | Constrain the prompt to a structured JSON of pre-computed numbers; instruct the model to ONLY restate them in prose, not derive new ones. Show a small "AI-generated, based on tonight's stats" tag under the paragraph. Provide a "Report inaccuracy" link that posts to the rf-build issue tracker. |
| R5 | Wrapped public URL (V21) gets shared by an owner who doesn't realize the share-card includes their show subdomain (which IS already public, but the framing matters) | Low | Low | The viewer page URL is already public — Wrapped reveals the same surface area. Add a one-line note on the Wrapped page: "This page is shareable. Anyone with the link can view your season summary." |
| R6 | A2 nightly rollup cron job fails silently for a window of nights, leaving holes in the calendar heatmap and Wrapped | Medium | High | Health-tab indicator: "Last rollup ran at 12:14 AM (success)" or red bar if the most recent rollup is missing or stale. Job emits a Sentry breadcrumb on every run. |
| R7 | Mobile-responsive analytics page is acceptable on phone but the heatmap (V4) is unusable at 375px | High | Low | Below 768px, swap the heatmap for a compact "top 5 hours" list. Document in the V4 acceptance criteria. |
| R8 | The analytics page becomes the new "support ticket factory" because every chart needs an explanation | Medium | Medium | Every view has an `info` icon next to the title that opens a one-paragraph "what this shows and how to read it" popover. Same component for all 22 views. |
| R9 | PostHog telemetry events bloat the per-page-view payload and slow the analytics page itself | Low | Low | Batch events client-side; flush once per route navigation, not on every chart hover. PostHog SDK does this by default. |
| R10 | Beta opt-in flag stays low (<10%) and we never get real signal on P1/P2 features before the season ends | Medium | High | Post a one-time in-app banner on the analytics page after P1 launch: "New features for power users — try the beta." Runs for 30 days then auto-dismisses. |

---

## Implementation phases

### Rollout strategy

- **P0 ships open.** Pure addition with no schema changes; no risk to existing flows. New `/control-panel/analytics` route appears in the sidebar for everyone after deploy.
- **P1 + P2 ship behind a beta flag.** New `Preference.analyticsBetaOptIn: Boolean` (default false). When true, the user sees the audience tab views, sequence-detail entity pages, AI recap, Wrapped, and the live panel. When false, they see only the P0 set. Owner toggles it from `/control-panel/account-settings/notifications` (we'll add a new "Analytics beta" toggle there).
- **Per-environment flag** (`VITE_ANALYTICS_FORCE_BETA`) lets internal users dogfood without flipping the per-show preference, useful for support and demo purposes.
- **No canary or staged rollout** at the cluster level — single DigitalOcean cluster doesn't justify the complexity. Feature flagging is the only gate.
- **Wrapped (V21) public URLs ship at the same time as the rest of P2.** Public URL goes live immediately upon a season ending; no separate gate. Beta opt-in only affects whether the *owner* sees the entry point in their analytics page.

### P0 — Foundation (week 1) — **SHIPPED 2026-05-09**
**Goal:** Analytics tab exists, has a working filter shell, ships the highest-value views that need no backend changes. Ships open to all users.

**Note on backend changes:** P0 ended up adding one small backend query (`dashboardStatsByHour`) to enable the V4 hourly heatmap and V9 active-hour distribution. Strictly speaking this violated the original "zero backend changes" P0 contract but was a pragmatic call — both views are P0-priority "killer" charts and the backend change is tiny (a single new aggregator method, additive only, no schema change). Frontend infrastructure plus all 9 P0 views are live.

- [x] New route `/control-panel/analytics` with SubNav (Overview / Audience / Sequences / Health)
- [x] Add Analytics menu item to sidebar Show group
- [x] PageHead with smart-preset date range + URL-encoded filter state
- [x] **V1** Narrative auto-summary
- [x] **V2** 4-stat hero row with sparklines + compare-to-prior
- [x] **V4** Hourly heatmap (the killer chart)
- [x] **V9** Active-hour distribution
- [x] **V10** Foot-traffic per night-of-week
- [x] **V11** Top requested with rank delta
- [x] **V12** Top voted with win rate
- [x] **V14** Category mix donut
- [x] **V19** Pre-show checklist health
- [x] CommandPalette + RouteBreadcrumb support for new sub-routes
- [x] Backend: `dashboardStatsByHour` query (additive — `DashboardHourlyStatsResponse` + `dashboardStatsByHour()` service method + `DashboardHourlyStats` GraphQL type)
- [x] Smoke + regression (27/27 chromium green)
**Actual scope:** 1 week, +1 small backend query method (additive, no schema change).

### P1 — Sessions, viewer-ID, season views (weeks 2–3) — **PARTIAL: schema/backend shipped 2026-05-09**
**Goal:** the three schema additions land, audience tab fills out with the foot-traffic / dwell / regulars views that lean into the local-audience model. Ships behind `analyticsBetaOptIn`.

- [x] **A1** Persist viewer session history (libs/schema `ViewerSession` model + `Show.viewerSessions[]` field + viewer service `upsertViewerSession` 5-min window upsert)
- [ ] **A2** Nightly rollup document + cron job — **deferred.** A2 is a perf optimization ("without scanning years of raw stats") that doesn't unlock any features the existing on-demand queries can't already serve. All P1 views ship without it. Revisit when production stat-volumes show query latency exceeding the NFR (>800ms on Season-to-date). Wrapped (V21, P2) will benefit most — pick this up before P2 if Wrapped's compute time is uncomfortable.
- [x] **A3** Anonymous viewer ID — schema fields on `ActiveViewer`, `Stat.Page`, `Stat.Jukebox`, `Stat.Voting`. Viewer-quarkus (`apps/viewer/`) mutations accept optional `viewerId` arg. Standalone `remote-falcon-viewer-page-js/viewerId.js` lazy-creates UUID in localStorage, exposes `window.rfViewerId()`. Verified end-to-end with curl + mongosh.
- [x] Backend: `viewerSessions(startDate, endDate, timezone)` GraphQL query + `ViewerSessionsResponse` shape. IPs returned as a per-show salted SHA-256 hash so raw addresses never leave the backend.
- [x] Frontend: `useViewerSessions` hook + identityKey rule (viewerId-first, ipHash fallback)
- [x] **V5** Concurrent viewers timeline (per-night dropdown + 5-min bucketed area chart with peak callout)
- [x] **V6** Dwell-time distribution (5 bucket ranges + median + share %)
- [x] **V7** New tonight vs returning tonight (stacked bars per night + period totals + returning %)
- [x] **V8** Season regulars (top 20 visitors by distinct nights, anonymized "Viewer #N", honesty footnote)
- [x] **V3** Calendar heatmap (Overview tab — week-column GitHub-contributions style with month labels + intensity ramp)
- [x] **V13** Sequence-detail entity page (shipped early — uses existing data, no schema dependency)
- [x] **Beta opt-in flag** — `Preference.analyticsBetaOptIn` boolean shipped through libs/schema, control-panel GraphQL types/inputs, and a new "Analytics beta" card in Account Settings → Notifications. Gate logic in `AudienceTab.jsx`: V9/V10 always show, V5/V6/V7/V8 hide behind a friendly opt-in card with a deep link to the toggle.
- [x] **V15** Request → queue conversion — **shipped 2026-05-10**. Schema: new `Stat.RejectedRequest` model + `Stat.rejectedRequests[]` field. Viewer service logs a rejection event before each refusal branch (QUEUE_FULL, ALREADY_REQUESTED, INVALID_LOCATION, NAUGHTY, SEQUENCE_REQUESTED) — best-effort, never blocks the rejection path. Backend: `requestConversion(startDate, endDate, timezone)` GraphQL query returns attempted/accepted/rejected counts + breakdown by reason. Frontend: `RequestConversion.jsx` on the Sequences tab — two-step funnel (attempted → made it to queue) + rejection-reason breakdown with hover hints explaining what each reason implies operationally.
- [x] Viewer-page footer: passive privacy notice — **shipped 2026-05-10**. Tiny "Privacy" pill in the bottom-right of every viewer page that uses `viewerId.js`. Click expands a 280px tooltip with the full anonymous-device-ID disclosure. No cookie banner — first-party, first-purpose analytics doesn't trigger GDPR consent flows. Standalone repo: `remote-falcon-viewer-page-js/viewerId.js`.
**Estimate: 2 weeks.** Bulk of the long-tail charts.

### P2 — Differentiators (weeks 4–5)
**Goal:** the "kill shot" — ship the things competitors don't have. Ships behind `analyticsBetaOptIn` (for the owner-facing entry points; Wrapped public URL is publicly accessible regardless once the season ends).

- [x] **V21** End-of-Season Wrapped — **shipped 2026-05-09**. Public route `/wrapped/:showSubdomain/:season-:year` outside AuthGuard. Backend: unauthed `wrappedSummary` GraphQL query + `WrappedSummaryResponse` shape (computes 10 stats from existing data — active nights, unique viewers, median dwell, regulars, top requested w/ play time, peak night, peak hour, peak day-of-week). Frontend: scroll-snap card stack with theme per season (Christmas blue+amber, Halloween dark-purple+orange), generous typography for sharing, `navigator.share` API + clipboard fallback, "Powered by Remote Falcon" footer. Three states: pre-season ("Wrapped opens after Jan 8, 2027"), post-season-no-data, full card stack. PNG export per card deferred — Web Share + clipboard URL covers the 95% case.
- [ ] **V20** AI nightly recap (Claude Haiku, ~$0.001/show/night)
- [x] **V16** PSA effectiveness panel — **shipped 2026-05-10**. Backend: `psaEffectiveness(timezone)` query returns one record per configured PSA — last-played time, unique viewers in a ±5min window, and request count before vs after the play. Frontend: `PsaEffectiveness.jsx` on the Sequences tab — table-style rows with relative-time + viewer count + request delta arrow (green up = engagement held, red down = viewers dropped off). Limitation surfaced in code comments: only the most recent play per PSA is analyzed (the schema overwrites `lastPlayed` rather than logging history). Empty state for shows with no PSAs configured.
- [x] **V17** FPP heartbeat timeline — **shipped 2026-05-10**. Lives on the **Dashboard** Show-health row (operational health = Dashboard, per the corrected placement framing). Schema: new `Show.heartbeatGaps[]` (List<HeartbeatGap>) maintained by plugins-api on every heartbeat write — gap detection (>5 min lapse → record window) + prune-older-than-30-days in the same atomic update. Backend exposes `lastHeartbeatMs` + `heartbeatGaps[{startedAtMs,endedAtMs}]` on `dashboardLiveStats`. Frontend: `dashboard/HealthRow.jsx` with a 7-day green strip + red gap segments (hover for duration), plus connected/offline status + last-heartbeat-ago text.
- [x] **V18** Plugin / FPP version chips — **shipped 2026-05-10** (lite version). Version chips on the Health row alongside the heartbeat strip. Full upgrade-history-over-time chart deferred (would need version-change logging, not just current-value overwrite); `pluginVersion` / `fppVersion` already on Show.
- [x] **V22** Live "right now" data — **shipped 2026-05-09**. Two new fields on `DashboardLiveStats` (`currentViewers` = deduped active viewers in last 5 min; `medianDwellSecondsTonight` = median of sessions started today in user TZ). Surfaced on the **Dashboard** (not Analytics) — V22 is operational/at-a-glance and belongs alongside the existing live tiles + NowPlayingCard, per the playbook's own Dashboard-vs-Analytics framing. The existing "Viewers right now" tile in `dashboard/LiveStatsRow.jsx` now uses the deduped count and shows median dwell tonight in its sub-line. The earlier floating Analytics-tab panel was a placement mistake — corrected before the spec went stale.
- [ ] **V16** PSA effectiveness panel
- [ ] **V17** FPP heartbeat timeline
- [x] **V18** Plugin / FPP version distribution — **shipped 2026-05-10** (full). Schema: new `Show.versionChanges[]` (`VersionChange` model) maintained by plugins-api. The `pluginVersion()` writer detects when the reported version differs from what's stored, atomically pushes a VersionChange + prunes anything older than 365 days. Backend: `dashboardLiveStats` now includes `versionChanges[]` (most-recent-first). Frontend: HealthRow chips gain a clickable history badge (count) → Popover timeline of every plugin/FPP version transition + a "Last upgraded N days ago" line under the chips. The full per-show version-distribution-over-time bar chart is deferred — current needs are well-served by the per-show timeline + chips.
- [ ] Scheduled email digest — **deferred pending provider decision (2026-05-10)**. Needs a transactional-email provider before build: SES (cheapest, requires AWS account + domain verification), SendGrid (zero-infra, free 100/day, fine for current scale), or Mailgun (similar to SendGrid). With V20 AI recap also deferred, the digest's content is just "tonight's stats" — useful but lighter than the original AI-paragraph vision. Recommend revisiting bundled with V20: pick provider when AI recap is back on the table so the email becomes the AI recap delivery channel.
- [ ] ~~Share-as-image export on every chart~~ — **withdrawn 2026-05-10**. Built and removed at the user's request: the URL is already shareable via the address bar, and a per-card share button cluttered the chart headers without buying enough. Reconsider only if a user explicitly asks for it.

**Estimate: 2 weeks.** Each item independently shippable; pick by what you want to ship for the marketing moment.

### Out of scope / explicit non-goals

- **No system-admin aggregate view.** Deferred to its own playbook. Schema choices in this document are made admin-aggregate-friendly (see the "Forward-looking constraint" section near the top) but the admin UI / queries / auth gating are not designed here.
- **No identity tracking.** No accounts, no cookies, no fingerprinting. IP is the only available identity and we frame it honestly.
- **No demographic data.** We don't have it and we won't infer it.
- **No A/B test infrastructure.** Wrong tool for a hobbyist platform.
- **No viewer-side analytics surface.** This is owner-facing only. Viewers see the show, not metrics.
- **No real-time streaming charts.** 5–30 second polling is fine; SSE/WebSockets are overkill.
- **No retention cohort grids.** IP is too unstable for honest cohort analysis across weeks.

---

## Decisions log

Decisions made during PRD review and now baked into the spec above. Listed for traceability so the implementer doesn't re-litigate them.

| Decision | Resolution | Rationale |
|---|---|---|
| Geofence reality | Sub-2mi residential — local-audience framing confirmed, no geo-distribution charts | Confirmed by product owner |
| Season model | Built-in Halloween + Christmas presets, customSeasons array, yearRoundMode toggle, per-season Wrapped firing | Supports the dominant Christmas use case while accommodating Halloween and year-round shows |
| IP-stability for "regulars" | Add A3 anonymous viewer-ID via browser localStorage, IP fallback for legacy | localStorage UUID is the right answer — clean, first-party, GDPR-friendly |
| Mobile use case | Mobile-responsive but desktop-primary, no separate mobile design pass | Owner planning happens at the desk; in-yard ops is the existing live Dashboard's job |
| Scale ceiling | Few hundred concurrent viewers per show, polling-based architecture | Confirmed realistic for sub-2mi residential |
| Polling cadence | 5s for live tiles, 30s for analytics page Tonight preset | Matches the existing dashboard's pattern; no SSE/WebSockets |
| Data retention | A2 nightly rollups never expire; raw stats keep existing 18-month lifecycle | Wrapped year-over-year requires long-horizon rollups |
| Privacy posture | Passive footer line on viewer page, no cookie banner | First-party first-purpose analytics doesn't require GDPR consent flow |
| Success metrics | Engagement ≥40%, Wrapped reach ≥25%, session ≥90s, ticket parity, beta opt-in ≥30%, AI recap viewing ≥20% | See Success Metrics section above |
| Rollout | P0 ships open, P1+ behind `analyticsBetaOptIn` boolean, internal env-flag override for dogfooding | Beta opt-in protects beta features without staged-rollout infrastructure |
| Session-window length | 5 minutes of inactivity = end of session | Tight enough to separate distinct visits, loose enough to capture the "park, watch a few songs, leave" arc |
| AI recap provider | Claude Haiku via Anthropic API for v1 | Pennies per show per season; revisit if cost or volume grows |
| Wrapped public URL | Public by default, no auth gate, auto-published day after season ends | Sharing is the whole point; viewer page itself is already public |
| Default analytics tab | Overview always; "Tonight" smart-default deferred to v1.1 | Avoid surprising users with context-dependent landing |
| Live panel placement | **Dashboard** — augments the existing live tile row with deduped viewer count + median dwell tonight. Original "Analytics floating panel" was a placement mistake (caught by product owner 2026-05-09); operational at-a-glance belongs on the Dashboard, not Analytics. | Dashboard-vs-Analytics framing in this playbook (operational vs reflective). |
| "Regulars" privacy | Anonymized as "Viewer #1," never expose IP/UUID, no opt-in to see real IDs | Privacy first; admin opt-in is a future consideration if requests accumulate |

## Open questions

None blocking. Items below are best-resolved in implementation when context is sharper, and are flagged in code with `// TODO(analytics-prd)`:

1. **PostHog project name** — confirm which PostHog project the analytics-page telemetry should write to. Per saved memory, *don't infer from the PostHog MCP active project* — ask before assuming.
2. **AI recap copy review** — the literal prompt template should get one product-voice review pass before P2 ships, to nail the tone (helpful, not breathless).
3. **Wrapped card art direction** — the visual language for the share cards (typography, color, motion) is design work that should happen alongside P2 implementation, not blocked on it.

---

## Files referenced (for implementation)

Frontend:
- [src/views/pages/controlPanel/dashboard/](src/views/pages/controlPanel/dashboard/) — existing dashboard, do not change
- [src/views/pages/controlPanel/dashboard/ApexLineChart.jsx](src/views/pages/controlPanel/dashboard/ApexLineChart.jsx), [ApexBarChart.jsx](src/views/pages/controlPanel/dashboard/ApexBarChart.jsx) — reuse
- [src/utils/graphql/controlPanel/queries.jsx](src/utils/graphql/controlPanel/queries.jsx#L249-L301) — `DASHBOARD_STATS` already returns most of what we need
- [src/menu-items/controlPanel.jsx](src/menu-items/controlPanel.jsx) — add Analytics item
- [src/routes/MainRoutes.jsx](src/routes/MainRoutes.jsx) — add nested analytics routes
- [src/ui-component/SubNav.jsx](src/ui-component/SubNav.jsx) — reuse for Analytics tabs
- [src/ui-component/PageHead.jsx](src/ui-component/PageHead.jsx) — reuse, with date-range in `actions`

Backend (control-panel):
- [apps/control-panel/src/main/java/com/remotefalcon/controlpanel/service/DashboardService.java](../control-panel/src/main/java/com/remotefalcon/controlpanel/service/DashboardService.java) — extend with rollup + session-derived methods

Backend (viewer):
- [apps/viewer/src/main/java/com/remotefalcon/service/GraphQLMutationService.java](../viewer/src/main/java/com/remotefalcon/service/GraphQLMutationService.java#L38-L67) — extend page/active-viewer write paths to maintain `viewerSessions[]`

Schema:
- [libs/schema/src/main/java/com/remotefalcon/library/documents/Show.java](../../libs/schema/src/main/java/com/remotefalcon/library/documents/Show.java) — A1 (`viewerSessions[]`) and A2 (new `ShowNightlyRollup` document)

---

*PRD authored 2026-05-09. Updated post-review same day (Decisions log captures the full set of resolutions). Update this document as the implementation lands.*
