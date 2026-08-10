# Remote Falcon External API

The third-party / partner integration surface — a REST API that external systems use to read and act on show state. Authenticated by API key + JWT (HS256) rather than the user-facing JWT scheme.

**The public API is specified in [`openapi.yaml`](./openapi.yaml)** — that file is the source of truth and is published to [docs.remotefalcon.com/api](https://docs.remotefalcon.com/api/intro) via a sync script in the `remote-falcon-docusaurus` repo. If you add, remove, or change a `@RequiresAccess` mapping, update the spec in the same PR.

| | |
|---|---|
| **Stack** | Spring Boot 3, Java 21 GraalVM **native image** |
| **Container port** | 8080 |
| **Replicas** | 1 |
| **Ingress** | `remotefalcon.com`, paths `/remote-falcon-external-api(...)` **and** `/remotefalcon/api/external(...)` (rewrite-target) |
| **Health probe** | `GET /actuator/health` |
| **Talks to** | MongoDB |

## What it does

- Exposes a **REST surface** for partner integrations: `GET /showDetails` (preferences, sequences, live queue, live votes, currently-playing, next-up), plus `POST /addSequenceToQueue` and `POST /voteForSequence`, which proxy through to the viewer service.
- Validates partner JWTs signed with the show owner's `secretKey`, payload `{ accessToken: <show's accessToken> }`.
- Issues read access to the same `Show` documents the rest of the platform writes — same `libs/schema` types.
- Also hosts the **first-party RF Page Builder `/v1/**` routes** (sessions + viewer-page read/write). Those are bearer + scope authenticated, CORS-locked to `rfpagebuilder.com`, and deliberately **not** part of the public API or its published spec.

A working partner integration sample (PHP + jQuery) lives in the [`remote-falcon-issue-tracker`](https://github.com/Remote-Falcon/remote-falcon-issue-tracker) repo under `external-api-sample/`.

## API surface

- **Public REST** (see [`openapi.yaml`](./openapi.yaml)): `GET /showDetails`, `POST /addSequenceToQueue`, `POST /voteForSequence`
- **RFPB v1** (first-party, undocumented publicly): `/v1/sessions/**`, `/v1/pages/**`, `/v1/me`
- **Actuator**: `/remote-falcon-external-api/actuator/health`

Show owners obtain their `accessToken` and `secretKey` from the External API page in the control-panel UI. The partner signs a JWT (HS256, payload `{ accessToken }`) with the secret key and sends it as `Authorization: Bearer <jwt>`.

## Authentication

`AccessAspect` (an AOP `@Around` advice on `@RequiresAccess`) delegates to `AuthUtil`, which validates:
1. The `Authorization: Bearer` header is present and well-formed
2. The payload carries a non-empty `accessToken` claim
3. A show exists with that `apiAccess.apiAccessToken`
4. The JWT signature verifies against that show's `apiAccessSecret`

Any failure returns a bare `401` with no body — the API deliberately does not
say which check failed. `AuthUtil` stashes the resolved `showToken` in a
`ThreadLocal`; `AccessAspect` **must** clear it in a `finally` block, or a
reused Tomcat thread leaks it into the next request (the cross-tenant leak of
issue-tracker #149).

`DozerRuntimeHints` is the only guard against GraalVM native-image reflection breakage in this service — itself untested.

## In-cluster secrets

Single Secret `remote-falcon-external-api` with key `mongo-uri`. Unlike viewer/plugins-api/account-archive, this service uses **runtime env** for Mongo — no build-arg baking — so rotations don't require a rebuild.

## Local development

```bash
mvn spring-boot:run
```

Requires a Mongo instance. The workspace `dev-up.sh` provides one.

## Testing

170 `@Test` methods, gated at 75% line / 85% branch (JaCoCo, BUNDLE) — see [`docs/TESTING.md`](../../docs/TESTING.md).

Validate the OpenAPI spec with:

```bash
npx @redocly/cli lint apps/external-api/openapi.yaml
```

## Key directories

- `src/main/java/com/remotefalcon/external/api/controller/` — REST controllers (`ExternalApiController` = public; `SessionController` / `PagesController` = RFPB v1)
- `src/main/java/com/remotefalcon/external/api/service/` — request/vote proxying, page read/write, session issuance
- `src/main/java/com/remotefalcon/external/api/aop/` — `@RequiresAccess` / `@RequiresBearer` auth aspects
- `src/main/java/com/remotefalcon/external/api/configuration/` — CORS, rate limiting, security headers, `DozerRuntimeHints` (native-image reflection registration)
- `openapi.yaml` — public API spec, source of truth for docs.remotefalcon.com
