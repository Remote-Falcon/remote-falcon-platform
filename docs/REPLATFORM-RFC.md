# RFC: Remote Falcon Replatform ("RF Next")

**Status:** Draft. Decisions below reflect the owner's answers of 2026-11-22. Items marked **Recommended** are open until ratified.
**Owner:** Matt Shorts
**Created:** 2026-11-22
**Earliest runtime work:** Mon 2027-01-05 (off-season profile). Nothing in this RFC touches production before then.
**Related:** [SERVICES.md](SERVICES.md), [SELF-HOST.md](SELF-HOST.md), [PHASE-C-KICKOFF.md](PHASE-C-KICKOFF.md), [TESTING.md](TESTING.md), [`tests/contract/`](../tests/contract/), RF Page Builder repo (`mshorts/rf-page-builder`)

This is a design and planning document. It contains no implementation code.

---

## 0. Summary

| Area | Decision / recommendation |
|---|---|
| Strategy | **Recommended:** build a new platform ("RF Next") next to the existing one, in this monorepo, and move shows to it in batches. An edge **show directory** routes each show to whichever platform owns it. Section 4 compares this with an in-place strangler. |
| Backend shape | **Recommended:** one Spring Boot 3 / Java 21 **modular monolith** (`apps/core`), deployable as one process (self-host) or as several role-scoped replicas of the same image (SaaS). Quarkus is retired. |
| Datastore | **Decided:** PostgreSQL is the only datastore. It holds platform data and the absorbed RFPB data (guestbook, billing). Mongo is retired after the last show moves. |
| Auth | **Recommended:** Remote Falcon's own accounts are the single identity (email + password + existing TOTP MFA), delivered as an httpOnly session cookie. Clerk is dropped. OIDC login is an optional later add-on. |
| RF Page Builder | **Decided direction:** the editor becomes a native route in the control-panel SPA. `/api/rf/*` and the launch-JWT handoff are removed in native mode. Premium templates and guestbook stay paid; billing moves into the platform. |
| FPP plugin | **Decided direction:** today's plugins-api REST surface is frozen as a compatibility layer, gated by expanded contract tests and old/new differential replay. A versioned `/plugin/v2` is optional and comes later. |
| Self-host | **Decided:** one `docker compose` with three containers (core, postgres, proxy). SaaS-only features (billing, premium template purchase, guestbook) may be left out. |
| Timeline | Off-season 2027 (Jan 5 to the season-prep freeze). There is a go/no-go gate on Aug 15, 2027: shows not yet moved stay on legacy for the 2027 season. |

---

## 1. Context and problems

### 1.1 Current state (verified in this repo)

- **7 production services** on one DOKS cluster ([SERVICES.md](SERVICES.md)): `ui` (Vite/React 18, MUI, JSX), `control-panel` (Spring Boot 3, native image), `viewer` (Quarkus), `plugins-api` (Quarkus), `external-api` (Spring Boot, includes the RFPB `/v1/**` surface), `mongo-backup`, `account-archive`.
- **Two persistence stacks over one database.** `libs/schema` maps the same collections twice: Spring Data `documents/*` and Quarkus Panache `quarkus/entity/*`. Drift between the two is a known silent-breakage vector.
- **One Mongo document per show.** `show` embeds `sequences`, `sequenceGroups`, `categories`, `psaSequences`, `pages`, `stats`, `requests`, `votes`, `activeViewers`, `viewerSessions`, `heartbeatGaps`, `versionChanges`, `showNotifications`, `mfa`, and more. Every read and write moves the whole array set. The nightly `DOC_SIZE_ALARM` exists because documents approach the 16 MB cap (whale-votes incident, 2026-08-22).
- **One small, single-node Mongo** (`db-s-1vcpu-1gb`, no standby). The viewer and plugins-api HPAs are capped at 4 pods by the Mongo connection budget ([runbooks/mongo-saturated.md](runbooks/mongo-saturated.md)).
- **Native images bake `MONGO_URI` in at build time** (viewer, plugins-api), so rotating credentials requires a rebuild.
- **The 8→5 service merge** (`apps/jobs`, `apps/realtime`, `apps/api`) is the next planned consolidation. This RFC replaces it: merging services is folded into building `apps/core`.

### 1.2 RF Page Builder today (verified in `mshorts/rf-page-builder`)

