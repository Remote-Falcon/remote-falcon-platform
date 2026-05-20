# Remote Falcon Account Archive

Scheduled cleanup service that **archives stale show accounts** out of the live database, and **deletes unverified signups** that never confirmed their email. Two separate `@Scheduled` jobs in one service.

| | |
|---|---|
| **Stack** | Quarkus, Java 21 GraalVM **native image** |
| **Container port** | 8080 |
| **Replicas** | 1 |
| **Ingress** | none — internal `ClusterIP` Service only |
| **Health probe** | `GET /remote-falcon-account-archive/q/health{,/live,/ready}` |
| **Talks to** | MongoDB |

## What it does

Two `@Scheduled(every = "24h")` jobs in [`AccountArchiveService.java`](src/main/java/com/remotefalcon/service/AccountArchiveService.java):

### 1. `archiveAccounts()`
- Finds shows where `lastLoginDate < now - 24 months` **OR `lastLoginDate is null`**
- For each match: serializes the `Show` document to JSON, inserts it into a separate Mongo database `remote-falcon-archive` → collection `show`, and **only if the insert is acknowledged**, deletes the original from the live `remote-falcon` database
- Copy-then-delete archive, not a soft-delete

### 2. `deleteUnverifiedShows()`
- Finds shows where `emailVerified = false AND createdDate < now - 7 days`
- **Hard-deletes** them — no archive copy
- Cleans up signups that never confirmed their email

Both run on a 24h tick from process-start time (Quarkus `@Scheduled` uses elapsed-time scheduling, not cron-aligned), and both run on every pod restart.

## Why this service needs careful testing

This service **deletes customer data**. The cutoff predicate is one line:

```java
list("lastLoginDate < ?1 or lastLoginDate is null", LocalDate.now().minusMonths(24).atStartOfDay())
```

Any show document missing the `lastLoginDate` field — including freshly-migrated accounts or future schema variants — matches the archive criterion. The 7-day unverified filter is the only thing protecting brand-new signups from getting swept by the 24-month archive query the moment they hit the DB.

Covered by Mockito tests in `src/test/` — cutoff predicate, "don't archive recent activity," and empty-result handling. See [`docs/TESTING.md`](../../docs/TESTING.md).

## Configuration

- `MONGO_URI` — connection string (no build-arg baking on this service; runtime env via Secret `mongodb-connection`)
- `OTEL_URI` — OTLP endpoint
- `quarkus.mongodb.database` — `remote-falcon` (archive target hardcoded as `remote-falcon-archive`)

## Local development

```bash
./gradlew quarkusDev    # http://localhost:8080
```

Requires a Mongo instance. The workspace `dev-up.sh` provides one. The schedulers will start ticking immediately — be careful pointing this at any database with real data.

## Key files

- `src/main/java/com/remotefalcon/service/AccountArchiveService.java` — both scheduled jobs (~80 LOC)
- `src/main/java/com/remotefalcon/repository/ShowRepository.java` — the cutoff queries
