# Remote Falcon — Testing Guide

**Last updated:** 2026-05-24
**Status:** Operational reference (post Phase C coverage-ratchet)
**Related docs:** [PHASE-C-KICKOFF.md](PHASE-C-KICKOFF.md), [SERVICES.md](SERVICES.md)

> **What changed (2026-05-24):** Coverage gates are now actually enforced by CI. The `_test-service.yml` workflow now runs `mvn verify` / `./gradlew check` / `npm run test:coverage` — the test commands that include the jacoco/vitest threshold checks. Previously the gates existed in build files but CI invoked `mvn test` / `./gradlew test` / `npm run test:unit`, none of which trigger threshold verification. As part of the same ratchet, `control-panel`, `external-api`, and `ui` moved off their 0% Sprint 1 floors with substantial new test coverage.
>
> **Prior change (2026-05-06):** This doc replaces the prior audit-state writeup. After Phase C Sprint 1 landed real tests in each tier and the initial CI jobs, the doc became a current-state + how-to-add-tests guide. Pre-rewrite content lives in git history.

---

## TL;DR — current state

| Service | Stack | Test count | Coverage gate | CI enforces |
|---|---|---:|---|:---:|
| [`apps/viewer`](../apps/viewer) | Quarkus 21 native | 88 `@Test` | 60% line / 60% branch (JaCoCo) | ✓ |
| [`apps/plugins-api`](../apps/plugins-api) | Quarkus 21 native | 56 `@Test` | 60% line / 60% branch (JaCoCo) | ✓ |
| [`apps/mongo-backup`](../apps/mongo-backup) | Quarkus 21 native | testcontainers + LocalStack | 80% line on `*.service.*` | ✓ |
| [`apps/account-archive`](../apps/account-archive) | Quarkus 21 native | 9 `@Test` | 80% line on service + repository packages | ✓ |
| [`apps/control-panel`](../apps/control-panel) | Spring Boot 3 native | ~199 `@Test` | 76% line / 68% branch (JaCoCo, BUNDLE) | ✓ |
| [`apps/external-api`](../apps/external-api) | Spring Boot 3 native | 30 `@Test` | 75% line / 85% branch (JaCoCo, BUNDLE) | ✓ |
| [`apps/gateway`](../apps/gateway) | Spring Cloud Gateway | 0 | (skip — config-only service) | ✓ |
| [`apps/ui`](../apps/ui) | Vite + React + Vitest | 360 tests across 56 files | 30% line (Vitest v8) | ✓ |
| [`libs/schema`](../libs/schema) | JUnit 5 | 1 round-trip | n/a | ✓ |
| [`libs/test-fixtures`](../libs/test-fixtures) | JUnit 5 | 1 drift test | n/a | ✓ |
| [`tests/contract`](../tests/contract) | REST Assured + JUnit 5 | placeholder | n/a (real fixtures Sprint 3) | ✓ |
| [`tests/e2e`](../tests/e2e) | Playwright (TS) | smoke: login | n/a | ✓ |

**Three CI jobs gate every PR + push to main:** `test-unit` (matrix per service), `test-contract`, `test-e2e`. All three must pass before `deploy` runs. The `test-unit` step uses the threshold-enforcing variant of each service's test command (see [§ CI workflow](#ci-workflow) below).