- Next.js 16 / React 19 / TypeScript / Tailwind / Zustand / dnd-kit, hosted on Vercel, with Neon Postgres via Drizzle and Clerk auth.
- **Postgres tables:** `guestbook_sites`, `guestbook_entries`, `admin_audit_log`, `rf_launch_jtis`. That is all of them. The **template gallery is not in Postgres**: free and premium templates are TypeScript modules in `lib/templates/` (and `lib/templates/premium/`).
- **Premium templates** are unlocked by Lemon Squeezy **license keys** (`lib/premium/license-validation.ts`, `product-map.ts`), checked client-side at export (`isExportGated`).
- **Guestbook** is a paid Lemon Squeezy **subscription** (`guestbook_sites.lemon_squeezy_subscription_id`), with webhooks (`/api/webhooks/lemon-squeezy`), a reconcile cron, public submit/img/thanks endpoints, and admin moderation.
- **RF integration:** control-panel `LaunchExternalEditorService` mints a 300 s HS256 launch JWT (`libs/auth` `LaunchTokenSigner`). RFPB `/launch` verifies it, enforces single-use JTI in Postgres, and exchanges it at external-api `POST /v1/sessions/exchange` for a 30-minute bearer. RFPB then calls `/v1/pages` through its own `/api/rf/{hydrate,publish,pull,disconnect,session/refresh}` proxy routes.
- **Constraints that matter for absorption:** `lib/export` is client-only. `/api/import` runs **cheerio on the server** to convert foreign HTML into blocks. The RF `PUT /v1/pages` path runs the sanitizer and the 1 MB cap server-side in Java.

### 1.3 FPP plugin wire contract (verified in `apps/plugins-api`)

- Paths: `/remote-falcon-plugins-api/*` and `/remotefalcon/api/*` (ingress rewrite).
- Auth: `showtoken` header, with `remotetoken` as a fallback (`ShowTokenFilter`).
- Endpoints: `GET nextPlaylistInQueue` (**mutating** when `updateQueue=true`), `POST updatePlaylistQueue`, `syncPlaylists`, `updateWhatsPlaying`, `updateNextScheduledSequence`, `GET viewerControlMode`, `highestVotedPlaylist`, `POST pluginVersion`, `GET remotePreferences`, `DELETE purgeQueue`, `resetAllVotes`, `POST toggleViewerControl`, `updateViewerControl`, `updateManagedPsa`, `fppHeartbeat`, `GET viewerPages`, `POST setActiveViewerPage`, `GET actuator/health`.
- **Contract test coverage gap:** `PluginsApiContractTest` checks only the **request bodies** of 7 POST endpoints (key sets and round-trip). It does not cover response bodies, status codes, the GET/DELETE endpoints, header auth behavior, error shapes, or the mutating-GET semantics.

### 1.4 Other unversioned contracts this replatform must preserve

The FPP plugin is the headline contract, but these also run outside the cluster and break silently:

- **Viewer page HTML template language:** tokens (`{PLAYLISTS}`, `{NOW_PLAYING}`, `{JUKEBOX_QUEUE}`, ...), dynamic containers (`{jukebox-dynamic-container}`, ...), status-message IDs and CSS classes. These are used by every stored page, the `remote-falcon-page-templates` repo, and RFPB exports.
- **Viewer GraphQL** as used by the SPA viewer runtime and `remote-falcon-viewer-page-js` CDN scripts.
- **external-api GraphQL** (partner integrations, `remote-falcon-mcp`) and `/v1/**` (standalone RFPB, during its deprecation window).
- **Public URLs:** `remotefalcon.com`, `<subdomain>.remotefalcon.com`, path-routed self-host mode.

---

## 2. Goals and non-goals

**Goals**
1. One backend codebase and one persistence layer (Postgres). No dual Spring/Quarkus mappings.
2. RF Page Builder is a native part of the control panel: one login, one deploy, no launch-JWT handoff.
3. Every existing FPP plugin version keeps working with no operator action.
4. Shows move with near-zero downtime, can be rolled back per show, and are never written by both platforms at once.
5. Self-host is one `docker compose up` with three containers.
6. No runtime risk during the 2026 season or the Dec 18–26 freeze.

**Non-goals**
- Changing viewer-page template syntax, or making operators edit their pages.
- Forcing a plugin upgrade.
- Multi-region or HA beyond what the managed Postgres offering gives us.
- Rewriting the Java domain rules (queue, voting, PSA cadence, anti-consecutive, nightly play cap, geofence/IP rules). They are ported, not redesigned.

---

## 3. Target architecture

### 3.1 Backend shape: options

| | **A. Java modular monolith** (Recommended) | B. TypeScript full-stack monolith | C. Keep microservices, port each to Postgres |
|---|---|---|---|
| Summary | Spring Boot 3 / Java 21 `apps/core` with internal modules. One image, run in role profiles. | Node (e.g. Fastify/NestJS or Next.js) plus Postgres. Absorbs the RFPB server code as-is and ports the Java domain to TS. | Same 5 or 7 services, each moved from Mongo to Postgres. |
| Domain logic reuse | High. Viewer rule chain, PSA/queue logic, MFA, notifications and schedulers move with mechanical changes. | Low. Every rule and its tests are rewritten. | High. |
| RFPB reuse | Editor (client) reused fully. Server routes are small and mostly disappear (§5). Guestbook and billing are ported to Java. | Full. | Same as A. |
| Ops for one maintainer | One artifact, one schema, one CI path. | One artifact. Adds a second language to the domain during the transition. | Unchanged complexity. Keeps the Mongo-era fan-out. |
| Self-host footprint | 1 JVM container (~400–600 MB). | 1 Node container (~200–300 MB). | 4–5 containers. |
| Risk | Medium | High (rewrite of the rules most likely to break show nights) | Medium, with little payoff |

