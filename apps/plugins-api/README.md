[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=Remote-Falcon_remote-falcon-plugins-api)](https://sonarcloud.io/summary/new_code?id=Remote-Falcon_remote-falcon-plugins-api)

# Remote Falcon Plugins API

The API consumed by the **FPP plugin** that show owners install on their light-show controllers. Drives playlist sync, viewer control modes, vote tallying, and "what's playing" updates between the controller and the rest of the platform.

| | |
|---|---|
| **Stack** | Quarkus, Java 21 GraalVM **native image** |
| **Container port** | 8080 |
| **Replicas** | 1 (HPA: min 1, max 1, scale at 85% CPU) |
| **Ingress** | `remotefalcon.com`, path prefixes `/remote-falcon-plugins-api(...)` **and** `/remotefalcon/api(...)` (rewrite-target) |
| **Health probe** | `GET /q/health{,/live,/ready}` |
| **Talks to** | MongoDB |
| **Observability** | OTLP/gRPC to the cluster-local OTel Collector (`OTEL_URI`); Prometheus `ServiceMonitor` exposes `/q/metrics` |

## What it does

- **Sync** the plugin's local playlists and PSA sequences into the platform (`syncPlaylists`)
- **Queue management** — next playlist in queue, highest-voted playlist, queue purge, vote reset
- **State updates** — what's currently playing, next scheduled sequence
- **Viewer-control mode** — read and toggle who controls the show (jukebox vs. voting vs. owner)
- **Plugin telemetry** — version reporting, FPP heartbeat
- **Preferences** — the plugin pulls remote config that show owners set in the control panel

## Authentication

Every request must carry one of:
- `showtoken: <token>` (header)
- `remotetoken: <token>` (header)

Validated against the `Show` collection in MongoDB. See [`filter/ShowTokenFilter.java`](src/main/java/com/remotefalcon/plugins/api/filter/ShowTokenFilter.java).

## API surface (high-level)

REST endpoints under root `/`:

| Endpoint | Purpose |
|---|---|
| `GET /nextPlaylistInQueue` | Next playlist + index |
| `POST /syncPlaylists` | Sync available playlists + PSAs |
| `POST /updatePlaylistQueue` | Update queue state |
| `POST /updateWhatsPlaying` | Update current sequence + manage PSAs |
| `POST /updateNextScheduledSequence` | Update next scheduled |
| `GET /viewerControlMode` | Current control mode |
| `GET /highestVotedPlaylist` | Highest-voted playlist |
| `POST /toggleViewerControl`, `POST /updateViewerControl` | Control-mode changes |
| `POST /updateManagedPsa` | Managed PSA settings |
| `GET /remotePreferences` | Show preferences |
| `DELETE /purgeQueue`, `DELETE /resetAllVotes` | Queue/vote reset |
| `POST /pluginVersion`, `POST /fppHeartbeat` | Plugin telemetry |
| `GET /actuator/health` | Liveness |

Models live in `src/main/java/com/remotefalcon/plugins/api/model/` plus shared types from [`libs/schema`](../../libs/schema).

## Wire contract risk

**This is the only un-version-pinned wire contract in production.** Customers run whatever version of [`remote-falcon-plugin`](https://github.com/Remote-Falcon/remote-falcon-plugin) they last installed; this service must keep accepting requests from all of them. There is no plugin-version pinning on the API side. A captured-fixture contract suite in [`tests/contract/`](../../tests/contract) replays real plugin-version requests against the running `plugins-api` — see [`docs/TESTING.md`](../../docs/TESTING.md). Pact remains a possible upgrade path if plugin-side instrumentation ever becomes feasible.

## Local development

```bash
./gradlew quarkusDev    # http://localhost:8080

# With a real show token
curl -H "showtoken: <YOUR_TOKEN>" http://localhost:8080/remotePreferences
```

Requires a Mongo instance reachable via `MONGO_URI`. The workspace `dev-up.sh` provides a Mongo container.

## Testing

- **Active tests:** 4 test classes, **58 `@Test` methods** — every named REST endpoint has at least a happy-path test, plus a Mongo testcontainers integration suite
- **Gaps:** `ShowTokenFilter` (the only authn boundary, 63 LOC) has no dedicated test — only indirectly hit via integration. The 789-LOC `PluginService` has 23 service-layer tests; error/boundary branches likely under-tested.

## Key directories

- `src/main/java/com/remotefalcon/plugins/api/controller/` — REST endpoints
- `src/main/java/com/remotefalcon/plugins/api/service/` — `PluginService` (core business logic)
- `src/main/java/com/remotefalcon/plugins/api/filter/` — `ShowTokenFilter` (auth)
- `src/main/java/com/remotefalcon/plugins/api/model/` — request/response DTOs
