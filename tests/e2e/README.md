# Remote Falcon e2e tests

Playwright-driven end-to-end tests for the full Remote Falcon stack. Specs target the local dev-up stack (UI + gateway + backends + Mongo) at `http://localhost:8080` so paths match prod ingress.

## Layout

- `smoke/` — fast, must-pass-before-merge specs. Block PRs.
- `regression/` — broader, slower coverage. Runs nightly. (Specs added Sprint 3.)
- `global-setup.ts` — resets the `show` collection in Mongo and seeds fixtures from `tests/fixtures/seed-shows/`.
- `playwright.config.ts` — shared config; `PLAYWRIGHT_TIER` env var selects which directory matches.

## Prerequisites

Bring up the full stack from the monorepo root:

```bash
./ops/dev-up.sh up
./ops/dev-up.sh health
```

`dev-up.sh up` builds and starts every service; `health` smoke-tests each service's health endpoint. Wait until all are green before running specs.

## Running specs

From `tests/e2e/`:

```bash
npm install                     # first time only
npm run test:e2e:smoke           # the smoke tier — runs in CI on every PR
npm run test:e2e:regression      # nightly tier (specs land Sprint 3)
```

### Authoring & debugging

```bash
npm run test:e2e:ui              # interactive Playwright UI mode for writing specs
PWDEBUG=1 npm run test:e2e:debug # step through a failing spec with the inspector
```

Playwright reports land in `tests/e2e/playwright-report/` (HTML) and `tests/e2e/test-results/` (traces, screenshots, video on failure).

## Tearing down

```bash
./ops/dev-up.sh down             # stop containers, keep Mongo data
./ops/dev-up.sh nuke             # also drop the Mongo volume (DESTRUCTIVE)
```

## Where specs live

- `smoke/` — block PRs. Should stay fast (< 2 min total) and cover critical user paths.
- `regression/` — runs nightly, may exercise slower flows and broader coverage. Empty until Sprint 3.

## Mongo connection

`global-setup.ts` connects to Mongo via `MONGO_URI` (default `mongodb://root:root@localhost:27017/?authSource=admin`) and `MONGO_DATABASE` (default `remote-falcon`). Override either env var if you point the harness at a non-default deployment.
