# Phase C Kickoff — Test Pyramid & Release Gating

**Created:** 2026-05-06
**Owner:** Matt Shorts
**Status:** Decisions ratified · Sprint 1 ready to start
**Related docs:** [CONSOLIDATION-PLAN.md](CONSOLIDATION-PLAN.md) (Phase C section), [TESTING.md](TESTING.md) (current-state audit), [SERVICES.md](SERVICES.md)

---

## 1. Why Phase C is the right next investment

After Phase A (monorepo cutover, completed 2026-05-06), the platform deploys cleanly from one place. But every push to `main` still deploys without running any tests. The cluster is the safety net.

The risk landscape:

| Service | Test coverage today | What's at stake |
|---|---|---|
| `mongo-backup` | 0 tests | Silent backup failure → unrecoverable data loss |
| `account-archive` | 0 tests | Deletes customer accounts |
| Control-panel auth (`AuthUtil`, `@RequiresAccess`, JWT chain) | 0 tests | Entire authenticated surface |
| Retention cron (PR #79, runs nightly at 03:00 UTC) | 0 tests | Trims customer stats; bug = data loss |
| `viewer` / `plugins-api` | 88 + 58 tests, **unenforced in CI** | Highest traffic; can regress silently |
| `libs/schema` (canonical Mongo schema for 5 services) | 0 tests | Silent drift between Spring Data + Quarkus Panache mappings |

Phase C addresses every one of these, plus:

- **Unblocks Phase D.** Service merges (8 → 5) are dangerous without a regression net. With Phase C in place, each merge can be validated.
- **Proactive vs. reactive.** Observability (Phase E7) tells you when prod broke; testing tells you before prod breaks.
- **Solo-dev safety.** Christmas season is ~6 months out. Don't be debugging in November.

**Estimated effort:** ~1.5–2 weeks across three sprints, breaking down to:
- Sprint 1 (3 days): foundation + first test in each tier
- Sprint 2 (1 week): high-risk service tests, UI Vitest, cleanup
- Sprint 3 (3–5 days): contract tests, regression e2e, post-deploy smoke

---

## 2. Foundational principle — invest for current stack

We considered weighting tests by portability across a hypothetical future language migration. **Decision: don't.** Migration is "future me's problem" — may or may not happen, and the test investment that's "lost" in a rewrite is just code, not data. Tests written now will catch real bugs in real production for a year+ before any rewrite.

Two principles do survive that framing:

1. **Don't write tests that catch nothing.** Spring bean wiring tests, mocked-repository tests where testcontainers is barely slower, redundant assertions of framework guarantees. Skip these.
2. **Prefer testcontainers over mocks where the failure mode is query construction.** Real Mongo round-trips catch bugs (collation, projection, indexing) that mocks paper over.

---

## 3. CI topology

The current `deploy.yml` runs `detect → deploy[matrix:service] → build → push → apply → rollout`. Phase C wraps it with parallel test jobs.

### Final shape

```
on:
  push:
    branches: [main]
  pull_request:               # NEW — tests run on every PR
    branches: [main]
  workflow_dispatch:
    inputs:
      service: { ... }
      dry_run: { ... }
      skip_tests:             # NEW — emergency override
        type: boolean
        default: false

jobs:
  detect: { ... unchanged ... }

  test-unit:
    needs: detect
    if: ${{ inputs.skip_tests != true }}
    strategy:
      fail-fast: false
      matrix:
        service: ${{ fromJSON(needs.detect.outputs.services) }}
    uses: ./.github/workflows/_test-service.yml   # NEW reusable workflow
    with:
      service: ${{ matrix.service }}

  test-contract:
    needs: detect
    if: ${{ inputs.skip_tests != true }}
    runs-on: ubuntu-latest
    # Schema round-trip + plugin contract fixtures

  test-e2e:
    needs: detect
    if: ${{ inputs.skip_tests != true && (github.event_name == 'push' || github.event_name == 'pull_request') }}
    runs-on: ubuntu-latest
    timeout-minutes: 25
    # Bring up dev-up.sh stack, run Playwright smoke tier
    # Skipped on workflow_dispatch (manual triggers don't wait 5+ min for stack)

  deploy:
    needs: [detect, test-unit, test-contract, test-e2e]
    # ... existing logic, runs only on push to main ...
```

### Why this shape

- **Hybrid parallelism.** `test-unit` matrix runs alongside `test-contract` alongside `test-e2e`. Total wall time bounded by the slowest single thing (currently the native build at ~17 min for control-panel). Tests fit within that envelope.
- **Per-service unit isolation.** A broken test in one service blocks only that service's deploy, not the whole matrix.
- **Cross-service tests at the right scope.** Contract failure or e2e failure correctly blocks all deploys (wire-format break is global; full-stack break is global).
- **Reusable `_test-service.yml`.** Keeps `deploy.yml` readable; consolidation plan's original Phase B work, deferred until now.
- **Pull-request trigger.** Tests run on every PR. Catches regressions before merge.
- **`skip_tests` emergency override.** Hatch for "test infra broken, must hotfix prod." Logged loudly, never default-true.
- **`test-e2e` skips on `workflow_dispatch`.** Bringing up the full stack takes 5–10 min; ad-hoc manual deploys don't need to wait.

---

## 4. Test framework choices per surface

### Quarkus services (`viewer`, `plugins-api`, `mongo-backup`, `account-archive`)
- **Stack:** JUnit 5 + Quarkus Test + Mockito + REST Assured + Testcontainers
- **Coverage:** JaCoCo (already configured); thresholds via `<rules>` config
- Pattern: `@QuarkusTest` for HTTP-level integration tests, plain `@Test` for pure-logic units, testcontainers `@Container` static fields for Mongo/S3

### Spring services (`gateway`, `control-panel`, `external-api`)
- **Stack:** JUnit 5 + Spring Boot Test + Mockito + Testcontainers + JaCoCo
- Pattern: `@SpringBootTest` for full-context tests, `@DataMongoTest` for repository slice tests, `MockMvc` for controller-level

### UI (`apps/ui`)
- **Vitest + React Testing Library** for component/hook unit tests (fast feedback)
- **No Cypress.** The 2 existing Cypress specs (`landing.cy.js`, `signup.cy.js`) are pre-auth flows that the new Playwright `login.spec.ts` covers. Migrate then delete (Sprint 2).
- Coverage: v8 / c8 (Vitest's default)

### Full-stack e2e (`tests/e2e/`)
- **Playwright (TypeScript).** Replaces Cypress for everything UI-related.
- **TypeScript** for specs even though UI is `.jsx` — Playwright's first-class language; types make selectors reliable.
- `tests/e2e/smoke/` (block PRs, ~5 specs, <2 min Playwright runtime) and `tests/e2e/regression/` (nightly, ~20 specs, 10–15 min, informational).

### Schema contract (`libs/schema/src/test/`)
- **Plain JUnit.** Round-trip tests serialize through Spring Data `ObjectMapper`, deserialize through Quarkus Jackson, assert equality. Catches dual-mapper drift.

### External plugin contract (`tests/contract/`)
- **Hand-rolled captured fixtures + REST Assured.** JSON request/response files captured from real plugin versions; replayed against the running `plugins-api`. Zero plugin-side changes; upgrade path to Pact later if needed.

### Coverage thresholds — per-service tier-specific with ratchets

| Service | Sprint 1 floor | Sprint 3 floor (mature) | Notes |
|---|---|---|---|
| `viewer` | 60% / 60% line/branch | 70% / 65% | Current state passes, locks in progress |
| `plugins-api` | 60% / 60% | 70% / 65% | Same |
| `mongo-backup` | 80% line on `*.service.*` | 80% | Set by Sprint 1 PR B `MongoBackupServiceTest` |
| `account-archive` | 0% | 80% line on service classes | Sprint 2 `AccountArchiveServiceTest` |
| `control-panel` | 0% | 50% / 40% | Sprint 2 lifts via JWT/auth + retention tests |
| `external-api` | 0% | 50% / 40% | Sprint 2 lifts |
| `gateway` | (skip) | (skip) | 1 source class, mostly framework wiring |
| `ui` | 0% | 30% line | Sprint 2/3; e2e tier covers most paths anyway |

The ratchet pattern: after each sprint, raise the floor to wherever current coverage actually sits. Locks in progress, prevents regression, doesn't block work.

### Sonar — defer
SonarCloud workflows existed pre-monorepo; deleted in Phase A5. Don't restore. JaCoCo HTML reports do 95% of what Sonar's coverage view does. Restore later if we miss the trend dashboard.

---

## 5. Test data strategy — `libs/test-fixtures/` + `tests/fixtures/`

### Layout

```
libs/test-fixtures/                          # Java module, depends on libs/schema
├── pom.xml
├── src/main/java/com/remotefalcon/testfixtures/
│   ├── ShowFactory.java                     # Object Mother + Builder
│   ├── SequenceFactory.java                 # (Sprint 2)
│   ├── PreferencesFactory.java              # (Sprint 2)
│   ├── StatsFactory.java                    # (Sprint 2)
│   ├── JwtFactory.java
│   ├── MongoSeed.java
│   └── TestSecrets.java                     # Single source of truth for test keys
└── src/main/resources/
    └── canonical/
        └── canonical-show.json              # Reference Show for snapshot tests

tests/fixtures/                              # Non-Java consumers
├── plugin-requests/                         # Captured FPP plugin payloads, by version
│   └── README.md                            # Sprint 1 stub; Sprint 3 fills with real captures
├── seed-shows/
│   └── happy-path-show.json                 # Sprint 1 lands one
└── README.md

tests/contract/
└── PluginsApiContractTest.java              # Sprint 3

tests/e2e/
├── playwright.config.ts
├── global-setup.ts                          # Loads tests/fixtures/seed-shows/* into Mongo
├── package.json
├── tsconfig.json
├── smoke/
│   └── login.spec.ts                        # Sprint 1
└── regression/                              # Sprint 3
```

### Why `src/main/java/` (not `src/test/`) in `libs/test-fixtures/`

Test fixtures need to be exportable to other modules' test classpaths. Living in `src/main/java/` means they're regular dependency-jar contents. Each consumer adds the dep with `<scope>test</scope>` — fixtures don't ship in production JARs.

### Object Mother + Builder pattern

```java
// 90% of tests
Show show = ShowFactory.canonical();

// One-field customization
Show show = ShowFactory.builder().email("specific@test.com").build();

// Nested factory customization
Show show = ShowFactory.builder()
    .preferences(PreferencesFactory.builder().geoFenceEnabled(true).build())
    .build();
```

**Anti-patterns avoided:**
- No shared assertion helpers — only construction.
- No mutable fixtures — `canonical()` returns a fresh instance each call.
- No service-specific factories here — only entities from `libs/schema/`.

### JWT key — single source of truth, drift-detected

```java
// libs/test-fixtures/src/main/java/.../TestSecrets.java
public final class TestSecrets {
    public static final String JWT_KEY = "test-jwt-must-be-256-bits-long-padding-padding-padding-padding";
    public static final Duration DEFAULT_TOKEN_TTL = Duration.ofHours(1);
}
```

Each service's `application-test.yml` uses the same value as a fallback:

```yaml
# apps/control-panel/src/test/resources/application-test.yml
jwt:
  user: ${JWT_USER:test-jwt-must-be-256-bits-long-padding-padding-padding-padding}
```

**Drift detection:** a smoke test in `libs/test-fixtures/src/test/` asserts `TestSecrets.JWT_KEY` matches the YAML default. Tests for the test infrastructure — but it's the right kind: catches a drift class that's silent otherwise.

### Faker
- **Java:** `net.datafaker:datafaker:2.x` (active fork of `com.github.javafaker`). Java 21 compatible.
- **TypeScript:** `@faker-js/faker` for Playwright specs. Different lib, similar API; coexists fine.

### Anonymized prod data — defer
Faker-driven canonical fixtures cover ~95% of test scenarios. Real prod data adds value for "did this real customer payload break our parser" — interesting class but premature. Add ad-hoc when a specific bug class motivates it.

---

## 6. E2E orchestration

### Stack bring-up: `dev-up.sh up` from source (Sprint 1)
~3-min warm start with GHA Docker layer cache. Path-A in the original analysis. Future enhancement (Phase C7 era): split `deploy` into "build/push" + "apply/rollout" so e2e can consume the candidate image, but not Sprint 1.

### CI step shape (`test-e2e` job)

```yaml
test-e2e:
  needs: detect
  if: ${{ inputs.skip_tests != true && (github.event_name == 'push' || github.event_name == 'pull_request') }}
  runs-on: ubuntu-latest
  timeout-minutes: 25
  steps:
    - uses: actions/checkout@v5
    - uses: docker/setup-buildx-action@v3
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
        cache-dependency-path: tests/e2e/package-lock.json
    - run: npm ci
      working-directory: tests/e2e
    - run: npx playwright install --with-deps chromium
      working-directory: tests/e2e
    - run: ./ops/dev-up.sh up
    - run: ./ops/dev-up.sh health
    - run: npx playwright test
      working-directory: tests/e2e
      env:
        PLAYWRIGHT_TIER: smoke
    - if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report-${{ github.run_id }}
        path: tests/e2e/playwright-report/
        retention-days: 14
    - if: always()
      run: ./ops/dev-up.sh down
```

### Playwright config highlights

| Setting | Value | Why |
|---|---|---|
| `retries` | 2 in CI, 0 locally | Most flakes resolve by retry 2; real bugs fail all 3 |
| `workers` | 2 in CI | GHA runner is 2-core, 7GB RAM |
| `fullyParallel` | true | Forces test isolation discipline |
| `trace` | on-first-retry | Cheap on green, full diagnostic on red |
| `screenshot` | only-on-failure | Bounded artifact size |
| `video` | retain-on-failure | Same |
| `forbidOnly` | `!!process.env.CI` | Guards against `test.only(...)` accidentally committed |
| Browsers Sprint 1 | chromium only | Add Firefox + WebKit Sprint 3 |

### Mongo seeding via `globalSetup`

`tests/e2e/global-setup.ts` runs once before all specs. Connects to the dev-stack Mongo (`localhost:27017`), clears the `show` collection, loads JSON files from `tests/fixtures/seed-shows/`. Mutation specs use unique faker-generated identifiers to avoid collisions.

### Cadence

| Tier | When | Specs | Behavior |
|---|---|---|---|
| Smoke | Every PR + push to main | ~5 (login, viewer, plugin request, signup, dashboard) | Blocks deploy |
| Regression | Nightly cron 06:00 UTC + manual dispatch | ~20 (sequence editor, votes/requests, page editor) | Files issue on failure; doesn't block |

Regression tier lives in a **separate workflow** (`.github/workflows/nightly-regression.yml`) — cleaner mental model, separate notification channel, easier to disable/tune independently.

### Flake handling

Three-tier policy (escalation only when needed):
1. **First-class** — default. All Sprint 1 specs start here. 2 retries.
2. **Quarantined** — tagged `@flaky`, runs in nightly only, files issue on failure. Move criteria: 3 retry-passes-but-fails-in-a-row in 7 days.
3. **Skipped** — `test.skip(...)` with linked tracker issue. Move criteria: quarantine fails to stabilize within 2 weeks.

Don't pre-build the quarantine machinery. Add when first persistent flake surfaces.

---

## 7. Sprint 1 — concrete deliverables

### PR A — Test infrastructure foundation (~1.5 days)

**File-level deliverables:**

1. `.github/workflows/_test-service.yml` (new) — reusable workflow, takes `service` input, runs the matching test command per service stack
2. `.github/workflows/deploy.yml` (modify):
   - Add `pull_request` trigger
   - Add `skip_tests` workflow_dispatch input
   - Add `test-unit` matrix job, calling `_test-service.yml`
   - Add `test-contract` job
   - Add `test-e2e` job
   - Update `deploy` job's `needs` list
3. `libs/test-fixtures/` (new module):
   - `pom.xml` with deps on `libs/schema` + `net.datafaker:datafaker:2.x` + `io.jsonwebtoken:jjwt-api/impl/jackson`
   - `src/main/java/com/remotefalcon/testfixtures/ShowFactory.java`
   - `src/main/java/com/remotefalcon/testfixtures/JwtFactory.java`
   - `src/main/java/com/remotefalcon/testfixtures/MongoSeed.java`
   - `src/main/java/com/remotefalcon/testfixtures/TestSecrets.java`
   - `src/test/java/com/remotefalcon/testfixtures/TestSecretsDriftTest.java`
4. Root `pom.xml` (modify): add `libs/test-fixtures` as a `<module>`
5. `tests/fixtures/seed-shows/happy-path-show.json` (new)
6. `tests/fixtures/plugin-requests/README.md` (new — capture procedure stub for Sprint 3)
7. `tests/e2e/` (new):
   - `playwright.config.ts`
   - `global-setup.ts`
   - `package.json` + `package-lock.json`
   - `tsconfig.json`
   - `smoke/health.spec.ts` (placeholder asserting `http://localhost:8080/health.json` returns 200)
   - `README.md`
8. `tests/contract/PluginsApiPlaceholderTest.java` (new — stub, replaced in Sprint 3)
9. **Verification commit:** deliberately break the placeholder, push, watch CI fail, revert. Document in the PR description.

**PR A success criteria:**
- All 3 test jobs run on the PR
- All 3 pass with placeholders
- Deliberately-broken placeholder fails CI before reaching `deploy`
- Locally: `cd tests/e2e && npm run test:e2e:smoke` works against `dev-up.sh`

### PR B — First real tests in each tier (~1.5 days)

1. `tests/e2e/smoke/login.spec.ts` — full sign up → verify → log in → see dashboard. Replaces `health.spec.ts`. ~50 lines.
2. `libs/schema/src/test/java/com/remotefalcon/library/ShowSchemaRoundTripTest.java` — load canonical Show via `ShowFactory.canonical()`, serialize via Spring Data `ObjectMapper`, deserialize via Quarkus `JsonbConfig`, assert equality across `Show`, `Wattson`, `Notification`. ~80 lines.
3. `apps/mongo-backup/src/test/java/.../MongoBackupServiceTest.java`:
   - Testcontainers Mongo + LocalStack S3
   - Asserts: dump file key format `mongo-backup-YYYYMMDD-HHMMSS.gz`
   - S3 `PutObject` called with bucket from `BACKUP_S3_BUCKET` env
   - Retention deletes objects older than configured retention window
   - Failure path: S3 throws → service logs `Backup upload failed`, doesn't crash silently
   - ~150 lines
4. JaCoCo thresholds wired (per the table in §4):
   - viewer / plugins-api: 60% / 60% line/branch
   - mongo-backup: 80% line on `*.service.*` package
   - others: 0% (will ratchet)
5. `docs/TESTING.md` (rewrite): replaces the existing audit doc with "current state + how to add tests" guide. Sections:
   - Test pyramid by tier (matches §4)
   - How to write each kind of test (one example per tier with file pointers)
   - Coverage thresholds per service (table)
   - Local dev workflow
   - CI workflow

**PR B success criteria:**
- `login.spec.ts` passes locally and in CI
- `MongoBackupServiceTest` covers the 4 assertion points; mongo-backup coverage ≥80% on service classes
- Schema round-trip catches a deliberately-broken Show field annotation
- `docs/TESTING.md` has working pointers to all the new files

### Sprint 1 demo / acceptance test

End-of-Sprint-1 you should be able to:

1. Open a PR that deliberately breaks one assertion in any of the 3 test tiers → CI fails before deploy
2. Open a PR that fixes the break → CI passes, deploy proceeds
3. Open a PR that drops mongo-backup coverage below 80% → CI fails on JaCoCo threshold
4. Run `./ops/dev-up.sh up && cd tests/e2e && npm run test:e2e:smoke` locally → smoke passes
5. Open `docs/TESTING.md` → working pointers to one example test per tier

### Sprint 1 schedule

| Day | Hours | Work |
|---|---|---|
| Day 1 morning | 4h | PR A: CI restructuring (`_test-service.yml`, `deploy.yml` updates, `pull_request` trigger, `skip_tests` input) |
| Day 1 afternoon | 4h | PR A: `libs/test-fixtures/` module + `TestSecrets` drift test + `tests/fixtures/` shell |
| Day 2 morning | 4h | PR A: `tests/e2e/` harness + `health.spec.ts` placeholder + `tests/contract/` placeholder |
| Day 2 afternoon | 2h | PR A: verification commits, open PR, merge |
| Day 2 EOD | 2h | PR B begin: `login.spec.ts` |
| Day 3 morning | 4h | PR B: `MongoBackupServiceTest` (testcontainers + LocalStack) |
| Day 3 afternoon | 2h | PR B: `ShowSchemaRoundTripTest` + JaCoCo thresholds + `docs/TESTING.md` |
| Day 3 EOD | 1h | PR B: verification, open PR, merge |

Total: ~23 hours, fits 3 working days with realistic interruption budget.

---

## 8. Sprint 2 — high-risk service tests, UI Vitest, cleanup (~1 week)

After Sprint 1's foundation:

| Item | Notes |
|---|---|
| C2: delete 4k LOC of commented-out tests in `apps/control-panel` + `apps/external-api` | Mechanical cleanup. Doesn't add coverage but removes a misleading "tests exist" signal |
| C3.2: `AccountArchiveServiceTest` | Same pattern as `MongoBackupServiceTest` — testcontainers Mongo. Asserts: `findByLastLoginDate` cutoff predicate, "don't archive accounts with recent activity," empty-result handling |
| C3.3: `WebSecurityConfig` + `AuthUtil` + `@RequiresAccess` end-to-end JWT test in control-panel | `MockMvc` exercising real JWT issuance via `JwtFactory` and validation via Spring Security chain. The auth surface for the entire authenticated stack |
| C3.4: Retention cron tests | Unit test on `purgeStatsForShow(Show)` (millisecond feedback on trim math) + testcontainers test on `purgeStaleStatsForAllShows` streaming sweep (catches OOM / cursor leak bugs) |
| C3.5: `findByEmailCollation` query construction test | ~30 minutes; verify Spring Data emits a query doc with the right collation. Catches the regression class that originally led to PR #73 |
| C8: UI env-var boot assertion | `apps/ui/src/index.jsx` throws on boot if any required `VITE_*` is empty. Eliminates silent-misconfig deploy class |
| First Vitest setup + 2–3 component/hook unit tests | Pick the highest-signal: `useInterval` (saved-callback pattern), `JWTContext.login`, custom hooks in `src/hooks/`. Establishes Vitest pattern for Sprint 3 |
| Cypress→Playwright migration (or delete) | Existing 2 specs (`landing.cy.js`, `signup.cy.js`) — `login.spec.ts` from Sprint 1 covers similar ground. Recommend: delete |
| Coverage threshold ratchet | Lift floors based on Sprint 1+2 coverage actually achieved |

**Sprint 2 success criteria:**
- All "high-risk untested service" classes from §1 are now tested
- UI has Vitest scaffolding + first specs
- Cypress dependency removed
- Coverage thresholds reflect current state

---

## 9. Sprint 3 — contract tests, regression e2e, post-deploy smoke (~3–5 days)

| Item | Notes |
|---|---|
| C5.1: schema round-trip already in Sprint 1 (`ShowSchemaRoundTripTest`) | Extend with `Wattson`, `Notification` if not done |
| C5.2: plugin contract tests | Capture 3–5 real plugin requests from prod (PostHog server-side events or access logs). Store as `tests/fixtures/plugin-requests/<endpoint>/<version>.json`. `PluginsApiContractTest` replays them against testcontainers stack |
| C5.3: cross-service control-panel ↔ viewer schema integration test | One e2e-style test that writes a Show via control-panel API, reads it via viewer API, asserts shared collections actually round-trip |
| C6 regression tier expansion | Grow `tests/e2e/regression/` to ~20 specs. Sequence editor, votes/requests config, account email change, page editor |
| C7: post-deploy smoke + auto-rollback | Tail end of `_deploy-service.yml`: hit each service's health endpoint + 1 critical path; on failure, `kubectl rollout undo` + workflow fails red. Requires splitting `deploy` into "build/push" + "apply/rollout" jobs (the same restructure that enables option-B e2e) |
| `nightly-regression.yml` workflow | Cron + workflow_dispatch triggers; runs regression tier; files issue on failure |
| Firefox + WebKit added to Playwright project matrix | Browser coverage |

**Sprint 3 success criteria:**
- Plugin contract tests block deploy on wire-format break
- Regression tier runs nightly, files issues on failure
- Post-deploy auto-rollback triggers on a deliberately-broken commit

---

## 10. Open risks & unknowns

These are flagged for Sprint 1+ to surface and resolve:

1. **`test-e2e` cold-start time may exceed budget.** First CI run after a long cache miss could be 8–10 min stack bring-up + 2 min Playwright = ~12 min. Within `timeout-minutes: 25` cap but eats into the deploy wall-clock budget. Mitigation: prioritize Docker layer caching in PR A; if still slow in Sprint 2, evaluate option-B (pull pre-built images).

2. **Testcontainers + LocalStack may have container-startup edge cases on GitHub-hosted runners.** Docker-in-Docker quirks. Mitigation: validate `MongoBackupServiceTest` runs in CI (not just locally) before PR B closes.

3. **Library `pom.xml` dependency cycle.** `libs/test-fixtures` depends on `libs/schema`. Anything in `libs/schema/src/test/` that uses `ShowFactory` would create a cycle. Mitigation: keep `libs/schema/src/test/` minimal (round-trip tests only, build entities directly); factory-using tests live in service modules.

4. **JWT key drift between `TestSecrets` and per-service `application-test.yml`.** The drift test catches it but only if every service has an `application-test.yml` we check. Mitigation: drift test enumerates expected services and verifies each.

5. **PR trigger increases CI minutes.** Standard tradeoff for "pre-merge safety gate." For solo dev with low push volume, negligible (~5% increase). Reassess if it becomes material.

6. **`skip_tests` is a footgun.** If used carelessly, untested code ships. Mitigation: log loudly when used, document the "only for hotfix when test infra is broken" intent in the workflow input description.

7. **Playwright `globalSetup` race with `dev-up.sh health` in CI.** The health gate covers most of this but seeds run after, so if Mongo is briefly unready post-health, seeding could fail. Mitigation: `globalSetup` retries on connection failure with backoff.

---

## 11. Reference: decision summary table

| Q | Decision | Rationale |
|---|---|---|
| Q1 | Invest for current Java/Spring/Quarkus + React stack; no portability tax | Future migration is hypothetical; tests catch real bugs now; throwing away test code in a rewrite is acceptable |
| Q2 | Hybrid CI topology — `test-unit` matrix + `test-contract` + `test-e2e` parallel; PR trigger; `skip_tests` override | Maximum parallelism; correct failure isolation; pre-merge gate; emergency hatch |
| Q3a | JUnit + Quarkus/Spring Test + Mockito + REST Assured + Testcontainers + JaCoCo | Industry standard, already in use; Sonar deferred |
| Q3b | Vitest + RTL for UI components; drop Cypress | Fast feedback for hook/reducer logic; Cypress redundant given Playwright |
| Q3c | Playwright (TypeScript) for e2e | Replaces Cypress; better CI story; multi-browser support |
| Q3d | Hand-rolled captured fixtures for plugin contract; upgrade path to Pact | No plugin-side changes needed; simple JSON files |
| Q4 | `libs/test-fixtures/` Maven module + `tests/fixtures/` for non-Java; Object Mother + Builder; faker; defer anonymized prod data | Schema-coupled fixtures live with schema; non-Java consumers don't pull a Java JAR |
| Q5 | `dev-up.sh` from source for Sprint 1; chromium-only; smoke blocks PR + regression nightly informational; 2 retries; 14-day artifact retention | Path-A simpler than option-B image-pull; balanced pragmatism vs. coverage |
| Q6 | Two-PR Sprint 1 (infra + tests); mongo-backup as first C3 service; defer everything else to Sprints 2/3 | Foundation + first real test in each tier; tightest scope that demonstrates value |

---

## 12. Next action

After this doc lands, **Sprint 1 PR A starts**: CI restructuring + `libs/test-fixtures/` skeleton + `tests/e2e/` harness skeleton + placeholder tests in each tier. Verification commit on a feature branch proves the gates work before relying on them.

Once PR A merges, **PR B**: real tests in each tier + JaCoCo thresholds + `TESTING.md` rewrite.

Sprint 1 done = platform measurably safer, CI gate demonstrably works, foundation for Sprints 2/3 in place.
