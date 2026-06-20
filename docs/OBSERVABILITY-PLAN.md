# Remote Falcon — Observability Plan

**Created:** 2026-04-27
**Owner:** Matt Shorts
**Status:** Draft — awaiting kickoff
**Related docs:** [SERVICES.md](SERVICES.md), [TESTING.md](TESTING.md)

This is the operator's plan for full-stack observability across the Remote Falcon platform. The monorepo cutover is complete; this rollout is the next observability work after the test pyramid landed.

---

## TL;DR

| | |
|---|---|
| **Wire protocol** | OpenTelemetry (OTLP) across every backend service |
| **Backend telemetry sink** | Grafana Cloud (free tier sufficient at current scale) |
| **Frontend / product / errors / replay** | PostHog (already wired) |
| **Synthetic uptime** | Grafana Cloud Synthetic Monitoring (k6-based) |
| **Alerting** | Grafana Cloud Alerts → Slack + email |
| **Dropped** | Mixpanel, Google Analytics, Microsoft Clarity, Datadog plan, self-hosted kube-prometheus-stack |
| **Expected cost** | $0/mo most of the year; $20–80/mo at seasonal peak |

This combination covers all eight observability pillars (below), removes three frontend SDKs and one self-hosted stack, and standardizes on a vendor-portable wire format.

---

## Pillars and failure modes

A "full stack" approach covers all eight. Most platforms cover three or four and pay for it later.

| Pillar | What it answers | Failure mode if skipped |
|---|---|---|
| **Infra metrics** | Are pods/nodes healthy? CPU/mem/disk pressure? | Outage from a full disk you didn't see coming |
| **App metrics** | Request rate, latency P95/P99, error rate per endpoint | "Something is slow" support tickets with no data |
| **Logs** | What did the service say at 03:42 UTC? | Debugging by guessing |
| **Traces** | Which downstream call ate the 4-second viewer request? | Performance regressions go untriaged |
| **Backend errors** | Aggregated exceptions with stack traces and counts | Same bug, 10k users, 0 of them tell you |
| **Frontend RUM** | Real-user web vitals, JS errors, session replay | "It's broken in Safari" with no repro |
| **Synthetic uptime** | External probes hitting your URLs every minute | Cluster looks fine; DNS / certs / ingress are dead |
| **Alerting** | Notify when something crosses a threshold | You discover outages on Twitter |

---

## Recommended stack

### Decision matrix

| Pillar | Tool | Why this one |
|---|---|---|
| Infra metrics | **Grafana Cloud** (Mimir) via Grafana Agent | Free tier covers your scale; zero ops vs. self-hosting kube-prometheus-stack; same console as logs/traces |
| App metrics | **OpenTelemetry SDK → Grafana Cloud** | Already partially wired (`OTEL_URI` build-args exist on jobs/mongo-backup); vendor-portable wire protocol |
| Logs | **Grafana Cloud Loki** via Grafana Agent | Tail logs from k8s pods automatically; correlated with metrics/traces by trace ID |
| Traces | **OpenTelemetry → Grafana Cloud Tempo** | Gateway already bundles the OTel Java agent; the rest is config |
| Backend errors | **PostHog Error Tracking** | You're already paying; works fine for current volume |
| Frontend RUM + product analytics + session replay | **PostHog** | Already wired in the UI |
| Synthetic uptime | **Grafana Cloud Synthetic Monitoring** (k6-based) | Same console; reuses k6 expertise from `remote-falcon-load-tests` |
| Alerting | **Grafana Cloud Alerts → Slack + email** | One place defines all alert rules; routes consistently |

### What gets dropped

| Today | Drop because |
|---|---|
| **Mixpanel** (`MIXPANEL_KEY` baked into UI bundle) | PostHog covers product analytics with the same primitives |
| **Google Analytics** (`GA_TRACKING_ID`) | PostHog has web analytics; GA's value-add is mostly legacy + AdWords integration. Keep only if AdWords/Search Console attribution is actually used |
| **Microsoft Clarity** (`CLARITY_PROJECT_ID`) | PostHog session replay covers the same need |
| **Datadog plan + manifest annotations** | Not running on the cluster anyway; reinstating duplicates what Grafana Cloud + PostHog already cover |
| **Self-hosted kube-prometheus-stack** | Replaced by Grafana Cloud Agent — moves operational burden off the operator |

