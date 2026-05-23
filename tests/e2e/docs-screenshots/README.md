# docs-screenshots tier

Playwright tier that drives the control-panel UI to capture canonical PNGs
(light + dark) for the docs site. Lives alongside the existing `smoke` and
`regression` tiers, gated by `PLAYWRIGHT_TIER=docs-screenshots`.

Phase 1 produces **10 named shots × 2 themes = 20 PNGs** into
`docs-output/screenshots/{light,dark}/` plus a `screenshots.manifest.json`.
The sync script in the docusaurus repo copies them into
`static/img/screenshots/`.

## Running locally

The tier needs a dev stack pointed at an isolated Mongo DB. The
`ops/docker-compose.docs.yml` overlay sets the right `SPRING_DATA_MONGODB_URI`
and `MONGO_DATABASE` on the control-panel container (per PRD §5.3 / Q3 —
both env vars are required because Spring's `database` property takes
precedence over the URI's path component).

```bash
# 1. populate .env.local with the fixture credentials
cp tests/e2e/.env.example tests/e2e/.env.local
# edit DOCS_FIXTURE_USER_EMAIL / DOCS_FIXTURE_USER_PASSWORD inside .env.local

# 2. bring up the docs-mode dev stack
docker compose \
  -f ops/docker-compose.dev.yml \
  -f ops/docker-compose.docs.yml \
  --env-file ops/.env.dev \
  up -d --force-recreate control-panel ui ingress

# 3. run the tier
cd tests/e2e && npm run test:e2e:docs-screenshots
```

`playwright.config.ts` autoloads `tests/e2e/.env.local` via `dotenv` on
startup, so the fixture credentials and the GraphQL URL override surface
without a manual `export`. Output lands in `docs-output/` at the repo root.

To return to normal smoke/regression mode, drop the docs overlay and
recreate the control-panel:

```bash
docker compose -f ops/docker-compose.dev.yml --env-file ops/.env.dev \
  up -d --force-recreate control-panel
```

### Two-phase seed

`global-setup.ts` runs in two phases when `PLAYWRIGHT_TIER=docs-screenshots`:

1. **Phase A — live signUp.** POSTs the `signUp` GraphQL mutation against
   `http://localhost:8081/remote-falcon-control-panel/graphql` (override via
   `DOCS_CONTROL_PANEL_GRAPHQL_URL`) with HTTP Basic Auth
   `${DOCS_FIXTURE_USER_EMAIL}:${DOCS_FIXTURE_USER_PASSWORD}`. The
   control-panel handles bcrypt hashing, default page init, and uniqueness.
2. **Phase B — Mongo enrichment.** Reads
   `tests/e2e/fixtures/seed-shows-docs/docs-demo-show.json` and applies it
   via `$set` to the just-created show. Timestamp fields in the JSON
   (`lastFppHeartbeat`, `activeViewers[*].visitDateTime`,
   `viewerSessions[*].{firstSeen,lastSeen,nightDate}`,
   `votes[*].lastVoteTime`) are **rewritten at apply-time** so the
   dashboard tiles compute correctly (within last 5 min, today's window,
   30s heartbeat).

The `show` collection in `remote-falcon-docs` is dropped at the start of
each run — every run is idempotent.

## Concurrency constraint

The docs-screenshots tier and the smoke/regression tiers **cannot run
concurrently against the same dev stack**. They share the same control-panel
container; the docs tier repoints it at `remote-falcon-docs`. Switch back by
recreating the control-panel without the override.

## Troubleshooting

- **`signUp` returns false or 4xx in Phase A.** Most likely the fixture
  email or showSubdomain (derived from showName) already exists. Drop the
  `show` collection in `remote-falcon-docs` and retry — global-setup does
  this automatically, but a stale run can leave records behind.
- **Phase A succeeds but the viewer page renders blank later.** Known
  gotcha (PRD §8 Q8): `signUp` calls `fetchDefaultPageHtml()` against
  `raw.githubusercontent.com/Remote-Falcon/remote-falcon-page-templates`
  to populate the default page. If the dev box is offline, the default
  page is empty. The v1 shot inventory does not capture the viewer page,
  so this is non-blocking — just noisy.
- **Dashboard tiles show zeros.** The Phase B timestamp rewrites depend on
  the host clock. Confirm `activeViewers[*].visitDateTime` ended up within
  the last 5 minutes UTC and `viewerSessions[*]` is in today's window for
  the show's timezone.

## See also

- [PRD](/Users/matthewshorts/rf-build/RemoteFalcon-Docs-Screenshot-Automation-PRD.md) —
  full design, §5.3 (seed strategy), Appendix A.3 (field shapes),
  §8 Q1/Q2/Q3/Q8/Q11 (resolved spike answers).
- [`SELECTORS.md`](./SELECTORS.md) — the testid contract between specs and the UI.
- `../fixtures/seed-shows-docs/docs-demo-show.json` — the Phase B
  enrichment payload.
