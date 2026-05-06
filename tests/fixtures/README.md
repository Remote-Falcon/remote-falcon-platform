# Test Fixtures

Non-Java test data consumed by Playwright e2e specs and contract tests. Each
subdirectory has its own README with details.

| Directory | Consumed by | What's there |
|---|---|---|
| `seed-shows/` | `tests/e2e/global-setup.ts` | Mongo seed data loaded before Playwright runs. One Show per JSON file. |
| `plugin-requests/` | `tests/contract/PluginsApiContractTest.java` (Sprint 3) | Captured FPP plugin request/response payloads, organized by endpoint + plugin version. |

For Java-side test fixtures (`ShowFactory`, `JwtFactory`, `MongoSeed`), see
[`libs/test-fixtures/`](../../libs/test-fixtures/).
