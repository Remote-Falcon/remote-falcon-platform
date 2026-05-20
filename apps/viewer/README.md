[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=Remote-Falcon_remote-falcon-viewer)](https://sonarcloud.io/summary/new_code?id=Remote-Falcon_remote-falcon-viewer)

# Remote Falcon Viewer

The public-facing API behind every show's viewer page. Handles current/next sequence lookups, request and vote submissions, viewer-page statistics, geo-fencing, and IP-block enforcement.

This is the **highest-traffic service in the stack.**

| | |
|---|---|
| **Stack** | Quarkus + SmallRye GraphQL + RESTEasy, Java 21 GraalVM **native image** |
| **Container port** | 8080 |
| **Replicas** | 1 (HPA: min 1, max 1, scale at 85% CPU — effectively pinned today) |
| **Ingress** | `remotefalcon.com`, path prefix `/remote-falcon-viewer` (forwarded headers enabled for client-IP) |
| **Health probe** | `GET /remote-falcon-viewer/q/health{,/live,/ready}` |
| **Talks to** | MongoDB |
| **Observability** | OTLP/gRPC to the cluster-local OTel Collector (`OTEL_URI`); Prometheus `ServiceMonitor` exposes `/remote-falcon-viewer/q/metrics` |

## What it does

- **Lookups:** current playing sequence, next sequence, full show config (`getShow`), active viewer-page HTML
- **Requests:** lets viewers add a sequence (or an entire sequence group) to the jukebox queue
- **Votes:** tallies viewer votes for sequences
- **Validation:** request limits per IP, blocked-IP rejection, geo-fencing, queue-depth caps, sequence-group expansion
- **Statistics:** records page views, active viewer counts, jukebox metrics

Client IP is read from proxy headers in this priority order: `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, then connection remote address (see [`util/ClientUtil.java`](src/main/java/com/remotefalcon/util/ClientUtil.java)).

## API surface

All paths are under root `/remote-falcon-viewer`.

### REST

- `POST /addSequenceToQueue` — body `{ showSubdomain, sequence, viewerLatitude?, viewerLongitude? }` → `{ message? }`
- `POST /voteForSequence` — body `{ showSubdomain, sequence, viewerLatitude?, viewerLongitude? }` → `{ message? }`

### GraphQL — `POST /graphql`

**Queries:**
- `getShow(showSubdomain)`
- `getActiveViewerPage(showSubdomain)`

**Mutations:**
- `insertViewerPageStats`, `updateActiveViewers`
- `updatePlayingNow`, `updatePlayingNext`
- `addSequenceToQueue`, `voteForSequence`

In dev mode, the schema explorer lives at `http://localhost:8080/q/dev/`.

## Local development

```bash
./gradlew quarkusDev    # http://localhost:8080
```

Requires a Mongo instance reachable via `MONGO_URI` (or `quarkus.mongodb.connection-string`). The workspace `dev-up.sh` provides a Mongo container.

## Testing

- **Active tests:** 9 test classes, **88 `@Test` methods** — REST + GraphQL + 3 Mongo testcontainers integration tests
- **Coverage:** JaCoCo configured but no thresholds enforced — coverage can regress silently
- **Gaps:** `CustomGraphQLExceptionResolver`, `ViewerMetrics`, OpenTelemetry instrumentation, GraalVM reflection correctness, **load testing** (the highest-traffic service has no perf baseline)

## Key directories

- `src/main/java/com/remotefalcon/controller/` — `RestController`, `GraphQLController`
- `src/main/java/com/remotefalcon/service/` — `GraphQLQueryService`, `GraphQLMutationService` (core business logic, validation, sequence-group expansion)
- `src/main/java/com/remotefalcon/repository/` — `ShowRepository` with atomic position counters and batch-append patterns to reduce Mongo contention
- `src/main/java/com/remotefalcon/util/` — `ClientUtil` (IP extraction), `LocationUtil` (geo distance)