**Recommendation: A.** The domain rules that decide what plays on show night are the riskiest code to rewrite, and their tests are Java. The RFPB server surface that A cannot reuse is small: guestbook, billing webhooks, and import. B is the right call only if you want to leave Java long-term; see Open Question Q-1.

### 3.2 Module layout (Option A)

```
apps/core                      Spring Boot 3, Java 21
  module identity              accounts, sessions, MFA, password reset, email verification
  module show                  show settings, sequences, groups, categories, PSA, preferences
  module viewer-runtime        public viewer reads, request/vote rule chain, artwork, page render
  module plugin-compat         frozen FPP REST contract (§6). Thin adapter onto show/queue services
  module queue                 jukebox queue, votes, leader computation, nightly caps
  module pages                 viewer pages CRUD, sanitizer, 1 MB cap, editor document storage
  module editor-assets         template catalog, premium entitlement checks
  module guestbook             (SaaS feature flag) sites, entries, moderation, public endpoints
  module billing               (SaaS feature flag) Lemon Squeezy webhooks, entitlements, reconcile
  module notifications         bell, FPP-health alerts, email (SendGrid optional)
  module jobs                  schedulers (ShedLock on Postgres), retention, archive, backups hook
  module external-api          partner GraphQL + /v1 (deprecated surface, kept for a window)
apps/ui                        React SPA (control panel + viewer runtime + native editor)
libs/page-editor               the RFPB editor as a TS package consumed by apps/ui
```

- Module boundaries are enforced in CI (Spring Modulith or ArchUnit): no cross-module repository access, only service interfaces and events.
- **Role profiles** for SaaS: `role=viewer`, `role=plugin`, `role=api`, `role=jobs`. Each is the same image with different enabled modules, a different HPA, and a different ingress path. This preserves today's ability to scale the show-night hot paths (viewer, plugin) separately from the owner API. Self-host runs `role=all`.
- **Runtime:** JVM by default, on both SaaS and self-host. GraalVM native stays optional for SaaS roles where cold start or RSS matters. It is not required, and **no secrets are baked into images**.

### 3.3 Datastore: PostgreSQL (decided)

**Why it fits beyond "one store":** the per-show megadocument becomes normalized tables. That removes the 16 MB cap class of incident, the whale-array read amplification, and the dual-mapping drift. Queue and vote correctness gets real transactions and unique constraints.

**Schema sketch** (not final DDL):

| Table | Replaces (Mongo) | Notes |
|---|---|---|
| `account` | `show.email/password/mfa/userProfile/...` | Identity. Separating it from `show` leaves room for multi-member shows later (Q-6). |
| `show` | `show` scalar fields | `subdomain` unique, `show_token` unique (hashed at rest, §3.4), `owner_account_id`. |
| `show_preference` | `show.preferences` | One row per show. Rarely-queried knobs go in a typed `jsonb` column. |
| `sequence`, `sequence_group`, `category`, `psa_sequence` | embedded arrays | FK to `show`, `(show_id, name)` unique, explicit ordering column. |
| `viewer_page` | `show.pages` | `html` text (≤1 MB), `editor_doc` jsonb (the RFPB document, see §5.3), `etag`, `active`. |
| `queue_request` | `show.requests` | Plugin pull uses `SELECT ... FOR UPDATE SKIP LOCKED`, which makes the mutating `nextPlaylistInQueue` atomic. |
| `vote`, `vote_event` | `show.votes`, viewer `VoteEvent` | Unique `(show_id, round_id, viewer_key)` replaces the app-level `AlreadyVotedRule` race. |
| `active_viewer`, `viewer_session` | embedded arrays | High churn. Short TTL, purged by job. `UNLOGGED` is an option (Q-9). |
| `stat_*` | `show.stats` | Range-partitioned by month. Retention means dropping partitions instead of rewriting arrays. |
| `heartbeat`, `heartbeat_gap`, `version_change` | embedded arrays | Append-only. |
| `notification`, `show_notification` | `notification` collection + embedded | |
| `guestbook_site`, `guestbook_entry`, `admin_audit_log` | RFPB Neon | `owner_account_id` replaces the Clerk `owner_id` (§5.4). |
| `entitlement`, `billing_customer`, `billing_event` | RFPB Lemon Squeezy state | §5.4 |
| `shedlock`, `outbox` | Mongo `SchedulerLock` | |

- **Access layer:** jOOQ (or Spring Data JDBC) with **Flyway** migrations. No JPA lazy-loading on hot paths. Testcontainers Postgres replaces Mongo testcontainers.
- **SaaS hosting:** DigitalOcean Managed PostgreSQL with a standby node, so we are not repeating the single-node Mongo risk. Connection pooling goes through the managed PgBouncer, which removes the "HPA max 4 because of the connection budget" ceiling.
- **Hot-path caching:** keep the viewer's serve-stale cache and circuit-breaker pattern (now around Postgres). A Redis/Valkey tier is **not** proposed. Revisit only if load tests show we need one.

### 3.4 Auth strategy

**Options**

