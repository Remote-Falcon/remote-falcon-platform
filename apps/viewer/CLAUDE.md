# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Remote Falcon Viewer is a Quarkus-based backend service that powers the viewer-facing APIs for Remote Falcon light shows. It provides both REST and GraphQL endpoints for viewers to interact with shows, including requesting sequences, voting, and tracking viewer activity. The service uses MongoDB for persistence and is designed to be deployed as a GraalVM native image for optimal performance.

## Technology Stack

- **Framework**: Quarkus 3.17.7 (Java 21)
- **API**: SmallRye GraphQL + RESTEasy
- **Database**: MongoDB (via Quarkus MongoDB Panache)
- **Build Tool**: Gradle with Gradle wrapper
- **Testing**: JUnit 5, REST Assured, Mockito
- **Code Coverage**: JaCoCo
- **Observability**: OpenTelemetry (OTLP metrics/traces)
- **Native Compilation**: GraalVM native-image
- **Code Quality**: SonarCloud integration

## Development Commands

### Running the Application
```bash
./gradlew quarkusDev    # Start in dev mode with live reload on port 8080
                        # Dev UI available at http://localhost:8080/q/dev/
```

### Testing
```bash
./gradlew test                    # Run all unit tests
./gradlew test jacocoTestReport   # Run tests and generate coverage report
                                  # Report: build/reports/jacoco/test/html/index.html
```

### Building
```bash
./gradlew clean build             # Build JVM JAR (fast-jar in build/quarkus-app/)
./gradlew build -Dquarkus.package.jar.type=uber-jar  # Build uber-jar

# Native image (requires GraalVM)
./gradlew build -Dquarkus.native.enabled=true
./gradlew build -Dquarkus.native.enabled=true -Dquarkus.native.container-build=true
```

### Code Quality
```bash
./gradlew sonar    # Run SonarCloud analysis (requires SONAR_TOKEN env var)
```

## Architecture

### Package Structure

```
com.remotefalcon/
├── controller/        # REST and GraphQL endpoints
│   ├── GraphQLController.java    # GraphQL queries & mutations
│   └── RestController.java       # REST endpoints for addSequenceToQueue, voteForSequence
├── service/
│   ├── GraphQLQueryService.java       # Query business logic
│   └── GraphQLMutationService.java    # Mutation business logic
├── repository/
│   └── ShowRepository.java       # MongoDB repository using Panache
├── util/
│   ├── ClientUtil.java          # Client IP extraction from proxy headers
│   └── LocationUtil.java        # Geo-location utilities
├── request/          # REST request DTOs
├── response/         # REST response DTOs
└── exception/
    └── CustomGraphQLExceptionResolver.java  # GraphQL error handling
```

### API Endpoints

**Base Path**: `/remote-falcon-viewer` (configured in `application.properties`)

#### REST Endpoints

1. **POST** `/remote-falcon-viewer/addSequenceToQueue`
   - Request: `{ showSubdomain, sequence, viewerLatitude?, viewerLongitude? }`
   - Response: `{ message? }` (empty message on success)
   - Adds a sequence to the jukebox queue with validation

2. **POST** `/remote-falcon-viewer/voteForSequence`
   - Request: `{ showSubdomain, sequence, viewerLatitude?, viewerLongitude? }`
   - Response: `{ message? }` (empty message on success)
   - Records a vote for a sequence with validation

#### GraphQL Endpoint

**POST** `/remote-falcon-viewer/graphql`

**Queries:**
- `getShow(showSubdomain: String): Show` - Get show details
- `getActiveViewerPage(showSubdomain: String): String` - Get active viewer page HTML

**Mutations:**
- `insertViewerPageStats(showSubdomain: String, date: DateTime): Boolean` - Track page views
- `updateActiveViewers(showSubdomain: String): Boolean` - Update active viewer count
- `updatePlayingNow(showSubdomain: String, playingNow: String): Boolean` - Update currently playing sequence
- `updatePlayingNext(showSubdomain: String, playingNext: String): Boolean` - Update next sequence
- `addSequenceToQueue(showSubdomain: String, name: String, latitude: Float, longitude: Float): Boolean` - Queue sequence
- `voteForSequence(showSubdomain: String, name: String, latitude: Float, longitude: Float): Boolean` - Vote for sequence

**GraphQL Dev UI**: Available in dev mode at `http://localhost:8080/q/dev/` for schema exploration and testing.

### Key Components

