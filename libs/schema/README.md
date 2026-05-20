# Remote Falcon Schema (shared library)

The canonical MongoDB schema for the Remote Falcon platform. Defines the document/entity classes (`Show`, `Notification`, `Request`, `Stat`, etc.) and supporting enums consumed by **5 of the 8 backend services**.

| | |
|---|---|
| **Stack** | Maven, Java 17 |
| **Schema mappings** | Spring Data MongoDB **and** Quarkus Panache (dual-stack — parallel `documents/*.java` and `quarkus/entity/*.java` packages cover the same types) |
| **Consumed by** | [`apps/control-panel`](../../apps/control-panel), [`apps/external-api`](../../apps/external-api), [`apps/viewer`](../../apps/viewer), [`apps/plugins-api`](../../apps/plugins-api), [`apps/account-archive`](../../apps/account-archive) |

## Why it exists

Three of the eight production services run on Quarkus, two on Spring Boot, and they all share the same MongoDB collections. Without a shared schema module, each service would maintain its own copy of every document type — and the inevitable drift would show up at runtime as silent serialization bugs.

This module is the **single source of truth** for what a `Show` document looks like.

## Pre-monorepo distribution (historical)

Before the monorepo cutover, this module shipped as a JitPack artifact pinned at a git SHA:

```
com.github.Remote-Falcon:remote-falcon-library:a5703a28fe
```

Every consuming service pinned the same SHA in its `pom.xml` or `build.gradle`. There was **no contract test** guarding against drift; consumers agreed by accident, not by enforcement. Bumping the SHA in one service without the others was the most likely silent-breakage vector in the entire stack.

After the monorepo cutover, this module is consumed via local Maven module / `mavenLocal()` Gradle resolution instead. SHA pinning becomes structurally impossible — there is no SHA, only the current source tree.

## What's in here

- `documents/` — Spring Data `@Document` classes (used by control-panel, external-api)
- `quarkus/entity/` — Quarkus Panache entities (used by viewer, plugins-api, account-archive)
- `enums/` — `ShowRole`, `StatusResponse`, `LocationCheckMethod`, `NotificationType`, `ViewerControlMode`, etc.
- `models/` — value objects: `Request`, `Stat`, `Preference`, `NotificationPreference`, sequence-related types

The `documents/` and `quarkus/entity/` packages **describe the same Mongo collections** with two different mapping technologies. Field names, collection names, and indexes must stay in sync between them — drift between the two halves is the second most likely silent-breakage vector after JitPack drift.

## Testing

- **Today:** zero tests. No `src/test/`. No `.github/workflows/`. JitPack rebuilds on demand when a service resolves a new SHA.
- **Planned (Phase C5.1):** schema round-trip tests asserting that every type round-trips JSON ↔ BSON ↔ Spring Document ↔ Quarkus Panache cleanly. Locks down the highest-leverage untested code in the stack.

## Build

```bash
mvn -pl libs/schema clean install     # from the monorepo root, once Phase A2 wires multi-module Maven
```

Until Phase A2 lands, this module still builds with its own `pom.xml`:

```bash
mvn clean install
```

## Important note on changes

Because this schema is shared by 5 services, any change here ripples to all of them. Phase A2 makes that ripple **automatic** — every consumer in the monorepo recompiles against the new schema in a single PR, and CI catches mismatches immediately. **A breaking change to a field name or default in this module should never ship without confirming all 5 consumers compile and test green.**