| | **1. Built-in RF identity, OIDC later** (Recommended) | 2. Hosted IdP (Clerk/Auth0) for SaaS, built-in for self-host | 3. Keycloak/Authentik bundled |
|---|---|---|---|
| Self-host | Works offline, no third party. | Two auth code paths. | Heavy (extra container and DB). |
| Migration of existing users | None. Passwords, MFA and showTokens already live in Mongo. | Bulk import into the IdP, password-hash compatibility risk. | Import. |
| Cost / lock-in | None | Per-MAU cost, vendor lock-in. | None, but ops burden. |
| RFPB guestbook users (Clerk) | Linked by verified email (§5.4). | Native. | Linked. |

**Recommendation: Option 1.**
- **Owners:** email + password (existing hashes migrated as-is, rehashed on next login if the algorithm changes), existing TOTP MFA (`MFA_SECRET_KEY` AES-GCM scheme carried over). Server-side sessions in Postgres with an **httpOnly, SameSite=Lax cookie** replace the bearer JWT held in browser storage. CSRF token on mutations. The `@RequiresAccess` / `AuthUtil` show-scoping semantics are preserved as a module-level guard.
- **Editor:** uses the same cookie session. The launch JWT, `/v1/sessions/exchange`, the 30-minute non-sliding bearer, and `rf_launch_jtis` are **not needed in native mode** (this also removes RFPB's #1 publish-failure cause, session expiry mid-edit).
- **Plugin:** `showtoken`/`remotetoken` header, unchanged. Tokens are stored **hashed** (SHA-256) with a prefix index. The plaintext is shown to the owner once, as today, and rotation is supported.
- **Viewer:** stays anonymous and host-scoped (show subdomain). The unused `JWT_VIEWER` is retired.
- **Partner/external API:** per-show API keys (existing `apiAccess`), hashed.
- **Later (optional):** an OIDC login provider (Google, generic OIDC) as an extra login method linked to an `account`. It works in self-host because it is just configuration.

### 3.5 Monolith vs services for self-host vs SaaS

Same codebase and image everywhere. Only the topology differs:

| | Self-host | SaaS |
|---|---|---|
| Processes | 1 × `core` (`role=all`) | `core` × N, split by role: viewer (HPA), plugin (HPA), api (HPA), jobs (1, ShedLock) |
| Datastore | Postgres container + volume | DO Managed Postgres + standby + PgBouncer |
| Proxy | Caddy (automatic Let's Encrypt) or the existing nginx | Cloudflare → ingress-nginx |
| SPA | Served by `core` as static assets | Served by `core` (or the CDN). The separate `ui` Node container is retired. |
| Feature flags | `billing`, `guestbook`, `premium-purchase` **off** | on |
| Telemetry | off by default | OTel → collector → PostHog |

---

## 4. Migration strategy: options

### 4.1 Option S: in-place strangler by endpoint

Replace services path-by-path behind the existing ingress while both stacks share Mongo, then migrate Mongo to Postgres underneath with CDC (change streams) and dual-write.

- **Pros:** incremental, every step small.
- **Cons:** for a long period you run **both** a new codebase **and** the Mongo coupling. A datastore swap under live traffic needs dual-write or CDC for every collection and every embedded array, and the per-show megadocument makes partial migration awkward. Rollback after the datastore flip is hard.

### 4.2 Option P: parallel platform plus per-show migration (Recommended)

Stand up RF Next (`apps/core` + Postgres) **next to** legacy. Every show is owned by **exactly one** platform at a time. A **show directory** at the edge routes each request to the owning platform. Shows move in batches through a short, per-show, freeze-copy-flip procedure.

This works because the data is already partitioned by show (one document per show), so a show can be moved atomically without cross-show dependencies.

**Routing keys**, all available at the edge:

| Traffic | Key | Where resolved |
|---|---|---|
| FPP plugin (`/remotefalcon/api/*`, `/remote-falcon-plugins-api/*`) | `showtoken` / `remotetoken` header | Edge router looks up hash(token) → platform |
| Viewer (`<sub>.remotefalcon.com`, `/remote-falcon-viewer/*`) | Host subdomain | Edge router looks up subdomain → platform |
| Owner control panel | Session after login | Login is served by RF Next. Legacy-owned accounts are bounced to legacy UI with a short-lived handoff until migrated, or the account is migrated on login (§7.3). |
| RFPB standalone `/v1/**` | Bearer → show | Proxied to the owning platform during the deprecation window. |

**Directory implementation (proposed):** a small table `show_routing(subdomain, token_hash, platform, migrated_at, state)` in Postgres, replicated to the edge as an in-memory map. The edge is an `apps/core` `role=edge` deployment or an ingress-nginx Lua/`auth_request` lookup; the choice is Q-8. The default for an unknown key is **legacy** until the final cutover, then **next**.

- **Pros:** no dual-write. Rollback is per show (flip back and reverse-copy the deltas). The new platform can be built cleanly without Mongo constraints. Canary with internal shows first. Matches "stand up a new platform and run it alongside."
- **Cons:** you operate two stacks for months; the cluster capacity and Mongo plus Postgres costs are temporary. Cross-show features (shows map, admin search, global stats, notifications fan-out) need a federated read during the overlap. The edge directory is a new critical component and needs tests, a cache, and fail-safe-to-legacy behavior.

**Recommendation: Option P.** The rest of this RFC assumes it.

---

## 5. Absorbing RF Page Builder natively

### 5.1 Editor into the control-panel UI

- Extract the RFPB editor (`components/editor`, `components/blocks`, `lib/blocks`, `lib/store.ts`, `lib/export`, `lib/import` client parts, `lib/templates`, `hooks/`, `types/`) into **`libs/page-editor`**, a TypeScript/React package built with Vite library mode. Remove its Next.js dependencies (`next/navigation`, `next/headers`, `next/image`, App Router).
- `apps/ui` mounts it as a **lazy-loaded route** (`/control-panel/pages/:pageId/edit`), replacing the "Edit in RF Page Builder ↗" external launch. It is a code-split chunk, so the main bundle is unaffected.
- **Toolchain gaps to close first:**
  - `apps/ui` is React 18 + JSX + MUI. The editor is React 19 + TS + Tailwind. Upgrade `apps/ui` to React 19 and TS-enable it (allowJs, so files migrate incrementally).
  - Scope Tailwind to the editor (prefix or a container-scoped preflight) so it does not fight MUI's baseline.
- **Preview** stays iframe + `srcdoc`, so editor CSS isolation is unchanged.
- Zustand store: the `rfBinding` slice is replaced by a simpler `pageBinding` (no launch or session state). The state union keeps the RFPB canonical pattern (`clean | dirty | saving | saved | conflict`), and "Live" remains reserved for RF's `active` flag.
- Standalone, anonymous editing (export/copy HTML without an account) is open question Q-4.

### 5.2 Fate of each `/api/*` route

| RFPB route | Native fate |
|---|---|
| `/launch`, `/launch/error` | **Removed.** No cross-app handoff. |
| `/api/rf/hydrate`, `/api/rf/pull` | **Replaced** by `GET /api/pages/{id}` on `core` (cookie session). Returns `html`, `editor_doc`, `etag`. |
| `/api/rf/publish` | **Replaced** by `PUT /api/pages/{id}` with `If-Match` (412 / 428 semantics and `?force=true` preserved, audit marker `RFPB_AUDIT` preserved). Sanitizer + 1 MB cap stay server-side in Java. |
| `/api/rf/disconnect`, `/api/rf/session/refresh` | **Removed.** No separate session. |
| `/api/import` (cheerio) | **Moved client-side:** the converter is ported from cheerio to the browser `DOMParser` inside `libs/page-editor`. Fallback if parity is too costly: a stateless Node sidecar (Q-5). Hand-edit preservation already runs in the browser. |
| `/api/feedback` | Folded into the existing control-panel feedback/notification path. |
| `/api/validate-license`, `/api/webhooks/lemon-squeezy`, `/api/cron/reconcile-subscriptions` | Ported into `core` `billing` module (§5.4). |
| `/api/guestbook/*` (public + owner) | Ported into `core` `guestbook` module. Public endpoints (`submit`, `img/[siteKey]`, `public-entries`, `thanks`) keep their **URL shapes** under a stable prefix with redirects from the old RFPB host, because snippets are embedded in published viewer pages. |
| `/api/admin/*` | Ported into the existing RF admin surface (role `ADMIN`). |
| `external-api /v1/**` | Kept, unchanged, through a deprecation window for anyone still using standalone RFPB, then removed (Q-4). |

### 5.3 Page storage: HTML plus editor document

Today RFPB round-trips its model through an embedded `rfpb-data` metadata blob inside the HTML. Natively, `viewer_page.editor_doc` (jsonb) stores the editor model next to `html`. The renderer still serves `html` only. The embedded metadata is kept in exports so offline/standalone round-trip still works.

### 5.4 Clerk, Lemon Squeezy, templates, guestbook

| Component | Decision |
|---|---|
| **Clerk** | **Removed.** Guestbook owners are matched to RF accounts by **verified email**. Unmatched Clerk users get a "claim your guestbook" flow: sign up or log in to RF, verify email, and the site is attached. Clerk stays read-only until the claim window closes. |
| **Lemon Squeezy** | **Kept** as merchant of record (decided: keep paid). Webhooks terminate in `core` `billing`. Purchases become `entitlement` rows keyed to `account_id` (`template:<id>`, `bundle:<id>`, `guestbook:<siteId>`). Existing license keys are redeemed once into entitlements ("enter your license key" in account settings), and webhook history is backfilled where the LS API allows. The reconcile cron becomes a `jobs` task. |
| **Template gallery** | Free templates ship in `libs/page-editor` (they are code today). **Premium template payloads move server-side:** served by `editor-assets` only to accounts with an entitlement. Today's client-only `isExportGated` check is bypassable because the premium TS is in the public bundle. The gallery does **not** need Postgres. The catalog stays in code, and only entitlements are in the DB. |
| **Guestbook** | Kept as a paid add-on (SaaS flag). Data migrated from Neon to Postgres (`guestbook_site`, `guestbook_entry`, `admin_audit_log`), with `owner_id` remapped from Clerk ID to `account_id`. |
| **Self-host** | Billing, premium purchase and guestbook flags off. Free templates are available. Premium templates are not distributed to self-host (Q-7). |
| **RFPB domain / Vercel / Neon** | After migration: the RFPB domain redirects editor paths to `remotefalcon.com`, guestbook public paths are proxied or redirected to `core`, docs (Nextra MDX in `content/`) move into the platform docs site, and Neon and Vercel are decommissioned. |

---

## 6. FPP compatibility strategy

### 6.1 Freeze the legacy contract

`plugin-compat` is a dedicated module whose only job is to reproduce today's plugins-api behavior byte-for-byte on top of the new domain services. The rules:

1. **Paths:** both `/remotefalcon/api/*` and `/remote-falcon-plugins-api/*`, same verbs, same query params (`updateQueue`), same health path.
2. **Auth:** `showtoken`, then `remotetoken` fallback. Same failure status and body for missing/invalid token.
3. **Bodies:** same field names, types, null-vs-absent behavior, number formatting, and date formats. Jackson configuration is pinned per endpoint, not inherited from global defaults.
4. **Semantics:** `nextPlaylistInQueue?updateQueue=true` stays a mutating GET. Ingress keeps `proxy-next-upstream: error` (never retry on timeout). Server side, it becomes idempotent per request via a short-lived dedupe key so retries cannot double-pop.
5. **Rate limiting:** `PLUGINS_RATE_LIMIT_MODE` (`off|log|enforce`) semantics and `Retry-After` carried over.
6. **No new required fields, ever,** on this surface. Additive response fields are allowed only after confirming the oldest supported plugin's JSON parser ignores unknown keys (verify per plugin version; Q-10).

### 6.2 Contract test expansion (prerequisite, Phase 0)

The existing `tests/contract/` module is the base. Add:

| Layer | What | How |
|---|---|---|
| Request fixtures | All endpoints with bodies (extend from 7) | As today |
| **Response golden fixtures** | Every endpoint × representative states (empty queue, jukebox, voting, PSA due, viewer control off, after hours) | Captured from legacy plugins-api against seeded Mongo (testcontainers), stored as `<endpoint>/<state>-response.json` |
| **Header/auth matrix** | `showtoken`, `remotetoken`, both, neither, invalid, rotated | Status and body asserted |
| **Plugin-version matrix** | Fixtures tagged by the plugin version that sends them (`pluginVersion` / FPP version brackets from the plugin repo's `pluginInfo.json`) | Use the `remote-falcon-plugin` repo's PHPUnit/Docker matrix to record real traffic per version |
| **Differential replay** | Same fixture → legacy and RF Next → normalized JSON diff must be empty | CI job runs both stacks via compose |
| **Shadow traffic** (SaaS, pre-migration) | Mirror sanitized prod plugin GETs (non-mutating only) to RF Next and diff responses | ingress `mirror` to a `role=plugin` shadow. Mutating calls are never mirrored. |

Contract tests become a required check on any PR touching `plugin-compat`, `queue`, `show`, or `libs/page-editor`'s render/token output.

### 6.3 Optional next-gen plugin path

- **`/plugin/v2`:** versioned (path + `Plugin-Api-Version` header), OpenAPI-specified, JSON error envelope, and an explicit capability handshake (`POST /plugin/v2/hello` returns enabled features and poll intervals).
- **Push instead of poll (optional):** SSE or WebSocket for "next in queue" and preference changes, to cut the polling load. The plugin falls back to v1 polling automatically.
- **Coexistence:** the plugin chooses v2 only when `hello` succeeds. v1 is never removed while any show sends a v1-only `pluginVersion`. Removal criteria are telemetry-driven (Q-10).
- **Not on the critical path:** RF Next ships with v1 only. v2 is a post-migration project.

---

## 7. Migration plan (Option P)

### 7.1 Phases

All dates assume work starts on 2027-01-05. "Freeze" means the season-prep deploy freeze in [SERVICES.md](SERVICES.md) "Season knobs".

| Phase | Window (target) | Scope | Exit criteria |
|---|---|---|---|
| **P0: Safety net** | Jan 2027 | Contract test expansion (§6.2); viewer GraphQL + template-token golden tests; `libs/schema` round-trip tests (to make the Mongo export trustworthy); record per-plugin-version fixtures. **No production changes.** | Golden suites green against legacy; plugin-version matrix covers every version seen in the last 90 days of `pluginVersion` data |
| **P1: RF Next skeleton** | Feb 2027 | `apps/core` with identity, show, queue, plugin-compat, viewer-runtime on Postgres + Flyway. Compose stack for CI. Differential replay in CI. | Differential replay diff = 0 on all fixtures |
| **P2: Edge directory + shadow** | Mar 2027 | `show_routing` + edge router (default legacy). Shadow plugin GETs and viewer reads to RF Next. Mongo → Postgres **migrator** (per-show export/transform/load + verify). | Shadow diff rate < 0.1% and explained; migrator round-trips 100% of a prod snapshot in staging with checksum verification |
| **P3: Native editor + SaaS modules** | Mar–Apr 2027 | `libs/page-editor` extraction, React 19 / TS in `apps/ui`, client-side import, pages API, billing, guestbook, entitlements, Clerk claim flow. | Editor parity checklist (RFPB Playwright visual suite passes against the native route); billing webhooks verified in LS test mode |
| **P4: Canary shows** | Apr 2027 | Migrate internal/test shows, then volunteer shows (opt-in banner). | 2 weeks with zero plugin-compat regressions; rollback rehearsed |
| **P5: Batch migration** | May–Jul 2027 | Batches by risk tier (inactive → small → active → high-traffic). RFPB users migrated with their shows; guestbook data migrated. | ≥ 95% of shows on RF Next by Jul 31 |
| **Go/no-go gate** | **Aug 15 2027** | If the remaining shows cannot be migrated and the new stack has not passed the season load test, **stop**: legacy stays as-is for the 2027 season and migration resumes Jan 2028. | Decision recorded in this RFC |
| **P6: Cutover + decommission** | Aug–Sep 2027 | Default routing → next; last shows; legacy read-only for 30 days; then delete viewer/plugins-api/control-panel/external-api (legacy) deployments, Mongo, `mongo-backup` (replaced by Postgres backups), RFPB Vercel/Neon/Clerk. New self-host compose released. | Legacy receives 0 requests for 14 days |
| **Season prep 2027** | from season-prep R1 | Normal season-prep on RF Next only. | — |

### 7.2 Per-show migration procedure

For one show, scripted and idempotent, typically seconds:

1. **Pre-copy:** export the `show` document, transform it into normalized rows, and load it into RF Next in state `staged` (not routable). Verify row counts and checksums per entity.
2. **Freeze window:** run outside show hours, which are roughly 5 pm–2 am ET for US shows. Set directory state `migrating`. The edge returns a retryable 503 + `Retry-After` for owner writes. Plugin and viewer reads keep going to legacy.
3. **Delta copy:** re-export and apply only what changed since step 1 (queue, votes, stats, heartbeat, page edits).
4. **Flip:** directory → `next`. The edge map propagates in under 5 s. Plugin traffic for this token now hits RF Next.
5. **Verify:** synthetic plugin calls (`remotePreferences`, `viewerControlMode`, `nextPlaylistInQueue` without `updateQueue`) and a viewer render. Diff against the step-3 snapshot.
6. **Hold:** keep the legacy document read-only for 30 days for rollback and audit.

**Rollback:** set directory → `legacy` and reverse-copy the deltas written on RF Next since the flip (the same migrator in reverse, which is why the migrator is bidirectional for the overlap period).

### 7.3 Owner experience during overlap

- **Login:** served by RF Next. If the account's show is still on legacy, the login is either (a) **migrate-on-login** (the default for non-show-hours, low-traffic shows), or (b) handed off to the legacy UI with a short-lived signed redirect. Choice per batch.
- **Notices:** a banner a week before, an email if SendGrid is configured, and a "you've moved" banner after.
- **No operator action required:** plugin configuration and the show token do not change.

### 7.4 Data migration details (Mongo → Postgres)

- **Source of truth:** a Mongo snapshot (via `mongo-backup`) for dry runs, the live document for real migrations.
- **Transform rules** are in the migrator, versioned, and unit-tested against the `libs/schema` round-trip fixtures. Known hazards:
  - Embedded arrays with duplicates or stale entries (whale votes, `systemInjected` PSA votes): deduplicated with a logged report, not silently dropped.
  - `LocalDateTime` without a zone: interpreted as UTC (to confirm against the Mongo codec configuration in P0).
  - The `pages[].html` 1 MB cap: oversized legacy pages are migrated unchanged and flagged, not truncated.
  - Show tokens: hashed on load. The plaintext is never written to Postgres.
  - Passwords and MFA secrets: copied as-is (same algorithm and key), with a key-rotation option after cutover.
- **RFPB Neon → Postgres:** one-shot copy of guestbook and audit tables with the Clerk → `account_id` remap. Unmatched rows wait for the claim flow. `rf_launch_jtis` is not migrated.
- **Cross-show reads during overlap** (shows map, admin search, global stats): federated by querying both platforms, or by a nightly legacy → Postgres read-only import into reporting tables.

### 7.5 Self-host packaging

Target `ops/self-host/docker-compose.yaml` v2:

| Container | Image | Notes |
|---|---|---|
| `core` | `ghcr.io/remote-falcon/core:<version>` (prebuilt, multi-arch amd64/arm64) | `role=all`, serves the SPA, JVM. **No local build needed**, which fixes today's ~5 min build and OOM risk on small droplets. |
| `postgres` | `postgres:16` + named volume | Nightly `pg_dump` sidecar or a cron entry in `core` jobs. |
| `proxy` | `caddy:2` (automatic TLS) | Replaces the hand-written nginx + manual certs. Preserves both subdomain mode and path-routed mode. |

- Config: one `.env` (`WEB_URL`, `ROUTING_MODE=subdomain|path`, `SESSION_SECRET`, optional `MFA_SECRET_KEY`, SMTP/SendGrid, S3).
- **Upgrade from today's self-host:** `rf-migrate` subcommand of `core` connects to the old `mongo` container and imports everything (the same migrator as SaaS, all shows at once), then `docker compose` v2 replaces the old stack. Documented in [SELF-HOST.md](SELF-HOST.md).
- Released as versioned tags with release notes, so self-hosters pin versions instead of `git pull` + build.

### 7.6 Operating two stacks

- **Capacity:** RF Next runs on the same DOKS cluster in a new namespace (`remote-falcon-next`), with its own season profile rows in `ops/season/profile.conf`.
- **Cost:** DO Managed Postgres (primary + standby) runs alongside Mongo until P6.
- **Observability:** OTel from day one (no Datadog annotations). PostHog dashboards gain a `platform` dimension. Directory state changes are audited.
- **CI:** `deploy.yml` gains `core` with role matrix. Legacy services stay deployable for hotfixes until P6.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Plugin regression breaks shows on a show night | Frozen contract + golden + differential + shadow; migrate outside show hours; per-show rollback; canary first |
| Edge directory outage routes nothing | In-memory map with last-known-good snapshot; fail-safe to legacy until P6; health-gated rollout |
| Migration drags into the season | Aug 15 go/no-go gate; legacy remains fully supported until cutover |
| Editor parity gaps after extraction from Next.js | Reuse RFPB Playwright visual-regression suite as the parity gate |
| Lemon Squeezy entitlement mismatch | License-key redemption path + LS API reconcile; billing dry run in LS test mode |
| Clerk-only guestbook owners can't be matched | Claim flow; Clerk retained read-only through claim window |
| Solo-maintainer bandwidth | Option A reuses Java domain; phases are sized to stop cleanly at each boundary |

---

## 9. Open questions

| ID | Question | Status / answer |
|---|---|---|
| Q-0 | Overall scope: evolve vs TS unify vs hybrid | **Answered 2026-11-22:** "Let the RFC recommend." Recommendation: Option A (§3.1), delivered via parallel platform (§4.2). Awaiting ratification. |
| Q-0a | Run a new platform alongside and migrate? | **Answered 2026-11-22:** owner is fine with standing up a new platform alongside the existing one. Adopted as Option P (§4.2). |
| Q-D | Datastore | **Answered 2026-11-22:** Postgres, one store for platform + absorbed RFPB data. |
| Q-A | Auth strategy | **Answered 2026-11-22:** "Let the RFC recommend." Recommendation: built-in RF identity, cookie sessions, Clerk dropped, OIDC optional later (§3.4). Awaiting ratification. |
| Q-S | Self-host requirements | **Answered 2026-11-22:** Compose is fine; SaaS-only features (billing, premium templates, guestbook) may be excluded. |
| Q-B | RFPB commerce | **Answered 2026-11-22:** keep paid premium templates + guestbook subscriptions, move billing into the platform. |
| Q-T | Timeline | **Answered 2026-11-22:** no platform changes before season ends; start Jan 2027; respect Dec 18–26 freeze. |
| Q-1 | Is staying on Java long-term acceptable, or is leaving Java a goal in itself (would flip §3.1 to Option B)? | Open |
| Q-2 | Accept a move from DO Managed Mongo to DO Managed Postgres with standby (cost delta during overlap)? | Open |
| Q-3 | OIDC (Google sign-in) in v1 of RF Next, or later? | Open — recommended later |
| Q-4 | Keep a standalone, account-less RFPB editor (export/copy HTML) after absorption? If not, deprecation window length for `/v1/**` and the RFPB domain. | Open |
| Q-5 | Accept porting the cheerio import converter to browser `DOMParser`, or keep a Node sidecar? | Open — recommended browser |
| Q-6 | Multi-member shows (multiple accounts per show) in scope now, or just leave room in the schema? | Open — recommended leave room |
| Q-7 | Should self-hosters be able to buy/use premium templates (license-key activation against SaaS), or are they SaaS-only? | Open |
| Q-8 | Edge directory implementation: `core role=edge` vs ingress-nginx Lua/`auth_request` vs Cloudflare Worker | Open |
| Q-9 | `UNLOGGED` tables for ephemeral viewer presence (faster, lost on crash) — acceptable? | Open |
| Q-10 | Oldest plugin version we commit to supporting on v1, and the telemetry criteria for ever retiring v1 | Open |
| Q-11 | Partner/external GraphQL consumers: is there a known list, and is changing anything there allowed? | Open |
| Q-12 | Repo/naming: `apps/core` in this monorepo (recommended) vs a new repo | Open |

---

## 10. Decision log

| Date | Decision |
|---|---|
| 2026-11-22 | Datastore: Postgres as the single store (owner). |
| 2026-11-22 | Self-host via Compose; SaaS-only features may be excluded (owner). |
| 2026-11-22 | Keep paid premium templates + guestbook; billing moves into platform (owner). |
| 2026-11-22 | No platform changes before Jan 2027; respect Dec 18–26 freeze (owner). |
| 2026-11-22 | Parallel new platform with migration path is acceptable (owner). |