#### ShowRepository
MongoDB repository using Quarkus Panache. Key methods:
- `findByShowSubdomain(String)` - Find show by subdomain
- `nextRequestPosition(String)` - Atomic counter for request positions
- `allocatePositionBlock(String, int)` - Allocate multiple positions atomically (reduces DB contention)
- `appendRequest()` / `appendJukeboxStat()` - Append to arrays using MongoDB `$push`
- `appendMultipleRequestsAndJukeboxStat()` - Batch append for sequence groups

#### ClientUtil
Extracts client IP from proxy headers in this order:
1. `CF-Connecting-IP` (Cloudflare)
2. `X-Forwarded-For` (standard reverse proxy)
3. `X-Real-IP` (Nginx/Heroku)
4. `Forwarded` (RFC 7239)
5. `remoteAddress()` (fallback for local testing)

#### GraphQLMutationService
Contains core business logic for:
- Validation (IP presence, blocked IPs, request limits, geo-fencing)
- Request queue management
- Voting logic
- Sequence groups (automatically expands into individual sequences)
- Statistics tracking

Uses injected `RoutingContext` to access HTTP context for IP extraction.

### Database (MongoDB)

- **Database**: `remote-falcon`
- **Collection**: `Show` (via Panache entity from `remote-falcon-library`)
- **Connection**: Configured via `quarkus.mongodb.connection-string` property or `MONGO_URI` env var

### Shared Library

Uses `remote-falcon-library` (from JitPack) for shared models:
- `Show` entity
- Enums: `StatusResponse`, `LocationCheckMethod`
- Models: `Request`, `Stat`, sequence-related models

**Important**: The library is indexed for Quarkus native compilation via `quarkus.index-dependency.remote-falcon-library.*` in `application.properties`.

## Configuration

### application.properties

Key properties:
- `quarkus.http.root-path=/remote-falcon-viewer` - Base path for all endpoints
- `quarkus.http.port=8080` - HTTP port
- `quarkus.http.proxy.*` - Proxy header support (allow-forwarded, proxy-address-forwarding, etc.)
- `quarkus.mongodb.database=remote-falcon` - MongoDB database name
- `quarkus.http.cors=true` - CORS enabled for all origins/methods/headers
- `quarkus.package.jar.enabled=true` - Enable JAR packaging (local dev)
- `quarkus.native.builder-image=graalvm` - Native build uses GraalVM container

### Environment Variables

- `MONGO_URI` - MongoDB connection string (e.g., `mongodb://user:pass@host:27017/remote-falcon?authSource=admin`)
- `OTEL_URI` - OpenTelemetry collector endpoint (e.g., `http://otel-collector:4317`)

**Note**: `.env` file in repo is for local development only and should NOT be committed with real credentials.

## Testing

### Unit Tests

All services have corresponding unit test classes in `src/test/java`:
- `GraphQLControllerTest` - Tests GraphQL controller delegation
- `RestControllerTest` - Tests REST endpoint behavior
- `GraphQLMutationServiceTest` - Tests mutation business logic with mocks
- `GraphQLQueryServiceTest` - Tests query business logic with mocks
- `ClientUtilTest` - Tests client IP extraction logic
- `LocationUtilTest` - Tests geo-location calculations

Unit tests use JUnit 5, Quarkus test framework, and Mockito for mocking dependencies.

### Integration Tests

End-to-end integration tests verify the complete flow from API to database:
- `AddSequenceToQueueIntegrationTest` - Full E2E testing of the addSequenceToQueue mutation including:
  - Successful sequence addition with database persistence verification
  - Queue full validation
  - Already requested validation
  - Blocked IP validation
  - Invalid location (geo-fencing) validation
  - Sequence group expansion
  - Concurrent request ordering

Integration tests use **Testcontainers** to automatically provision a MongoDB instance in Docker:
- No local MongoDB installation required
- Tests automatically clean up data before and after each test
- Container is reused between test runs for faster execution (local development)
- Uses MongoDB 7.0 Docker image

**Requirements**: Docker must be running on the machine executing tests (locally or in CI/CD).

**CI/CD Support**: Integration tests work out-of-the-box in GitHub Actions with `ubuntu-latest` runners, which have Docker pre-installed. The `.testcontainers.properties` file ensures proper configuration.

To run all tests including integration tests:
```bash
./gradlew test
```

To run only unit tests (skip integration tests):
```bash
./gradlew test --tests '*Test' --tests '!*IntegrationTest'
```

To run only integration tests:
```bash
./gradlew test --tests '*IntegrationTest'
```

### Test Configuration

Test-specific configuration is in `src/test/resources/application-test.properties`:
- Uses separate test database (`remote-falcon-test`)
- MongoDB connection provided dynamically by `MongoTestResource` (Testcontainers)
- Runs on port 8081 to avoid conflicts with dev instance
- OpenTelemetry disabled for faster test execution
- Debug logging enabled for troubleshooting
- Container reuse enabled for faster test execution

