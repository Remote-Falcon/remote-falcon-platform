# Remote Falcon Control Panel

The authenticated REST + GraphQL API behind the show-owner control panel UI. Auth, account management, sequence configuration, page editing, third-party integrations, and platform-admin actions all live here.

| | |
|---|---|
| **Stack** | Spring Boot 3, Java 21, GraalVM **native image** |
| **Container port** | 8080 |
| **Replicas** | 1 |
| **Ingress** | `remotefalcon.com`, path prefix `/remote-falcon-control-panel` (proxy body size: 3 MB) |
| **Health probe** | `GET /remote-falcon-control-panel/actuator/health` |
| **Talks to** | MongoDB, GitHub (PAT), SendGrid, DigitalOcean Spaces (S3) |

## What it does

- **Auth surface** for the entire authenticated stack — JWT issuance, validation, role checks via `@RequiresAccess` and `@RequiresAdminAccess` AOP.
- **Account management** — signup, email verification, password reset, profile, role assignment.
- **Show configuration** — sequences, request/vote rules, viewer-page templates, geo-fencing, blocked IPs.
- **Page editor** — Monaco-based viewer-page customization; serves seeded templates from [page-templates](https://github.com/Remote-Falcon/remote-falcon-page-templates).
- **Integrations** — GitHub for code, SendGrid for email, S3 for asset uploads.
- **Platform admin** — GraphQL mutations gated by `@RequiresAdminAccess` (admin show-edit, impersonation, notifications). See [`controller/GraphQLController.java`](src/main/java/com/remotefalcon/controlpanel/controller/GraphQLController.java).

## API surface

- **REST**: `/remote-falcon-control-panel/...` for auth, account, file upload
- **GraphQL**: `/remote-falcon-control-panel/graphql` — queries + mutations for everything else
- **Actuator**: `/remote-falcon-control-panel/actuator/health`

## Auth model

Two layers:

1. **JWT** — signed using `jwt-user` secret; carries the user's email, roles, and active show
2. **`@RequiresAccess` / `@RequiresAdminAccess`** — method-level AOP that reads the JWT and gates GraphQL fields by role (`USER` or `ADMIN`). Defined in [`aop/`](src/main/java/com/remotefalcon/controlpanel/aop/).

## In-cluster Secrets

Single Secret `remote-falcon-control-panel` carries: `mongo-uri`, `github-pat`, `sendgrid-key`, `jwt-user`, `client-header`, `s3-endpoint`, `s3-accessKey`, `s3-secretKey`.

## Local development

```bash
mvn spring-boot:run
```

Requires a Mongo instance and (for full feature coverage) the third-party credentials above. The workspace `dev-up.sh` provides a Mongo container; third-party integrations no-op without their respective keys.

## Testing

- **Today:** zero active tests. 6 test files exist but every line is `//` commented out and references dead packages (`com.remotefalcon.api`, `PluginService`, etc.) from a previous refactor. ~4,000 lines of legacy noise.
- **Planned (Phase C):** delete the commented-out files (Phase C2.1), then add an end-to-end JWT test exercising `WebSecurityConfig` + `AuthUtil` + `@RequiresAccess` (Phase C3.3) — *highest-leverage missing test in the stack*.

## Key directories

- `src/main/java/com/remotefalcon/controlpanel/aop/` — `@RequiresAccess`, `@RequiresAdminAccess`, `AccessAspect`
- `src/main/java/com/remotefalcon/controlpanel/controller/` — REST + GraphQL entry points
- `src/main/java/com/remotefalcon/controlpanel/service/` — `GraphQLQueryService`, `GraphQLMutationService` (admin mutations live here)
- `src/main/java/com/remotefalcon/controlpanel/util/` — `AuthUtil` (JWT), `ClientUtil` (GitHub), `EmailUtil` (SendGrid)
- `src/main/java/com/remotefalcon/controlpanel/config/` — `WebSecurityConfig`