Net effect on the UI bundle: **3 fewer SDKs, 4 fewer baked-in keys**. Net effect on the cluster: **one component (kube-prometheus-stack) retired**.

---

## Why this combination

### Why OpenTelemetry as the protocol

The only observability decision worth treating as a one-way door. Once services emit OTLP, the backend is swappable without re-instrumenting. If Grafana Cloud's pricing changes in two years, point `OTEL_EXPORTER_OTLP_ENDPOINT` at Honeycomb, Datadog, or self-hosted Tempo and you're done.

**Pick a backend; don't pick a wire protocol that locks you in.**

### Why Grafana Cloud over self-hosting

Self-hosting `kube-prometheus-stack` is the current state. The annual ops cost for a solo operator (upgrades, Loki sizing, Tempo retention tuning, alertmanager config drift) is real. Grafana Cloud's free tier is genuinely sufficient for current scale. Paid tiers start at $19/user/mo if outgrown.

**Goal: stop running monitoring infrastructure and start using it.**

### Why PostHog gets the frontend + errors job

Already paying for it (`PUBLIC_POSTHOG_KEY` is in the UI bundle today). PostHog has matured into a credible all-in-one for the things frontends need: product analytics, web vitals, session replay, feature flags, error tracking, surveys. Adding Sentry for "real" error tracking would be defensible — Sentry is more polished — but the marginal value over PostHog Error Tracking at current volume is small, and it adds a fifth vendor.

### Why not all-PostHog

PostHog now ingests logs and metrics via OTLP, so technically the entire pipeline could route there. Two reasons not to:

1. **PostHog's strength is product/frontend.** The backend metrics/traces UX in PostHog is meaningfully behind Grafana's mature console.
2. **Splitting backend telemetry from product analytics** keeps each tool focused on what it does best, and provides a fallback if either vendor changes terms.

---

## Honest tradeoffs

- **Grafana Cloud free-tier retention is 14 days.** If "what happened 3 weeks ago" investigations are frequent, this constraint will bite. At current scale and operator profile, 14 days is realistic.
- **Two vendors, not one.** A single-vendor Datadog or Honeycomb setup is operationally simpler but materially more expensive at this scale.
- **PostHog Error Tracking is newer than Sentry.** Polish gap is real but small at current error volume. Revisit if error triage becomes a daily activity.
- **OTel agent overhead.** Java agent adds ~50–100ms to startup and ~5–10% memory overhead. Negligible for `apps/api` and `apps/gateway`; worth measuring on the GraalVM-native services where reflection is more sensitive.
- **Grafana Cloud Synthetic Monitoring is opinionated about k6.** If a different synthetic flavor is preferred (e.g. Playwright-based), BetterStack or Checkly are alternatives at similar price points.

---

## Per-service wiring (post-monorepo, 5 services)

| Target | Telemetry source | How |
|---|---|---|
| `apps/ui` | PostHog browser SDK (already there) + optional `@grafana/faro-web-sdk` for browser→backend trace correlation | Drop Mixpanel/Clarity/GA SDKs in the same PR |
| `apps/gateway` | Spring Boot Actuator + OTel Java agent (already bundled at image build) | Set `OTEL_EXPORTER_OTLP_ENDPOINT`; add `/actuator/prometheus` ServiceMonitor |
| `apps/api` (control-panel + external-api merged) | Spring Boot Actuator + OTel Java agent | Same as gateway; drop the (inert) Datadog annotations |
| `apps/realtime` (viewer + plugins-api merged) | Quarkus Micrometer + `quarkus-opentelemetry` (already on viewer) | Already partially wired; point at Grafana Cloud |
| `apps/jobs` (mongo-backup + account-archive merged) | Quarkus Micrometer + `quarkus-opentelemetry` | Already has `OTEL_URI` build-arg — finish the wiring |
| **Infra / k8s / Mongo** | Grafana Agent (helm chart, one install) | Replaces kube-prometheus-stack with a hosted-backed agent; auto-discovers pods, exports cAdvisor + node-exporter + Mongo metrics |

