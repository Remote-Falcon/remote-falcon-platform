# Remote Falcon Platform

Monorepo for the Remote Falcon platform — the show-owner control panel, the public viewer experience, the FPP plugin API, and the supporting jobs and infrastructure that keep it all running.

## Layout

| | |
|---|---|
| [`apps/`](apps/) | Production services — see each subdirectory's README for details |
| [`libs/schema/`](libs/schema/) | Shared MongoDB schema, consumed by 5 of the 8 backend services |
| [`ops/`](ops/) | Local dev stack — `dev-up.sh`, Compose, nginx — with platform/core profile split for self-host |
| [`docs/`](docs/) | Architecture, operational, and migration references |

## Services

| Service | Stack | Purpose |
|---|---|---|
| [`apps/ui`](apps/ui) | Vite + React | Frontend SPA — control panel + per-show viewer pages |
| [`apps/gateway`](apps/gateway) | Spring Cloud Gateway (JVM JAR) | Path routing + filters in front of every backend |
| [`apps/control-panel`](apps/control-panel) | Spring Boot 3 native | Authenticated REST + GraphQL for show owners |
| [`apps/viewer`](apps/viewer) | Quarkus native | Public viewer-facing API — request, vote, page stats |
| [`apps/plugins-api`](apps/plugins-api) | Quarkus native | API consumed by the FPP plugin on customer controllers |
| [`apps/external-api`](apps/external-api) | Spring Boot 3 native | Partner GraphQL surface |
| [`apps/mongo-backup`](apps/mongo-backup) | Quarkus native | Scheduled MongoDB → S3 backup |
| [`apps/account-archive`](apps/account-archive) | Quarkus native | Scheduled archive of stale accounts + cleanup of unverified signups |

## Documentation

All architecture, operational, and migration documentation lives in [`docs/`](docs/).

| Doc | Purpose | Lifespan |
|---|---|---|
| [`docs/SELF-HOST.md`](docs/SELF-HOST.md) | Canonical "run your own Remote Falcon" guide. Reads `ops/self-host/` artifacts. | Permanent |
| [`docs/SERVICES.md`](docs/SERVICES.md) | Operator's catalog: each service's deploy mechanics, secrets matrix, cluster prerequisites, bring-up order | Permanent |
| [`docs/TESTING.md`](docs/TESTING.md) | Per-service test inventory, cross-cutting findings, phased improvement plan | Permanent |
| [`docs/CONSOLIDATION-PLAN.md`](docs/CONSOLIDATION-PLAN.md) | Migration roadmap: 24 repos → 1 monorepo, 8 services → 5, no test gating → release-validated pipeline | Transient (~3 months) |
| [`docs/OBSERVABILITY-PLAN.md`](docs/OBSERVABILITY-PLAN.md) | Full-stack observability rollout: OpenTelemetry + Grafana Cloud + PostHog | Transient (~3 months) |

If you change something that affects deploy mechanics, secrets, test counts, or repo membership, update the relevant doc in the same change.

## Status

Consolidation in progress. Currently in **Phase A** of [`docs/CONSOLIDATION-PLAN.md`](docs/CONSOLIDATION-PLAN.md) — services have been imported via subtree-merge, JitPack has been replaced with the local `libs/schema` module, and `ops/` now hosts the local dev stack with platform/core mode split. The per-service GitHub Actions workflows are still in place. Phases A4–A7 (cutover gate, unified CI scaffolding, GHCR + repo archive), then B (unified CI), C (test pyramid), D (service merges), and E (observability + cleanup) follow.

## Build order (Phase A interim)

Because Gradle and Maven services share `libs/schema`, but the Gradle services consume it via `mavenLocal()` for now (full Gradle composite is deferred to Phase B):

```bash
# Install libs/schema into the local Maven repo first
mvn install -pl libs/schema -am

# After that, any of:
mvn -pl apps/control-panel package         # Maven consumer
mvn -pl apps/external-api package          # Maven consumer
cd apps/viewer && ./gradlew build          # Gradle consumer (resolves schema from mavenLocal)
cd apps/plugins-api && ./gradlew build     # Gradle consumer
cd apps/account-archive && ./gradlew build # Gradle consumer
cd apps/mongo-backup && ./gradlew build    # Gradle non-consumer (no install step needed)
```

The local Compose stack ([`./ops/dev-up.sh up`](ops/)) wraps this for full-stack development. See [`ops/README.md`](ops/README.md) for the platform/core mode split.

## Customer-facing repos (out-of-tree)

These ship code that runs *outside* the production cluster — on FPP show controllers, in viewer browsers, or as customer-installed tooling. They release independently and are deliberately *not* part of this monorepo:

- [`remote-falcon-plugin`](https://github.com/Remote-Falcon/remote-falcon-plugin) — FPP plugin (PHP + JS + shell)
- [`remote-falcon-viewer-page-js`](https://github.com/Remote-Falcon/remote-falcon-viewer-page-js) — CDN-served viewer-page scripts
- [`remote-falcon-page-templates`](https://github.com/Remote-Falcon/remote-falcon-page-templates) — default viewer-page HTML templates
- [`remote-falcon-issue-tracker`](https://github.com/Remote-Falcon/remote-falcon-issue-tracker) — public bug/feature tracker + External API sample
