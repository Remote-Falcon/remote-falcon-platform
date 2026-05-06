# Contract Tests

Tests that verify wire-protocol contracts between Remote Falcon services and
external consumers (FPP plugin, future integrations).

## Sprint 1 status

This module exists as scaffolding. The `PluginsApiPlaceholderTest` is a stub.
Sprint 3 (per [PHASE-C-KICKOFF.md § 9](../../docs/PHASE-C-KICKOFF.md)) replaces
it with real captured-fixture replay tests.

## Layout

```
tests/contract/
├── pom.xml
├── README.md (this file)
└── src/test/java/com/remotefalcon/contract/
    └── PluginsApiPlaceholderTest.java   # Sprint 1 stub
    # Sprint 3: PluginsApiContractTest.java
```

## Running

From monorepo root: `mvn -pl tests/contract -am test`

## What it tests (Sprint 3)

For each captured fixture in `tests/fixtures/plugin-requests/<endpoint>/<version>-request.json`,
replay against the running testcontainers plugins-api and assert response matches
`<endpoint>/<version>-response.json`. Catches the "I bumped plugins-api and
broke older plugin versions" failure mode.