### Coverage Reports

Coverage reports are generated automatically after tests via JaCoCo:
```bash
./gradlew test jacocoTestReport
# Report: build/reports/jacoco/test/html/index.html
```

## Docker & Deployment

### Dockerfile

Multi-stage build for GraalVM native image:
1. **Build stage**: Uses `container-registry.oracle.com/graalvm/native-image:21`
   - Runs `./gradlew clean build -x test` with native enabled and JAR disabled
   - **Tests are skipped** (`-x test`) because they run in the `sonar-analysis` job first
   - Integration tests cannot run inside Docker build (would require Docker-in-Docker)
   - Passes `MONGO_URI` as a build arg (`OTEL_URI` is runtime-only now — set via k8s env from the cluster's collector service)
2. **Runtime stage**: Uses `registry.access.redhat.com/ubi9/ubi-minimal:9.2`
   - Copies native binary from build stage
   - Runs as non-root user (1001)
   - Exposes port 8080

**Important**:
- When building native images, you MUST pass `-Dquarkus.package.jar.enabled=false` to avoid the error: "Outputting both native and JAR packages is not currently supported."
- Tests are skipped during Docker build with `-x test` since they already run in the CI pipeline before the Docker build.

### Building Docker Image
```bash
docker build \
  --build-arg MONGO_URI="mongodb://user:pass@host:27017/remote-falcon?authSource=admin" \
  -t remotefalcon/remote-falcon-viewer:latest .
```

### Running Docker Container
```bash
docker run -p 8080:8080 \
  -e MONGO_URI="mongodb://user:pass@host:27017/remote-falcon?authSource=admin" \
  -e OTEL_URI="http://otel-collector:4317" \
  remotefalcon/remote-falcon-viewer:latest
```

### Kubernetes

Manifests available in `k8s/`:
- `manifest.yml` - Production deployment
- `manifest-local.yml` - Local development deployment

Key configurations:
- **Port**: 8080 (container and service)
- **Health checks**: Startup, liveness, and readiness probes on `/health.json`
- **Ingress**: Respects `/remote-falcon-viewer` root path
- **Image pull secret**: `remote-falcon-ghcr` (for GitHub Container Registry)
- **Resources**: Define requests/limits for memory and CPU

## Important Patterns

### Request Position Management

The service uses an atomic counter (`requestPositionCursor`) to assign positions to jukebox requests:
- `nextRequestPosition()` - Single position (legacy)
- `allocatePositionBlock(count)` - Batch allocation for sequence groups (reduces DB contention)

### Sequence Groups

When a viewer requests a "sequence group", the service:
1. Expands the group into individual sequences
2. Allocates a block of positions atomically
3. Creates multiple `Request` objects with sequential positions
4. Appends all requests + stat in a single MongoDB update

### Error Handling

GraphQL mutations throw `CustomGraphQLExceptionResolver` with status codes from `StatusResponse` enum:
- `UNEXPECTED_ERROR`
- `SHOW_NOT_FOUND`
- `IP_NOT_PRESENT`
- `IP_BLOCKED`
- `REQUEST_LIMIT_EXCEEDED`
- `OUTSIDE_GEOFENCE`
- etc.

REST endpoints catch these exceptions and convert them to `RequestVoteResponse` with error messages.

### IP-Based Validation

All viewer actions (requests, votes, page stats) are IP-tracked:
- IP is extracted via `ClientUtil.getClientIP()`
- Duplicate actions from same IP are prevented (within time windows)
- Blocked IPs are rejected
- Geo-fencing rules are enforced (if enabled)

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- Build and test on push/PR
- SonarCloud quality gate checks
- Native image builds for releases

Quality gate status: [![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=Remote-Falcon_remote-falcon-viewer)](https://sonarcloud.io/summary/new_code?id=Remote-Falcon_remote-falcon-viewer)

## Troubleshooting

### "Outputting both native and JAR packages is not currently supported"
**Cause**: Building native with `quarkus.package.jar.enabled=true`.
**Fix**: Pass `-Dquarkus.package.jar.enabled=false` when building native images. The Dockerfile does this automatically.

### GraphQL schema not visible
**Solution**: Run in dev mode (`./gradlew quarkusDev`) and open Dev UI at `http://localhost:8080/q/dev/`.

### CORS issues
**Check**: CORS is enabled for all origins. If issues persist, verify proxy configuration and that requests reach the service.

### Client IP not detected correctly
**Check**: Ensure proxy headers (`CF-Connecting-IP`, `X-Forwarded-For`, etc.) are being forwarded to the service. Review proxy configuration in `application.properties`.