**The framework choice doc is [PHASE-C-KICKOFF.md § 4](PHASE-C-KICKOFF.md#4-test-framework-choices-per-surface).** This doc focuses on day-to-day "how do I write or run a test" mechanics.

---

## Test pyramid — five tiers

The platform has five distinct test surfaces. Each has a fixed framework choice (don't introduce a sixth without a discussion).

### 1. Quarkus services
Targets: [`apps/viewer`](../apps/viewer), [`apps/plugins-api`](../apps/plugins-api), [`apps/mongo-backup`](../apps/mongo-backup), [`apps/account-archive`](../apps/account-archive)

- **Frameworks:** JUnit 5 + Quarkus Test (`@QuarkusTest`) + Mockito + REST Assured + Testcontainers
- **Coverage:** JaCoCo, thresholds enforced via `<rules>` in each service's `build.gradle`
- **Patterns:**
  - `@QuarkusTest` for HTTP-level integration tests (boots full app)
  - Plain `@Test` + Mockito for pure-logic units
  - `@Container` static field for Mongo/S3 (LocalStack) testcontainers
- **Test path convention:** `apps/<svc>/src/test/java/com/remotefalcon/<svc>/...`

### 2. Spring services
Targets: [`apps/gateway`](../apps/gateway), [`apps/control-panel`](../apps/control-panel), [`apps/external-api`](../apps/external-api)

- **Frameworks:** JUnit 5 + Spring Boot Test + Mockito + Testcontainers + JaCoCo
- **Patterns:**
  - `@SpringBootTest` for full-context tests
  - `@DataMongoTest` for repo-slice tests
  - `MockMvc` / `WebTestClient` for controller-level
  - WireMock (already in `pom.xml`) for outbound HTTP stubs (GitHub PAT, SendGrid, OpenAI)
- **Test path convention:** `apps/<svc>/src/test/java/com/remotefalcon/<svc>/...`

### 3. UI
Target: [`apps/ui`](../apps/ui)

- **Sprint 1:** UI tests are still the 2 legacy Cypress specs (deleted in Sprint 2 — `login.spec.ts` covers same ground via Playwright).
- **Sprint 2:** Vitest + React Testing Library for component/hook units. Coverage via Vitest's built-in v8/c8 reporter.
- **Full-stack flows live in `tests/e2e/` (Playwright), not in `apps/ui/`.** UI-side tests cover hooks, reducers, and isolated components only.

### 4. Schema contract
Target: [`libs/schema`](../libs/schema)

- **Framework:** Plain JUnit 5 — no Spring, no Quarkus, just `ObjectMapper` instances.
- **What it catches:** Drift between Spring Data and Quarkus Panache mappings on shared documents (`Show`, `Wattson`, `Notification`). 5 services consume `libs/schema` and used to silently desync on field renames; now they round-trip JSON+BSON through both mappers in the same test.
- **Test path:** `libs/schema/src/test/java/com/remotefalcon/library/...`

### 5. External plugin contract
Target: [`tests/contract`](../tests/contract)

- **Sprint 1:** placeholder test (boots the harness, asserts trivially) — proves the wiring works.
- **Sprint 3:** captured JSON request/response fixtures from real FPP plugin versions (sourced from PostHog server-side events / access logs). Replayed against the running `plugins-api` via REST Assured + testcontainers.
- **Why hand-rolled fixtures, not Pact:** Zero plugin-side changes required. Customers run whatever version they last installed; we can't ask them to publish a contract. Upgrade path to Pact later if/when that constraint changes.
- **Test path:** `tests/contract/src/test/java/com/remotefalcon/contract/...`

---

## How to add a test — one example per tier

The shortest path to seeing each pattern in action is to read the canonical example, copy, edit. Pointers below.

### Tier 1 — per-service unit/integration test (Quarkus)

Example: [`apps/mongo-backup/src/test/java/com/remotefalcon/mongobackup/service/MongoBackupServiceTest.java`](../apps/mongo-backup/src/test/java/com/remotefalcon/mongobackup/service/MongoBackupServiceTest.java)

This test uses Testcontainers Mongo + LocalStack S3 to assert:

1. Dump file key format (`mongo-backup-YYYYMMDD-HHMMSS.gz`)
2. S3 `PutObject` is called with the bucket from `BACKUP_S3_BUCKET`
3. Retention deletes objects older than the retention window
4. Failure path (S3 throws) logs and doesn't crash silently

Pattern to copy when adding a new Quarkus service test:

```java
@QuarkusTest
@TestProfile(MongoBackupServiceTest.Profile.class)
class MongoBackupServiceTest {

    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @Container
    static LocalStackContainer localstack =
        new LocalStackContainer(DockerImageName.parse("localstack/localstack:3"))
            .withServices(S3);

    @Inject MongoBackupService service;

    @Test
    void writes_dump_to_s3_with_dated_key() {
        // ... arrange via testcontainers, act via service.run(), assert S3 client saw PutObject
    }
}
```

Run a single Quarkus service test:
```bash
cd apps/mongo-backup
./gradlew test --tests "MongoBackupServiceTest.writes_dump_to_s3_with_dated_key"
```

### Tier 2 — per-service unit/integration test (Spring)

For a Spring service the entry pattern is `@SpringBootTest` + `MockMvc`. There's no Sprint 1 example yet (Sprint 2 lands the JWT/auth tests in [`apps/control-panel`](../apps/control-panel)). Until then, copy from public Spring Boot Test docs and use [`libs/test-fixtures`](../libs/test-fixtures) for `Show` / JWT construction:

```java
@SpringBootTest
@AutoConfigureMockMvc
class WebSecurityConfigTest {
    @Autowired MockMvc mvc;

    @Test
    void unauthenticated_request_returns_401() throws Exception {
        mvc.perform(get("/api/showInfo")).andExpect(status().isUnauthorized());
    }

    @Test
    void valid_jwt_returns_200() throws Exception {
        String token = JwtFactory.validToken("user@test.com");
        mvc.perform(get("/api/showInfo").header("Authorization", "Bearer " + token))
           .andExpect(status().isOk());
    }
}
```

### Tier 3 — schema round-trip test

Example: [`libs/schema/src/test/java/com/remotefalcon/library/ShowSchemaRoundTripTest.java`](../libs/schema/src/test/java/com/remotefalcon/library/ShowSchemaRoundTripTest.java)

This test serializes a canonical `Show` (built via [`ShowFactory.canonical()`](../libs/test-fixtures/src/main/java/com/remotefalcon/testfixtures/ShowFactory.java)) through Spring Data's `ObjectMapper`, deserializes through Quarkus's Jackson config, and asserts equality. Catches the dual-mapper drift class — a field that's `@JsonProperty("foo")` in one mapping and unannotated in the other will round-trip differently.

To add a new schema entity to the round-trip:

1. Add a factory in [`libs/test-fixtures`](../libs/test-fixtures) (e.g. `WattsonFactory.canonical()`)
2. Add a `@Test` to `ShowSchemaRoundTripTest` that calls the new factory and asserts equality
3. Run: `mvn -pl libs/schema -am test`

> **Cycle warning:** `libs/test-fixtures` depends on `libs/schema`. Don't have `libs/schema/src/test/` use `ShowFactory` (would cycle). Build entities directly inside the schema module's tests.

### Tier 4 — contract test placeholder

Example: [`tests/contract/src/test/java/com/remotefalcon/contract/PluginsApiPlaceholderTest.java`](../tests/contract/src/test/java/com/remotefalcon/contract/PluginsApiPlaceholderTest.java)

The Sprint 1 file proves the harness boots, the testcontainers stack starts, and CI's `test-contract` job runs. It asserts trivially.

**Sprint 3 will replace this with real captured fixtures.** Procedure stub: [`tests/fixtures/plugin-requests/README.md`](../tests/fixtures/plugin-requests/README.md). The flow will be:

1. Capture 3–5 real plugin requests from prod (PostHog server-side events or `plugins-api` access logs)
2. Save as `tests/fixtures/plugin-requests/<endpoint>/<plugin-version>.json`
3. `PluginsApiContractTest` (replacing the placeholder) launches the testcontainers `plugins-api` image, replays each captured request, and asserts the response matches the captured response

Until then, the placeholder gates that the harness doesn't break.

### Tier 5 — E2E smoke spec (Playwright)

Example: [`tests/e2e/smoke/login.spec.ts`](../tests/e2e/smoke/login.spec.ts)

The first real spec covers full sign-up → email-verify → log-in → see dashboard. Pattern:

```ts
import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('user can sign up, verify, log in, see dashboard', async ({ page }) => {
    const email = faker.internet.email();
    await page.goto('/');
    // ... drive the flow
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

To add a new smoke spec:

1. Drop a `.spec.ts` file in [`tests/e2e/smoke/`](../tests/e2e/smoke)
2. Use `faker` for unique identifiers (avoids cross-spec collisions; the `globalSetup` clears Mongo only once)
3. If the spec needs seed data, add a JSON to [`tests/fixtures/seed-shows/`](../tests/fixtures/seed-shows) — `tests/e2e/global-setup.ts` loads everything in that dir
4. Run locally: `cd tests/e2e && npm run test:e2e:smoke`
5. Author iteratively: `cd tests/e2e && npm run test:e2e:ui` (Playwright UI mode — clickable steps, time-travel debugging)

**Smoke specs block deploy.** Keep them <30s each, ~5 specs total. Larger flows go in [`tests/e2e/regression/`](../tests/e2e) (Sprint 3 — nightly cron, doesn't block).

### Tier extra — test fixtures (Object Mother + Builder)

Examples:
- [`libs/test-fixtures/src/main/java/com/remotefalcon/testfixtures/ShowFactory.java`](../libs/test-fixtures/src/main/java/com/remotefalcon/testfixtures/ShowFactory.java)
- [`libs/test-fixtures/src/main/java/com/remotefalcon/testfixtures/JwtFactory.java`](../libs/test-fixtures/src/main/java/com/remotefalcon/testfixtures/JwtFactory.java)

Use these in any service test that needs a `Show` or JWT. Three usage patterns:

```java
// 90% of the time — canonical, no customization
Show show = ShowFactory.canonical();

// One field tweaked
Show show = ShowFactory.builder().email("specific@test.com").build();

// Nested factory customization
Show show = ShowFactory.builder()
    .preferences(PreferencesFactory.builder().geoFenceEnabled(true).build())
    .build();
```

**Ground rules** (don't break these without a discussion):

- Factories return *fresh* instances every call — never share mutable fixtures across tests.
- No assertion helpers in `libs/test-fixtures` — only construction. Service-specific assertion logic stays in the service's own test classpath.
- No service-specific factories here — only entities from `libs/schema/`. Service-specific request/response DTOs get factories inside the service's own `src/test/`.

**Adding a new factory:** Put it in `libs/test-fixtures/src/main/java/...` (note: `src/main/`, not `src/test/` — fixtures need to be exportable to other modules' test classpaths). Each consumer adds the dep with `<scope>test</scope>`. See [PHASE-C-KICKOFF.md § 5](PHASE-C-KICKOFF.md#5-test-data-strategy--libstest-fixtures--testsfixtures) for rationale.

**JWT key drift detection:** [`TestSecretsDriftTest`](../libs/test-fixtures/src/test/java/com/remotefalcon/testfixtures/TestSecretsDriftTest.java) asserts that [`TestSecrets.JWT_KEY`](../libs/test-fixtures/src/main/java/com/remotefalcon/testfixtures/TestSecrets.java) matches every service's `application-test.yml` default. If you add a service with JWT auth, add it to the enumeration in that drift test or you'll get a silent gap.

---

## Coverage thresholds per service

These are Sprint 1 floors — set deliberately low so they pass *today* and ratchet up after each sprint as real coverage lands. The goal is "lock in progress, prevent regression" not "block work."

| Service | Sprint 1 floor | Sprint 3 target | How it's enforced |
|---|---|---|---|
| `apps/viewer` | 60% line / 60% branch | 70% / 65% | JaCoCo `<rules>` in [`build.gradle`](../apps/viewer/build.gradle) |
| `apps/plugins-api` | 60% line / 60% branch | 70% / 65% | JaCoCo `<rules>` in [`build.gradle`](../apps/plugins-api/build.gradle) |
| `apps/mongo-backup` | 80% line on `*.service.*` | 80% | JaCoCo, scoped to service classes |
| `apps/account-archive` | 0% | 80% line on service classes | Sprint 2 |
| `apps/control-panel` | 0% | 50% / 40% | Sprint 2 (JWT/auth tests lift it) |
| `apps/external-api` | 0% | 50% / 40% | Sprint 2 |
| `apps/gateway` | (skip) | (skip) | 1 source class, mostly framework wiring |
| `apps/ui` | 0% | 30% line | Sprint 2 (Vitest); e2e covers most paths anyway |

**Ratchet rule:** at the end of each sprint, raise each service's floor to wherever current coverage actually sits, minus a 2-point buffer for noise. Lock in progress; don't try to forecast.

**No SonarCloud.** JaCoCo HTML reports do 95% of what Sonar's coverage view does. Restore Sonar later if we miss the trend dashboard.

---

## Local dev workflow

All commands are from the monorepo root unless noted.

### Per-service tests

Two flavors: the fast inner-loop command (tests only) and the gate-enforcing variant CI runs (tests + coverage threshold). Use the fast one while iterating; switch to the gate variant before opening a PR to catch threshold misses before CI does.

| Service stack | Fast (no gate) | CI-equivalent (gate fires) |
|---|---|---|
| Maven (Spring) | `mvn -pl apps/<service> -am test` | `mvn -pl apps/<service> -am verify` |
| Gradle (Quarkus) | `cd apps/<service> && ./gradlew test` | `cd apps/<service> && ./gradlew check` |
| UI | `cd apps/ui && npm test` | `cd apps/ui && npm run test:coverage` |

Single-test run (fast loop):
- Maven: `mvn -pl apps/<service> -Dtest=ClassName#method test`
- Gradle: `cd apps/<service> && ./gradlew test --tests "ClassName.method"`

### Schema, fixtures, contract — Maven multi-module

```bash
mvn -pl libs/schema,libs/test-fixtures,tests/contract -am test
```

Or one at a time:

```bash
mvn -pl libs/schema -am test
mvn -pl libs/test-fixtures -am test
mvn -pl tests/contract -am test
```

`-am` ("also-make") builds the upstream modules `libs/test-fixtures` depends on (`libs/schema`).

### E2E — Playwright

Bring up the local stack, then run smoke specs:

```bash
./ops/dev-up.sh up --core
cd tests/e2e
npm run test:e2e:smoke
```

`--core` brings up gateway + control-panel + viewer + plugins-api + mongo + ui (the surfaces the smoke specs hit). Skips `mongo-backup` and `account-archive` to shave ~2 min off cold start.

Authoring iteratively (Playwright UI — clickable test runner with time-travel debugging):

```bash
cd tests/e2e
npm run test:e2e:ui
```

Targeting one spec:

```bash
cd tests/e2e
npx playwright test smoke/login.spec.ts
```

### Health-check shortcut

```bash
./ops/dev-up.sh health
```

Hits every service's health endpoint; non-200 fails the script. The CI `test-e2e` job runs this before invoking Playwright.

---

## CI workflow

Three test jobs run in parallel on every PR and every push to `main`:

```
detect ─┬─→ test-unit (matrix: per service)  ─┐
        ├─→ test-contract                     ├─→ deploy
        └─→ test-e2e                          ─┘
```

Source: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). The reusable per-service test workflow lives at [`.github/workflows/_test-service.yml`](../.github/workflows/_test-service.yml).

### Triggers

| Event | What runs |
|---|---|
| `pull_request` to `main` | All 3 test jobs. `deploy` does not run. |
| `push` to `main` | All 3 test jobs gate `deploy`. |
| `workflow_dispatch` (manual) | `test-unit` + `test-contract` only. `test-e2e` skipped (5–10 min stack bring-up not worth it for ad-hoc deploys). |

### Job behavior

- **`test-unit`** runs as a matrix per service. A broken test in one service blocks only that service's deploy lane, not the whole matrix.
- **`test-contract`** runs the schema round-trip and external plugin contract tests. A failure here blocks *all* deploys — wire-format or schema breaks are global.
- **`test-e2e`** brings up the full stack via `./ops/dev-up.sh up`, runs `./ops/dev-up.sh health`, then runs Playwright smoke. Failure blocks all deploys.

### Emergency override — `skip_tests`

A boolean `workflow_dispatch` input on `deploy.yml`. Default `false`. Set `true` only when:

- Test infrastructure itself is broken (Docker registry outage, GHA runner issue) **and** you must hotfix prod.
- The fix you're shipping has been validated locally.

Logged loudly in the workflow run summary. Don't make this a habit.

### Failure artifacts

- **Playwright HTML reports** auto-upload on `test-e2e` failure to GitHub Actions Artifacts as `playwright-report-<run-id>` with **14-day retention**. Open the report in a browser to see screenshots, video, and full traces of every failed step.
- **JaCoCo HTML reports** are NOT auto-uploaded today (Sprint 2 may add). For now, run `./gradlew jacocoTestReport` locally and open `apps/<svc>/build/reports/jacoco/test/html/index.html`.

### Retry policy

Playwright runs with `retries: 2` in CI (most flakes resolve by retry 2; real bugs fail all 3) and `retries: 0` locally. `trace: on-first-retry` keeps green-run artifact size bounded but produces full diagnostics on red.

---

## What's NOT in Sprint 1 — see kickoff doc for the rest

Sprint 1 deliberately ships the *foundation* + one real test in each tier. Everything else is in Sprint 2 / 3. Cross-references:

### Sprint 2 — see [PHASE-C-KICKOFF.md § 8](PHASE-C-KICKOFF.md#8-sprint-2--high-risk-service-tests-ui-vitest-cleanup-1-week)

- `AccountArchiveServiceTest` (same shape as `MongoBackupServiceTest`)
- Control-panel JWT / auth end-to-end test (the entire authenticated surface today has zero coverage)
- Retention cron tests — unit on `purgeStatsForShow(Show)`, testcontainers on `purgeStaleStatsForAllShows`
- `findByEmailCollation` query construction test (the regression class behind PR #73)
- UI Vitest scaffolding + first 2–3 component/hook unit tests
- UI env-var boot assertion (throws on missing required `VITE_*`)
- Cypress → Playwright migration: delete the 2 legacy Cypress specs (`landing.cy.js`, `signup.cy.js`); `login.spec.ts` covers same ground
- C2 cleanup: delete 4k LOC of commented-out tests in `apps/control-panel` and `apps/external-api`
- Coverage threshold ratchet — lift floors to current actuals

### Sprint 3 — see [PHASE-C-KICKOFF.md § 9](PHASE-C-KICKOFF.md#9-sprint-3--contract-tests-regression-e2e-post-deploy-smoke-35-days)

- Real plugin contract tests (capture 3–5 real plugin requests from prod, replay against testcontainers `plugins-api`)
- Cross-service control-panel ↔ viewer schema integration test
- Regression e2e tier: grow `tests/e2e/regression/` to ~20 specs (sequence editor, votes/requests config, account email change, page editor)
- `nightly-regression.yml` workflow — cron + manual dispatch, files an issue on failure
- Post-deploy smoke + auto-rollback (split `deploy` into "build/push" + "apply/rollout"; smoke hits health + 1 critical path; failure triggers `kubectl rollout undo`)
- Firefox + WebKit added to Playwright project matrix

### Out of Phase C entirely

- Mutation testing (Pitest) on `GraphQLMutationService` (viewer) and `PluginService` (plugins-api)
- A11y smoke via `@axe-core/playwright`
- k6 / Gatling load tests (the [`remote-falcon-data`](../../remote-falcon-data) and [`remote-falcon-load-tests`](../../remote-falcon-load-tests) repos already have starting points)
- GraalVM native-image test target in CI for the 6 native services
- Anonymized prod data fixtures (faker covers ~95% today; revisit when a specific bug class motivates real data)

---

## Gotchas & FAQ

### "I added a new service. How do I wire it into CI?"

1. Add it to the `detect` job's service list in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
2. Make sure its build command (Gradle or Maven) is in [`.github/workflows/_test-service.yml`](../.github/workflows/_test-service.yml).
3. Add a JaCoCo `<rules>` block to its build file even if floor is 0% — establishes the gate so future ratchets are mechanical.
4. If it has JWT auth, add it to the enumeration in [`TestSecretsDriftTest`](../libs/test-fixtures/src/test/java/com/remotefalcon/testfixtures/TestSecretsDriftTest.java).

### "My test passes locally but fails in CI."

Most common causes, in order of likelihood:

1. **Flaky timing in Playwright.** `retries: 2` should mask it; if all 3 fail in CI but pass locally, suspect a race that the slower CI runner exposes. Add `await expect(...).toBeVisible()` waits, not `setTimeout`.
2. **Testcontainers + GHA Docker-in-Docker.** Edge cases with networking. Make sure container ports use `getMappedPort()`, not hardcoded values.
3. **Missing env var.** Locally you might have a `.env` Docker Compose loaded; CI doesn't. Check `application-test.yml` defaults.
4. **`globalSetup` race.** Mongo briefly unready post-health-check. The setup should retry on connection failure with backoff.

### "I want to write a test that uses a real production payload."

Defer. Faker-driven canonical fixtures cover ~95% of test scenarios. If a specific bug class motivates anonymized prod data, capture the minimal slice as a JSON fixture in [`tests/fixtures/`](../tests/fixtures), strip PII, commit. Don't build a general anonymization pipeline yet.

### "Where does the e2e Mongo seed data come from?"

[`tests/e2e/global-setup.ts`](../tests/e2e/global-setup.ts) connects to the dev-stack Mongo (`localhost:27017`) before any spec runs. It clears the `show` collection and loads every JSON file in [`tests/fixtures/seed-shows/`](../tests/fixtures/seed-shows). Mutation specs use unique faker-generated identifiers to avoid colliding with each other (the seed only runs once per test session).

### "How do I disable a flaky test?"

Three escalation tiers — start at 1, only move up if needed:

1. **First-class** (default). 2 retries handle most flakes.
2. **Quarantined** — tag with `@flaky`, runs in nightly only, files issue on failure. Move criteria: 3 retry-passes-but-fails-in-a-row in 7 days.
3. **Skipped** — `test.skip(...)` with linked tracker issue. Move criteria: quarantine fails to stabilize within 2 weeks.

Don't pre-build the quarantine machinery; add it the first time you need it.

### "Can I add a new test framework?"

Probably not. The five frameworks above (JUnit, Quarkus Test, Spring Boot Test, Vitest, Playwright) cover every existing surface. Adding one is a discussion, not a unilateral decision — a sixth framework means a sixth mental model, a sixth set of CI plumbing, and a sixth thing to keep upgraded. Make the case in a kickoff doc first.

---

*If you change something that affects this doc — adding a service, restructuring CI jobs, changing coverage floors, moving file paths — update this doc in the same change. Stale ops docs are worse than no ops docs.*
