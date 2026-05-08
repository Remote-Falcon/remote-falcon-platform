# Remote Falcon UI

The frontend SPA for the Remote Falcon platform — both the show-owner control panel and the public viewer pages served on per-show subdomains.

| | |
|---|---|
| **Stack** | Vite + React (`.jsx`), Node 22 in the production image |
| **Container port** | 3000 |
| **Replicas** | 1 |
| **Ingress** | `remotefalcon.com` (root path) **and** `*.remotefalcon.com` (subdomain catch-all for viewer pages) |
| **Health probe** | `GET /health.json` |
| **Talks to** | [`apps/control-panel`](../control-panel) (admin/auth API), [`apps/viewer`](../viewer) (public viewer API) — both URLs baked at build time |

## What it does

- Hosts the **control panel** for show owners: account, sequences, requests/votes config, page editor, integrations, admin tools (when the user's `showRole === 'ADMIN'`).
- Serves the **public viewer page** on a per-show subdomain — what audiences see when they land on `<show>.remotefalcon.com`.
- Wraps the viewer page with the show owner's chosen template (from [page-templates](https://github.com/Remote-Falcon/remote-falcon-page-templates)) plus optional CDN scripts (snow, countdowns, dynamic menu — from [viewer-page-js](https://github.com/Remote-Falcon/remote-falcon-viewer-page-js)).

## Build-time configuration

All third-party keys are **baked into the bundle at image build time** via `import.meta.env.VITE_*`. Rotation requires a re-run of the build/deploy workflow — restarting pods is not enough.

| Env var | Purpose |
|---|---|
| `VITE_VIEWER_JWT_KEY` | Signs the JWT used by the viewer flow |
| `VITE_GOOGLE_MAPS_KEY` | Maps for geo-fencing UI |
| `VITE_PUBLIC_POSTHOG_KEY` | PostHog product analytics + session replay |
| `VITE_GA_TRACKING_ID` | Google Analytics *(scheduled for removal in observability rollout)* |
| `VITE_MIXPANEL_KEY` | Mixpanel *(scheduled for removal in observability rollout)* |
| `VITE_CLARITY_PROJECT_ID` | Microsoft Clarity *(scheduled for removal in observability rollout)* |

## Local development

```bash
npm install
npm run dev             # http://localhost:3000
```

For the full local stack (UI + every backend + Mongo behind the prod-shaped ingress), use the workspace-level `dev-up.sh`.

## Testing

- **Vitest + React Testing Library**: unit/component tests in `src/**/*.test.{ts,tsx,js,jsx}`
  - `npm run test:unit -- --run` — single CI-style run
  - `npm run test:unit:watch` — watch mode
  - `npm run test:unit:coverage -- --run` — emit `coverage/` (text + html + lcov)
- **Playwright**: end-to-end tests live at the repo root in `tests/e2e/` (replaces the previous Cypress setup)

Coverage thresholds are currently set to 0% (Sprint 2 floor) — they exist to surface real numbers in CI and will be ratcheted up in Sprint 3.

## Design system

[`STYLE_GUIDE.md`](STYLE_GUIDE.md) is the source of truth for visual & interaction standards — color, typography, spacing, components, theme behavior. Token files under [`src/design-system/tokens/`](src/design-system/tokens/) carry the actual values; if you need a value, import the token rather than redefining it.

To preview the design system locally, copy `.env.example` to `.env.local`, set `VITE_USE_DESIGN_SYSTEM_V2=true`, and restart `npm run dev`. The flag is transient — removed once the migration completes.

## Key directories

- `src/views/pages/controlPanel/` — control-panel screens (sequences, requests, pages, account, admin)
- `src/views/pages/viewer/` — public viewer page
- `src/utils/graphql/` — GraphQL queries/mutations for `apps/control-panel`
- `src/routes/` — routing, including the `showRole === 'ADMIN'` gate
- `src/menu-items/` — sidebar/navigation definitions
