# Remote Falcon — Services & Deployment Reference

**Last updated:** 2026-04-27
**Maintainer:** Matt Shorts (taking over from prior maintainer)

This is the operator's map of the Remote Falcon stack: every service, what it does, where it runs, and the secrets / cluster prerequisites it needs.

> **Consolidation status:** The monorepo cutover is complete — every service in this catalog builds and deploys from this repo via [`/.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). The next strategic surface is the 8→5 service merge (`apps/jobs`, `apps/realtime`, `apps/api`).

---

## TL;DR

- **8 production services** deploy to one DigitalOcean Kubernetes cluster.
- All deploy via per-repo **GitHub Actions** (`Build and Release`) on push to `main` (or manual `workflow_dispatch`).
- All live in the `remote-falcon` namespace, behind a single nginx ingress on `remotefalcon.com`.
- **`remote-falcon-library`** is a build-time dep of 5 of the 8 services (canonical Mongo schema, pulled via JitPack at a pinned git SHA).
- **`remote-falcon-data`** holds two manually-applied k8s manifests (Datadog Operator CRD + viewer Secret template).
- **`remote-falcon-viewer-quarkus`** is a dormant experimental rewrite on a separate cluster — `workflow_dispatch` only.
- A handful of **customer-facing repos** ship code that runs *outside* the cluster (FPP plugin, viewer-page CDN scripts, page templates, maintenance HTML, deployment wizard, mobile app). None deploy to k8s; most have no CI.

---

## Cluster topology

| | |
|---|---|
| **Production cluster ID** | `4f1406fe-1179-4a9c-9d2e-835c3da34984` (DigitalOcean) |
| **Experimental cluster ID** | `9badee22-1583-464e-8117-a7090179f151` (DigitalOcean — viewer-quarkus only) |
| **Namespace** | `remote-falcon` |
| **Ingress** | nginx (`kubernetes.io/ingress.class: nginx`) |
| **Public hosts** | `remotefalcon.com`, `*.remotefalcon.com` (UI subdomain catch-all) |
| **Image registry** | GHCR — `ghcr.io/remote-falcon/<service>:<git-sha>` |
| **Image pull secret** | `remote-falcon-ghcr` (in `remote-falcon` namespace) |
| **Metrics** | Prometheus via `kube-prometheus-stack-1768012917` (ServiceMonitors on viewer + plugins-api) |
| **APM / logs** | **Not currently active.** `viewer` and `plugins-api` manifests carry `ad.datadoghq.com/...` autodiscovery annotations, but the Datadog Operator is **not installed** on the cluster (no `DatadogAgent` CRD; no agent pods). The annotations are inert. See [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md) for the planned replacement. |

---

## Service catalog

### 1. remote-falcon-ui
| | |
|---|---|
| **Purpose** | Frontend SPA — control panel UI plus public viewer pages on per-show subdomains |
| **Stack** | Vite + React, served by Node 22 in the production image |
| **Container port** | 3000 |
| **Replicas** | 1 |
| **Resources** | req 64Mi / 5m → lim 128Mi / 100m |
| **Ingress** | Host `remotefalcon.com` (path `/`) **and** subdomain catch-all `*.remotefalcon.com` (path `/`) |
| **Health probe** | `GET /health.json` |
| **Talks to** | Control Panel API, Viewer API (URLs baked in at build time) |
| **GH Actions secrets** | `VIEWER_JWT_KEY`, `GOOGLE_MAPS_KEY`, `PUBLIC_POSTHOG_KEY`, `GA_TRACKING_ID`, `MIXPANEL_KEY`, `CLARITY_PROJECT_ID`, `DIGITALOCEAN_ACCESS_TOKEN` |
| **In-cluster secrets** | none (all config is build-time `VITE_*` env) |
| **Note** | All third-party keys are **baked into the bundle at image build time** — rotate by re-running the workflow, not by restarting pods. |
| **⚠ Dead config (verified 2026-04-27)** | `MIXPANEL_KEY`, `GA_TRACKING_ID`, and `CLARITY_PROJECT_ID` are still plumbed through Dockerfile build-args, GH Actions secrets, and `VITE_*` env vars, **but nothing reads them in source**. Only `posthog-js` (`VITE_PUBLIC_POSTHOG_KEY`) is actually wired in `apps/ui/src/`. Removing the dead chain is a no-op simplification, captured in [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md) Obs-2. `VIEWER_JWT_KEY` is similarly absent from source — verify intent before relying on it. |

### 2. remote-falcon-gateway
| | |
|---|---|
| **Purpose** | Spring Cloud Gateway in front of the backend services — routes / filters / rate limits |
| **Stack** | Spring Cloud Gateway, Java 17 (JVM JAR — the only non-native service) |
| **Container port** | 8080 |
| **Replicas** | 2 |
| **Resources** | req 1000Mi / 750m → lim 1250Mi / 1000m (largest footprint in the stack) |
| **Ingress** | Host `remotefalcon.com`, path prefix `/remote-falcon-gateway` |
| **Health probe** | `GET /actuator/health` |
| **Talks to** | Downstream services (config in app properties) |
| **GH Actions secrets** | `DIGITALOCEAN_ACCESS_TOKEN` |
| **In-cluster secrets** | none referenced in manifest |
| **Note** | Bundles the OpenTelemetry Java agent at image build (downloaded from upstream releases). |

### 3. remote-falcon-control-panel
| | |
|---|---|
| **Purpose** | Authenticated REST + GraphQL API for show owners (auth, account mgmt, sequence config, integrations) |
| **Stack** | Spring Boot 3, Java 21 GraalVM **native image** |
| **Container port** | 8080 |
| **Replicas** | 1 |
| **Resources** | req 256Mi / 100m → lim 512Mi / 500m |
| **Ingress** | Host `remotefalcon.com`, path prefix `/remote-falcon-control-panel` (proxy body size: 3 MB) |
| **Health probe** | `GET /remote-falcon-control-panel/actuator/health` |
| **Talks to** | MongoDB, GitHub (PAT), SendGrid, S3 (DigitalOcean Spaces), OpenAI / "Wattson" |
| **GH Actions secrets** | `DIGITALOCEAN_ACCESS_TOKEN` (no build-args) |
| **In-cluster secret** | `remote-falcon-control-panel` — keys: `mongo-uri`, `github-pat`, `sendgrid-key`, `jwt-user`, `client-header`, `s3-endpoint`, `s3-accessKey`, `s3-secretKey`, `wattson-key`, `openai-model`, `max-output-tokens` |

### 4. remote-falcon-viewer
| | |
|---|---|
| **Purpose** | Public viewer-facing API — current/next sequence, request/vote, page stats, geo-fencing, blocked-IP rules |
| **Stack** | Quarkus + SmallRye GraphQL + RESTEasy, Java 21 native image |
| **Container port** | 8080 |
| **Replicas** | 1 (HPA: min 1, max 1, scale at 85% CPU — effectively pinned today) |
| **Resources** | req 160Mi / 50m → lim 320Mi / 500m |
| **Ingress** | Host `remotefalcon.com`, path prefix `/remote-falcon-viewer` (forwarded headers enabled for client-IP) |
| **Health probe** | `GET /remote-falcon-viewer/q/health{,/live,/ready}` |
| **Talks to** | MongoDB |
| **GH Actions secrets** | `MONGO_URI` (build-arg, baked into native image), `DIGITALOCEAN_ACCESS_TOKEN` |
| **In-cluster secret** | `mongodb-connection` — key: `MONGO_URI` |
| **Observability** | Prometheus `ServiceMonitor` exposes `/remote-falcon-viewer/q/metrics`. Datadog log annotation present in manifest but **inert** (operator not installed — see Cluster topology). |
| **Note** | The build bakes `MONGO_URI` into the native image — rotating Mongo creds requires a rebuild, not just a Secret update. |

### 5. remote-falcon-plugins-api
| | |
|---|---|
| **Purpose** | API consumed by the FPP / show plugins — playlist sync, viewer control modes, votes, "what's playing" updates |
| **Stack** | Quarkus, Java 21 native image |
| **Container port** | 8080 |
| **Replicas** | 1 (HPA: min 1, max 1, scale at 85% CPU) |
| **Resources** | req 192Mi / 150m → lim 384Mi / 750m |
| **Ingress** | Host `remotefalcon.com`, path prefixes `/remote-falcon-plugins-api(...)` **and** `/remotefalcon/api(...)` (rewrite-target) |
| **Health probe** | `GET /q/health{,/live,/ready}` |
| **Talks to** | MongoDB |
| **GH Actions secrets** | `MONGO_URI` (build-arg), `DIGITALOCEAN_ACCESS_TOKEN` |
| **In-cluster secret** | `mongodb-connection` — key: `MONGO_URI` |
| **Observability** | Prometheus `ServiceMonitor` exposes `/q/metrics`. Datadog log annotation present in manifest but **inert** (operator not installed). |

### 6. remote-falcon-external-api
| | |
|---|---|
| **Purpose** | Third-party / external integrations API (GraphQL surface) for partners |
| **Stack** | Spring Boot 3, Java 21 native image |
| **Container port** | 8080 |
| **Replicas** | 1 |
| **Resources** | req 256Mi / 100m → lim 512Mi / 500m |
| **Ingress** | Host `remotefalcon.com`, paths `/remote-falcon-external-api(...)` **and** `/remotefalcon/api/external(...)` (rewrite-target) |
| **Health probe** | `GET /actuator/health` |
| **Talks to** | MongoDB |
| **GH Actions secrets** | `DIGITALOCEAN_ACCESS_TOKEN` (no Mongo build-arg — uses runtime env) |
| **In-cluster secret** | `remote-falcon-external-api` — key: `mongo-uri` |

### 7. remote-falcon-mongo-backup
| | |
|---|---|
| **Purpose** | Scheduled MongoDB dumps pushed to DigitalOcean Spaces (S3-compatible) |
| **Stack** | Quarkus, Java 21 native image |
| **Container port** | 8080 |
| **Replicas** | 1 |
| **Resources** | req 128Mi / 25m → lim 750Mi / 200m |
| **Ingress** | Host `remotefalcon.com`, path prefix `/remote-falcon-mongo-backup` (forwarded headers enabled — used to trigger backups manually) |
| **Health probe** | `GET /remote-falcon-mongo-backup/q/health{,/live,/ready}` |
| **Talks to** | MongoDB (read), DigitalOcean Spaces (write) |
| **GH Actions secrets** | `MONGO_URI`, `OTEL_URI`, `DIGITALOCEAN_ACCESS_TOKEN` |
| **In-cluster secrets** | `mongodb-connection` (`MONGO_URI`), `do-s3` (`AWS_ACCESS_KEY_ID`, `AWS_REGION`, `AWS_SECRET_ACCESS_KEY`), `mongo-backup-auth-token` (`BACKUP_AUTH_TOKEN`) |

### 8. remote-falcon-account-archive
| | |
|---|---|
| **Purpose** | Archives stale / inactive show accounts out of the live Mongo collections |
| **Stack** | Quarkus, Java 21 native image |
| **Container port** | 8080 |
| **Replicas** | 1 |
| **Resources** | req 64Mi / 10m → lim 128Mi / 100m |
| **Ingress** | none — internal Service only (`ClusterIP` on 8080, no Ingress resource) |
| **Health probe** | `GET /remote-falcon-account-archive/q/health{,/live,/ready}` |
| **Talks to** | MongoDB |
| **GH Actions secrets** | `MONGO_URI`, `OTEL_URI`, `DIGITALOCEAN_ACCESS_TOKEN` |
| **In-cluster secret** | `mongodb-connection` — key: `MONGO_URI` |

---

## Adjacent repos in the Remote-Falcon org

These repos do not deploy to the production cluster on their own, but they ship code that the production services depend on, that customers run, or that operators reach for during deployment / load testing / triage.

### Build-time dependency

#### remote-falcon-library
| | |
|---|---|
| **Purpose** | Shared MongoDB document/entity models, enums, and notification types — the canonical schema for `Show`, `Wattson`, `Notification`, etc. |
| **Stack** | Maven, Java 17, Spring Data MongoDB **and** Quarkus Panache (dual-stack: parallel `documents/*.java` and `quarkus/entity/*.java` packages cover the same types) |
| **Distribution** | JitPack — `com.github.Remote-Falcon:remote-falcon-library:<git-sha>` |
| **Currently pinned at** | `a5703a28fe` (2025-09-19, "Add Wattson entity for MongoDB integration") — current `master` HEAD; all 5 Java services are on this same SHA |
| **Consumed by** | `control-panel` (pom), `external-api` (pom), `viewer` (gradle), `plugins-api` (gradle), `account-archive` (gradle) — **5 of the 8 services** |
| **CI / tests** | None. No `src/test`, no `.github/workflows`. JitPack rebuilds on demand when a service resolves a new SHA. |
| **Note** | Schema changes here ripple to 5 services. Bumping the SHA in one service without the others risks Mongo document drift, with no contract test guarding against it. |

### Cluster-touching out-of-tree

#### remote-falcon-data (private)
A grab-bag repo: load tests, kind-cluster scripts for local dev, and **two manually-applied k8s resources**:

- `k8s/datadog-agent.yaml` — `DatadogAgent` CRD (operator-managed, `datadoghq.com/v2alpha1`). Targets namespaces `remote-falcon` and `default`, env tag `local`, Java auto-instrumentation. **Requires the Datadog Operator** and a pre-existing `datadog-secret/api-key` Secret in-cluster.
- `k8s/viewer-secret.yml` — `Opaque` Secret with keys `jwt-viewer` and `mongo-uri`. **The committed values are dev-template only** (decode to `host.docker.internal`). Replace with prod values before applying.

Also includes `kind/` (kind-cluster bring-up scripts for Mac/Windows), `k6/` (k6 load scripts), `mk-load-test.sh`, a JMeter project, and a CSV of test shows. No CI in this repo. Apply manually with `kubectl apply -f` after the cluster has the Datadog Operator installed. Last commit 2025-01-25.

#### remote-falcon-viewer-quarkus (private)
Experimental Quarkus rewrite of the viewer API. Has its own `Dockerfile`, `k8s/manifest.yml`, and `Build and Release` workflow — but:

- Workflow is **`workflow_dispatch` only** (no auto-deploy on push).
- Targets a **different DigitalOcean cluster** (`9badee22-...`), not the production one.
- One auto-generated test file (`ExampleResourceTest.java`); no real coverage.
- Last commit 2025-02-19; commit messages read as exploratory.

**Verdict:** dormant spike. Confirm with the prior maintainer before standing it up; safe to ignore for the production bring-up.

### Customer-facing artifacts

These ship code that runs *outside* the production cluster — on FPP show controllers, in viewer browsers, or as customer-installed tooling. A regression breaks production for end users, but no CI / no in-cluster deploy.

#### remote-falcon-plugin
| | |
|---|---|
| **Purpose** | FPP (Falcon Player) plugin customers install on their show controllers. Talks to `plugins-api`; drives playlist sync and viewer-control modes. |
| **Stack** | PHP (`remote_falcon_listener.php`, 655 LOC), HTML/JS UI (`remote_falcon_ui.html`, 318 LOC + `js/remote_falcon_core.js`, `js/remote_falcon_ui.js`), shell (`fpp_install.sh`, `pre/postStart.sh`, `pre/postStop.sh`) |
| **Distribution** | FPP plugin manifest at `https://raw.githubusercontent.com/remote-falcon/remote-falcon-plugin/master/pluginInfo.json` — customers pull whatever is on `master`. |
| **Tests / CI** | None. |
| **Last commit** | 2026-01-02 (active) |
| **Risk** | The wire format between this plugin and `plugins-api` is the only undocumented contract in the stack — and customers run *whatever version they last installed*. There is no plugin-version pinning on the API side. |

#### remote-falcon-viewer-page-js
| | |
|---|---|
| **Purpose** | JS scripts (snow effect, Christmas/Halloween/Thanksgiving/custom countdowns, dynamic menu) that show owners drop into their viewer pages. |
| **Stack** | Plain JS — repo rules require non-minified, no arguments, null-checked element access (CDN-served, statically loaded). |
| **Distribution** | Served as static files from `master`; manifest in `scripts.json` (6 scripts). |
| **Tests / CI** | None. |
| **Last commit** | 2026-01-29 (active) |
| **Risk** | Runs in every public viewer's browser. A regression breaks every show using the affected script with no rollback path other than reverting on `master`. |

#### remote-falcon-page-templates
| | |
|---|---|
| **Purpose** | Default viewer-page HTML templates offered when a show owner creates a new page (`the-og`, `lumos-light-show`, `purple-halloween`, `red-and-white`, `on-air`, `dynamic-menu`). |
| **Stack** | Static HTML. |
| **Distribution** | Read by `control-panel` when seeding a new viewer page. |
| **Tests / CI** | None. |
| **Last commit** | 2025-10-28 |

#### remote-falcon-maintenance-mode (private)
| | |
|---|---|
| **Purpose** | Static HTML page served when the stack is in maintenance. |
| **Stack** | One `index.html` + a background image. |
| **Distribution** | Mechanism not committed in this repo — likely pointed at by the ingress when a maintenance switch flips. |
| **Last commit** | 2025-12-26 |

### Operator / tooling

#### remote-falcon-deployment-wizard (private) — **NOT YET PUBLISHED 2026-04-27**
> In-development; not currently shipping to customers. Listed here so it's tracked when it does ship.

| | |
|---|---|
| **Purpose** | Customer-installable one-click deployer — Node/Express + WebSocket UI on `localhost:3030` that walks a user through a Docker / DigitalOcean deployment. |
| **Stack** | Node, Express 4, `ws`. Frontend in `wizard/index.html`. Has its own `Dockerfile.local` plus three compose files (`docker-compose.yaml`, `docker-compose.local.yml`, `docker-compose-test.yaml`) and `deploy.sh` / `redeploy.sh`. Launched via `run-wizard.sh` (Mac/Linux) or `run-wizard.bat` (Windows). |
| **Tests / CI** | None. |
| **Last commit** | 2025-10-16 |
| **Risk (when published)** | Runs on customer machines and provisions cloud resources on their account. Bugs here turn into customer-support tickets, not pages — but they still spend the customer's money. |

#### remote-falcon-deployment-electron (private)
**Empty repo** — only `LICENSE` + `.gitignore`. "Initial commit" 2025-10-17. Likely placeholder for a future Electron wrapper around the deployment wizard.

#### remote-falcon-load-tests (private)
k6 load tests targeting the viewer API (`viewer/viewer-graphql-smoke.js`) plus Node helper scripts (`check-missing-sequences.js`, `verify-data-integrity.js`, `update-preferences.js`, `verify-with-groups.js`) using the official `mongodb` driver. `random-shows-2025.json` provides test data; `load-test-results.txt` is committed output. No CI; run manually. Last commit 2025-10-01. Distinct from the older k6 / JMeter material in `remote-falcon-data`.

#### developer-files
Public companion repo to <https://docs.remotefalcon.com/docs/developer-docs/welcome> — a `do-ubuntu-droplet/` bring-up directory and a `local-docker-compose/` example. Useful for developers spinning up their own stack. Last commit 2025-11-28.

#### remote-falcon-mcp
**Empty repo** — only `LICENSE` + a 45-byte `README.md`. 2025-08-26 placeholder for a future MCP server. Nothing to deploy.

#### remote-falcon-mobile (private) — **ARCHIVED 2026-04-27**
> Repo archived; not currently maintained. Listed here for historical context so future-you doesn't wonder why a grayed-out repo with this name appears in the org.

Expo / React Native app (Expo Router, Apollo Client, Redux Toolkit, RN Paper). ~23 `.tsx` files in `app/`. Pre-build artifacts (`android/`, `ios/`) committed; distributed via EAS (`eas.json`). Not a server-side concern. Last commit 2025-04-14.

#### remote-falcon-issue-tracker
Tiny static site (`index.html` + `main.js`) plus an `external-api-sample/` folder containing `generate-jwt.php` and a sample HTML — appears to be a demo/scaffold for partners integrating against `external-api`. Last commit 2024-11-15 (oldest of the bunch).

#### 2025-project (private)
Empty remote — clones with `warning: You appear to have cloned an empty repository`. Placeholder.

---

## Cluster prerequisites (fresh bring-up checklist)

1. **DigitalOcean Kubernetes cluster** at the ID above (or update workflows if you create a new one — see "Migrating cluster IDs" below).
2. **DNS:** `remotefalcon.com` and `*.remotefalcon.com` → ingress LB.
3. **nginx ingress controller** installed.
4. **kube-prometheus-stack** installed with release name `kube-prometheus-stack-1768012917` (or update the label in `viewer` + `plugins-api` ServiceMonitors).
5. **Datadog Operator** — **NOT installed on the current cluster** (verified 2026-04-27). The original bring-up step would have installed it, created `datadog-secret` with key `api-key`, then applied `remote-falcon-data/k8s/datadog-agent.yaml`. Per [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md) the cluster will move to Grafana Cloud + PostHog instead; **do not** install Datadog as part of a fresh bring-up. The `ad.datadoghq.com/...` annotations on `viewer` and `plugins-api` manifests are inert without the operator and can be removed during the observability rollout.
6. **Namespace `remote-falcon`** created (each service's manifest also creates it idempotently).
7. **GHCR image pull secret** `remote-falcon-ghcr` created in the `remote-falcon` namespace.
8. **In-cluster Secrets** populated (see [Secrets matrix](#secrets-matrix) below).
9. **GitHub Actions secrets** populated on each repo (see [Secrets matrix](#secrets-matrix)).
10. Trigger workflows — the [`deploy-all.sh`](deploy-all.sh) script orchestrates this.

---

## Secrets matrix

### Kubernetes Secrets (in `remote-falcon` namespace)

| Secret name | Keys | Consumed by |
|---|---|---|
| `mongodb-connection` | `MONGO_URI` | viewer, plugins-api, account-archive, mongo-backup |
| `remote-falcon-control-panel` | `mongo-uri`, `github-pat`, `sendgrid-key`, `jwt-user`, `client-header`, `s3-endpoint`, `s3-accessKey`, `s3-secretKey`, `wattson-key`, `openai-model`, `max-output-tokens` | control-panel |
| `remote-falcon-external-api` | `mongo-uri` | external-api |
| `do-s3` | `AWS_ACCESS_KEY_ID`, `AWS_REGION`, `AWS_SECRET_ACCESS_KEY` | mongo-backup |
| `mongo-backup-auth-token` | `BACKUP_AUTH_TOKEN` | mongo-backup |
| `remote-falcon-ghcr` | `.dockerconfigjson` | (image pull, all services) |
| `datadog-secret` | `api-key` | Datadog agent |

### GitHub Actions Secrets (per repo)

| Secret | Repos that need it |
|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | **all 8** (used to fetch kubeconfig at deploy time) |
| `MONGO_URI` | viewer, plugins-api, account-archive, mongo-backup |
| `OTEL_URI` | account-archive, mongo-backup *(viewer / plugins-api hardcode empty)* |
| `VIEWER_JWT_KEY` | ui |
| `GOOGLE_MAPS_KEY` | ui |
| `PUBLIC_POSTHOG_KEY` | ui |
| `GA_TRACKING_ID` | ui |
| `MIXPANEL_KEY` | ui |
| `CLARITY_PROJECT_ID` | ui |
| `GITHUB_TOKEN` | (auto, for GHCR push) |

> **Heads-up:** `MONGO_URI` and the UI's third-party keys are **baked into the image at build time** (Docker build-args / Vite env). Rotating any of them requires a fresh build — restarting pods is not enough.

---

## Migrating cluster IDs

If you spin up a new DO cluster, the cluster ID is hard-coded in **every** repo's `.github/workflows/build-and-release.yml`:

```yaml
- name: Save DigitalOcean kubeconfig
  run: doctl kubernetes cluster kubeconfig save --expiry-seconds 600 4f1406fe-1179-4a9c-9d2e-835c3da34984
```

Find/replace across all 8 repos when migrating. (Quick command from `~/rf-build`:
`grep -rl 4f1406fe-1179-4a9c-9d2e-835c3da34984 */.github/workflows/`)

---

## Bring-up order

For a clean cluster, deploy in this order so backends are ready when the UI lands:

1. `remote-falcon-gateway` (routes traffic for everything else)
2. Backends in any order: `remote-falcon-control-panel`, `remote-falcon-viewer`, `remote-falcon-plugins-api`, `remote-falcon-external-api`, `remote-falcon-mongo-backup`, `remote-falcon-account-archive`
3. `remote-falcon-ui` (calls into the backends — deploy last so it gets a healthy stack)

`deploy-all.sh` triggers in this order by default.

---

## Local development stack

For end-to-end work without DigitalOcean / GitHub Actions, the repo ships a Docker Compose stack that mirrors the prod ingress paths so UI <-> API URLs are identical to production.

**See also:** [TESTING.md](TESTING.md) — full test-coverage audit and improvement roadmap across all 8 services.

**Files:**
- [docker-compose.dev.yml](docker-compose.dev.yml) — stack definition (8 services + Mongo + nginx)
- [dev-nginx.conf](dev-nginx.conf) — reverse-proxy config matching the prod nginx-ingress rules
- [.env.dev.example](.env.dev.example) — secret template (copy to `.env.dev`)
- [dev-up.sh](dev-up.sh) — wrapper for `up / down / logs / rebuild / health / shell / nuke`

**Quick start:**
```bash
./dev-up.sh up        # bootstraps .env.dev, builds, brings up the stack
./dev-up.sh health    # smoke-test every service
./dev-up.sh logs ui   # tail one service
./dev-up.sh rebuild viewer   # rebuild + restart one service
./dev-up.sh down      # stop, keep mongo data
./dev-up.sh nuke      # stop + drop mongo volume (destructive)
```

**Endpoints:**
- All-in-one (browser): `http://localhost:8080` — same paths as prod
- Mongo: `mongodb://localhost:27017/remote-falcon`
- Direct service ports (bypass nginx): control-panel 8081, viewer 8082, plugins-api 8083, external-api 8084, mongo-backup 8085, account-archive 8086, gateway 8087, ui 3000

**Caveats:**
- **Dev uses JVM, not native.** Each service has a `Dockerfile.dev` (JVM jar / Quarkus fast-jar) alongside its prod `Dockerfile` (GraalVM native). The local Compose stack builds the `.dev` variants; build time per service is ~1-3 min. Stack-wide initial build is ~5-8 min in core mode, ~10-15 min in platform mode. Native builds remain canonical for CI/prod deploys. See `ops/README.md` for the dev/prod build contract.
- **`MONGO_URI` is baked into the Quarkus native images at build time** via Docker build-args. The compose file passes `mongodb://mongo:27017/remote-falcon` so service-to-service DNS works inside the docker network. To repoint, change the compose build-args and rebuild — restarting alone won't help.
- **No Datadog / OpenTelemetry / ServiceMonitor** in the dev stack. Those run in prod via the `remote-falcon-data` repo and `kube-prometheus-stack` — out of scope for local.
- **Optional secrets** (SendGrid, OpenAI/Wattson, Google Maps, S3 backup, etc.) default to empty in `.env.dev.example`. The corresponding features just won't work in dev unless you fill them in.

**Faster per-service iteration:** for tight inner-loop work on one service, run that service natively (e.g. `./gradlew quarkusDev` for Quarkus, `npm run dev` for the UI) and have it talk to the dockerized Mongo at `localhost:27017`. Skips the native-image build entirely.