**Existing assets:** the OTel Java agent is already bundled in the gateway image ("Bundles the OpenTelemetry Java agent at image build" per [SERVICES.md](SERVICES.md)), and `OTEL_URI` build-args exist on jobs / mongo-backup. The previous maintainer was already heading this direction; this plan finishes the work.

### Shared module

A `libs/observability/` module in the monorepo holds:
- Common OTel resource attributes (service.name, service.version, deployment.environment)
- A standard logback / quarkus log appender configured for structured JSON
- A small `MeterRegistry` config helper enforcing label hygiene (no high-cardinality labels)
- The PostHog browser-SDK wrapper for `apps/ui`

This is monorepo-only — would be impractical as a JitPack-pinned external library.

---

## Release validation loop

This is where testing and observability close the loop. The flow:

1. **Pre-deploy:** unit + integration + contract + e2e gates (see [TESTING.md](TESTING.md)) run on the PR.
2. **Deploy:** post-deploy smoke probes the health endpoints; `kubectl rollout undo` on failure.
3. **Post-deploy (first 15 min, automated):**
   - Grafana Cloud alert on "error rate post-deploy > baseline + 2σ" — pages on a silently-bad build
   - PostHog alert on "frontend JS error rate post-deploy > baseline" — same idea for the UI
4. **Post-deploy (24h, scheduled):** dashboard snapshot compares P95 / error rate / cold-start time against the prior week. Catches slow regressions that point-in-time tests don't see.

This turns observability from "alarms after a customer notices" into part of the release pipeline.

---

## Alert policy (initial set)

Start with a small, high-signal set. Add specifics as patterns emerge.

| Alert | Threshold | Severity | Route |
|---|---|---|---|
| Service down | Health probe failing > 2 min | Page | Slack + email |
| Error rate spike | 5xx rate > 1% over 5 min | Page | Slack + email |
| Latency regression | P95 > 2× baseline over 10 min | Warn | Slack |
| Mongo connection pool saturation | Active connections > 80% pool | Warn | Slack |
| Pod crashloop | Restart count > 3 in 10 min | Page | Slack + email |
| Disk pressure | Node disk > 80% | Warn | Slack |
| **Backup not run** | `mongo-backup` last-success > 36 hours | **Page** | Slack + email |
| **Backup S3 PutObject failed** | Any failure in last 24h | **Page** | Slack + email |
| Synthetic check failure | 2 consecutive failures | Page | Slack + email |
| Cert expiry | < 14 days remaining | Warn | Email |

Backup alerts are emphasized because silent backup failure is the only data-loss bug class identified in [TESTING.md](TESTING.md).

Alert tuning rule: **if a Slack alert fires and is ignored twice in a row, either fix the underlying cause or delete the alert.** Noisy alerts that get silenced erode the value of every other alert.

---

## Cost expectations

| Component | Free tier covers | Paid threshold |
|---|---|---|
| PostHog | 1M events/mo, 5k session recordings, 1M feature flag requests | ~$0.00031/event after |
| Grafana Cloud | 10k active metrics series, 50GB logs/mo, 50GB traces/mo, 3 users, 14-day retention | $19/user/mo + usage-based |
| Synthetic Monitoring (Grafana Cloud) | 100k checks/mo | Included with paid tier |

For Remote Falcon's likely volume (Christmas-light show owners — bursty during the season, quiet the rest of the year), realistic expectation: **$0/mo for 9 months, possibly $20–80/mo during peak season** if event or log volumes spike. Cheaper than the smallest Datadog plan.

---

## Phasing

Implementation runs as a single ~2-week stretch, ideally sequenced before the 8→5 service-merge work — so the merges happen with full visibility into what changed. Post-deploy smoke + auto-rollback already shipped (`deploy.yml`).

### Phase Obs-1 — Backend pipeline *(3–4 days)*

- [ ] **Obs-1.1** Sign up for Grafana Cloud; capture OTLP endpoint, API key, instance IDs into the repo's secret store
- [ ] **Obs-1.2** Add a `libs/observability/` module to the monorepo with shared OTel config (resource attributes, log appender, MeterRegistry helper)
- [ ] **Obs-1.3** Wire OTel exporter env into each service deployment (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` for auth)
- [ ] **Obs-1.4** Install Grafana Agent helm chart in the cluster; verify auto-discovery picks up all 8 service pods (or 5, if done after merges)
- [ ] **Obs-1.5** Confirm metrics, logs, and traces all arrive in Grafana Cloud for at least one service end-to-end
- [ ] **Obs-1.6** Roll out OTel exporter to remaining services
- [ ] **Obs-1.7** Uninstall kube-prometheus-stack from the cluster
- [ ] **Obs-1.8** Update [SERVICES.md](SERVICES.md) to remove kube-prometheus-stack, ServiceMonitors, and Datadog references

### Phase Obs-2 — Frontend consolidation *(2 days)*

- [ ] **Obs-2.1** Confirm PostHog is capturing the events you actually need (product events, web vitals, JS errors, session replay)
- [ ] **Obs-2.2** Remove Mixpanel SDK + `MIXPANEL_KEY` from `apps/ui` and the GitHub Actions secrets
- [ ] **Obs-2.3** Remove Google Analytics + `GA_TRACKING_ID` (or keep if AdWords attribution is actually used — decide deliberately)
- [ ] **Obs-2.4** Remove Microsoft Clarity + `CLARITY_PROJECT_ID`
- [ ] **Obs-2.5** Optional: add `@grafana/faro-web-sdk` for browser→backend trace correlation
- [ ] **Obs-2.6** Verify PostHog Error Tracking is receiving JS errors with source-mapped stack traces (upload source maps in CI)

### Phase Obs-3 — Synthetics + alerts *(2 days)*

- [ ] **Obs-3.1** Configure Grafana Cloud Synthetic checks: home page, login page, viewer page on a known-good show, plugins-api `/showInfo`, external-api `/showDetails` (with test JWT). 1-min interval from 2 regions
- [ ] **Obs-3.2** Define the initial alert set (table above) as Grafana alert rules
- [ ] **Obs-3.3** Wire Slack + email contact points
- [ ] **Obs-3.4** Test each alert by deliberately tripping the condition on a test environment
- [ ] **Obs-3.5** Document the runbook for each alert (one short paragraph per: "what does this mean, what do I do")

### Phase Obs-4 — Dashboards *(2–3 days)*

- [ ] **Obs-4.1** Build a single platform-overview dashboard in Grafana: per-service request rate, error rate, P95 latency, pod restarts, Mongo connection pool
- [ ] **Obs-4.2** Per-service dashboards for the 5 consolidated services with service-specific panels (e.g. backup last-success time on `apps/jobs`)
- [ ] **Obs-4.3** A "release validation" dashboard parameterized by deploy time — shows the post-deploy 30-min window vs. the prior week's baseline
- [ ] **Obs-4.4** PostHog: build a frontend-health dashboard (web vitals, error rate, session replay sample)

### Phase Obs-5 — Release loop integration *(1 day)*

- [ ] **Obs-5.1** Add post-deploy alert evaluation to the deploy workflow: 15-min watch window, fail (and rollback) if error rate > baseline + 2σ
- [ ] **Obs-5.2** Schedule a daily "release-validation" agent (via `/schedule`) to compare today's metrics against the prior week and post a summary
- [ ] **Obs-5.3** Document the release-validation flow in [SERVICES.md](SERVICES.md)

---

## Decision points (go/no-go gates)

1. **End of Obs-1.5:** does at least one service show metrics, logs, and traces end-to-end in Grafana Cloud? If not, debug before rolling out broadly.
2. **End of Obs-1.7:** is anything still depending on kube-prometheus-stack? Confirm before uninstalling.
3. **End of Obs-2:** does the UI bundle still work after dropping Mixpanel/GA/Clarity? Test in production-like environment before merging.
4. **End of Obs-3.4:** did each alert actually fire when its condition was met? Untested alerts are no alerts.
5. **End of Obs-5.1:** does a deliberately-broken commit on a test branch trigger the post-deploy auto-rollback? Test the safety net before relying on it.

---

## Open questions

- **Source-map upload to PostHog** — needs to be wired into the UI build workflow. Out-of-the-box step exists; placeholder until implemented.
- **Region selection for Grafana Cloud** — pick the region closest to DigitalOcean cluster (`NYC` or `AMS` likely). Affects latency on metric writes; once chosen, hard to change.
- **PII handling in logs** — confirm structured logging strips email addresses, JWTs, and Mongo URIs before they leave the pod. Add a logback filter / Quarkus log filter as part of `libs/observability/`.
- **Long-term retention** — if 14-day Grafana retention isn't enough, consider exporting daily snapshots to S3 (cheap) or upgrading to a paid tier (clean).

---

## Same-origin PostHog ingest (#130)

**Decision (2026-06-20): Option A — same-origin proxy via a Cloudflare Worker.**

### Background
The original same-origin proxy was an nginx-ingress `configuration-snippet`
annotation. That annotation is a cluster-wide security risk; the cluster admin
disabled `allow-snippet-annotations` and it was removed. Since then `posthog-js`
posts directly to `us.i.posthog.com`, so **~25-30% of events are dropped** by
ad-blockers / DNS filters that block `*.posthog.com` (uBlock, Pi-hole, etc.) —
`apps/ui/src/index.jsx` documents this loss. We're already fronted by
Cloudflare, so the clean recovery is a **Cloudflare Worker** reverse proxy
(works on any CF plan; the DNS+Page-Rules method needs Enterprise).

### Cloudflare side (outside this repo — apply in the Cloudflare dashboard)
Deploy a Worker (start from PostHog's official
[Cloudflare Worker](https://posthog.com/docs/advanced/proxy/cloudflare#option-1-cloudflare-workers))
on a route `remotefalcon.com/<path>/*`, routing:

| Incoming | Upstream | Why |
|---|---|---|
| `/<path>/static/*` | `https://us-assets.i.posthog.com/static/*` | SDK assets (`array.js`, the replay recorder) live on the **assets** host |
| `/<path>/*` (everything else) | `https://us-proxy-direct.i.posthog.com/*` | events, `/flags`, `/decide`, `/s` (replay). The `-proxy-direct` host makes PostHog use the **forwarded client IP** for geo — plain `us.i.posthog.com` records Cloudflare's edge IP and breaks PostHog geo/web-analytics, which matters since RF leans on location data |

- The Worker must set CORS headers (`Access-Control-Allow-Origin` for the
  request origin) — missing CORS is the #1 setup failure.
- **Pick a non-obvious `<path>`.** Do NOT reuse `/ingest` (PostHog's default —
  increasingly on blocklists) or `/analytics`/`/tracking`/`/posthog`. Use
  something app-specific and unguessable, or the exercise only partially
  recovers events.

### Repo side (one-line UI change — gated on the Worker being live)
In `apps/ui/src/index.jsx` `posthogOptions`:
```js
api_host: 'https://remotefalcon.com/<path>',   // was https://us.i.posthog.com
ui_host:  'https://us.posthog.com',            // unchanged — needed for replay/session URLs
```
`api_host` is **baked into the bundle at build time**, so this needs a UI
rebuild + deploy to take effect.

### ⚠️ Sequencing — do not get this wrong
1. Deploy the Worker and **verify** it proxies: `curl https://remotefalcon.com/<path>/static/array.js` → 200 JS; POST a test event → 200; confirm PostHog ingests it.
2. **Only then** merge the `api_host` UI change and rebuild.

If the UI ships pointing at `/<path>` before the Worker exists, every event
POSTs to a 404 → **100% loss** (worse than today's 25-30%). Rollback is the
inverse: revert `api_host` to `https://us.i.posthog.com` + rebuild.

### Verify after cutover
- DevTools Network: PostHog requests go to `remotefalcon.com/<path>/…` and return 200 (not blocked).
- Feature flags resolve and session replay records (`/flags`,`/decide`,`/s` route correctly).
- PostHog web-analytics country/region breakdown stays accurate (confirms the `us-proxy-direct` client-IP passthrough).
- Event volume steps up ~25-30% vs the pre-cutover baseline (the recovered ad-blocked traffic).

### Cost note
Every proxied event, replay chunk, and flag poll counts toward Cloudflare
Workers' request quota (free tier 100k req/day). Session replay (1–5 MB/session)
is the big driver — watch usage on high-traffic show nights.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-27 | Initial plan drafted | Matt + Claude session |
| 2026-06-20 | #130 decided: same-origin PostHog ingest via a Cloudflare Worker (Option A). Runbook + sequencing above; UI `api_host` change is gated on the Worker going live. | Matt + Claude session |
