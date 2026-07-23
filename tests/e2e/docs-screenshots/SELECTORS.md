# `data-testid` contract — docs-screenshots pipeline

This file is the contract between the docs-screenshots specs (in
`tests/e2e/docs-screenshots/`) and the RF UI (in `apps/ui/src/`). The
specs locate elements via `data-testid` attributes listed below; the UI
guarantees those attributes exist and point at the documented element.

The PRD section that gave birth to this file is **Appendix B** of
[RemoteFalcon-Docs-Screenshot-Automation-PRD.md](../../../../RemoteFalcon-Docs-Screenshot-Automation-PRD.md).
Appendix B remains the upstream source of truth; this file is the
self-contained, in-repo copy that stays accurate even if the PRD is
archived.

## Naming convention

- **kebab-case**, two segments minimum: `<area>-<element>`.
- **Element-capture shots** — the testid matches the shot name verbatim.
  Example: shot `dashboard-checklist` ⇄ `data-testid="dashboard-checklist"`.
  The spec does `page.locator('[data-testid="dashboard-checklist"]').screenshot(...)`.
- **Full-page-capture shots** — the testid still exists as a load-ready
  anchor (spec uses it in `waitForSelector` before capturing the
  viewport). Suffix `-root` (e.g., `sequences-list-root`).
- **Stable-across-state shots** — when the same DOM element is captured
  in two states (jukebox vs. voting active-tile), the testid is the
  same and the spec captures it twice under two filenames after
  flipping mode. See `dashboard-active-tile` below.

## Stability contract

- Renaming or removing a listed testid is a **breaking change** to the
  docs-screenshots pipeline. The PR description must list affected
  shots and the docs-screenshots spec author must be looped in.
- Testids are write-once, read-many. Don't reuse a name for a different
  element later — it's harder to audit than a rename.
- Generic IDs (MUI's auto-IDs like `#outlined-adornment-...`) are
  acceptable for input fields where a stable label-based locator
  exists. Testids are for **containers, modals, popovers, and chart
  cards** where label-based targeting is unreliable.

## Per-shot testid table

13 testids across 12 files. (Shots 4 and 5 share one testid —
`dashboard-active-tile` — captured twice under different filenames
after flipping show mode.)

| # | Shot name | Component file | Element | `data-testid` |
|---|---|---|---|---|
| 1 | `signup-form` | `apps/ui/src/views/pages/authentication/auth-forms/AuthRegister.jsx` | `<form>` rendered inside the Formik render prop | `signup-form` |
| 2 | `account-profile` | `apps/ui/src/views/pages/controlPanel/accountSettings/UserProfile.jsx` | outer `<Grid container>` | `account-profile-root` |
| 3 | `dashboard-viewers-now` | `apps/ui/src/views/pages/controlPanel/dashboard/LiveStatsRow.jsx` | tile 1 — `<Grid item>` wrapping "Viewers right now" `StatTile` | `dashboard-viewers-now` |
| 4 | `dashboard-active-jukebox` | `apps/ui/src/views/pages/controlPanel/dashboard/LiveStatsRow.jsx` | tile 2 — `<Grid item>` wrapping the songs-queued / active-votes `StatTile` | `dashboard-active-tile` |
| 5 | `dashboard-active-voting` | same file, same element | (same `<Grid item>` as #4 — different show mode) | `dashboard-active-tile` |
| 6 | `dashboard-show-health` | `apps/ui/src/views/pages/controlPanel/dashboard/HealthRow.jsx` | outer `<MainCard>` | `dashboard-show-health` |
| 7 | `dashboard-now-playing` | `apps/ui/src/views/pages/controlPanel/dashboard/NowPlayingCard.jsx` | outer `<MainCard>` | `dashboard-now-playing` |
| 8 | `dashboard-checklist` | `apps/ui/src/views/pages/controlPanel/dashboard/PreShowChecklist.jsx` | outer `<MainCard>` | `dashboard-checklist` |
| 9 | `sequences-list` | `apps/ui/src/views/pages/controlPanel/sequences/SequencesList.jsx` | outermost component root | `sequences-list-root` |
| — | `account-notifications` | `apps/ui/src/views/pages/controlPanel/accountSettings/Notifications.jsx` | outer `<Grid item>` (FPP Plugin Health card) | `account-notifications-root` |
| — | `sequence-metadata-lookup-popover` | `apps/ui/src/views/pages/controlPanel/sequences/SequenceMetadataLookup.jsx` | Popover paper (element capture) | `sequence-metadata-lookup-popover` |
| — | `bulk-metadata-lookup-dialog` | `apps/ui/src/views/pages/controlPanel/sequences/BulkMetadataLookupDialog.jsx` | Dialog paper (element capture) | `bulk-metadata-lookup-dialog` |
| — | (interaction only, no shot) | `apps/ui/src/views/pages/controlPanel/sequences/SequencesList.jsx` | per-row lookup icon button | `sequence-metadata-lookup-button` |
| 10 | `sequences-groups` | `apps/ui/src/views/pages/controlPanel/sequences/SequenceGroups.jsx` | outermost component root | `sequences-groups-root` |
| 11 | `analytics` | `apps/ui/src/views/pages/controlPanel/analytics/index.jsx` | outer `<Box>` shell | `analytics-root` |
| 12 | `image-hosting` | `apps/ui/src/views/pages/controlPanel/imageHosting/index.jsx` | outer `<Box>` | `image-hosting-root` |
| 13 | `shows-map` | `apps/ui/src/views/pages/controlPanel/showsMap/index.jsx` | outer `<Box>` | `shows-map-root` |
| 14 | `viewer-page` | `apps/ui/src/views/pages/controlPanel/viewerPage/index.jsx` | outer `<Box>` | `viewer-page-root` |
| 15 | `qr-code` | `apps/ui/src/views/pages/controlPanel/qrCode/index.jsx` | outer `<Box>` | `qr-code-root` |

### Notes per row

- **#1 — `signup-form`**: `<Formik>` is a render-prop wrapper and does
  not emit a DOM node of its own; the testid lives on the `<form>`
  element it renders. Existing field-level `id="signup-*"` attributes
  (first-name, last-name, etc.) stay unchanged and remain the right
  way for specs to target individual inputs.
- **#3 — `dashboard-viewers-now`**: testid lives on the outer
  `<Grid item>`, not on `<StatTile>`. See *StatTile rationale* below.
- **#4 / #5 — `dashboard-active-tile`**: intentionally stable across
  jukebox and voting modes. The same DOM node renders both labels
  ("Songs queued" vs. "Active votes") depending on
  `show.preferences.viewerControlMode`. The spec captures it once per
  mode and saves under two filenames.
- **#9 / #10 — `*-root` suffix**: full-page captures still need a
  load-ready anchor for `waitForSelector`. The outermost root in both
  files happens to be a `<Box>` (not a `<Grid container>` or
  `<MainCard>`) — but the testid name is unaffected; specs only see
  the attribute.

## StatTile rationale (tag the wrapper, not the primitive)

`StatTile` is reused 4× in `LiveStatsRow.jsx` and does not accept a
`testid` prop today. Two viable approaches:

- **Option A (chosen):** put testids on the outer `<Grid item>`
  wrappers, not on `StatTile` itself. Zero `StatTile` change. The
  spec's locator is `[data-testid="dashboard-viewers-now"]` — the
  `<Grid item>` is a `<div>` with the testid; Playwright happily
  screenshots it. Slightly wider capture region than the card alone,
  but the wrapper has the same visual bounds in practice.
- **Option B (rejected):** add a `testid` prop to `StatTile` that
  forwards to its `<MainCard>` root. Cleaner naming (testid lives on
  the conceptual component), but widens a shared UI primitive — the
  prop sits there even when unused, and any future caller of
  `StatTile` adds review surface.

Option A keeps the testid contract local to the screens that need it.

## Phase 1.5 — new shots added 2026-05-23

Shots 11–14 were added as a Phase 1.5 follow-up to cover the four pages
that the IA restructure surfaced but Phase 1 didn't capture: Analytics,
Image Hosting, Shows Map, and the rebuilt Viewer Page editor. All four
are full-page captures with `-root` suffix testids on the outer `<Box>`
shells.

For Shows Map (#13) to render with a pin instead of the opt-in CTA, the
docs-screenshots seed sets `preferences.showOnMap: true` plus a realistic
`showLatitude` / `showLongitude` (see Appendix A.3).

## QR Code — new shot added 2026-06-20

Shot 15 (`qr-code`) covers the QR Code generator page added in #93. It's a
full-page capture anchored on the outer `<Box>`'s `qr-code-root` testid. The
page is entirely client-side; the spec additionally waits for the rendered
`<canvas>` inside `qr-code-root` before capturing so the shot never catches
the pre-hydration "show URL unavailable" empty state. No extra seed state is
required beyond an authenticated show with a resolvable public URL.

## Two-Factor Auth — new shots added 2026-07-10

Shots 16–18 cover the Two-Factor Auth tab that shipped with the 2FA
release. All three are full-page captures taken from a single lifecycle
test in `two-factor.screenshot.ts`:

| # | Shot name | Component file | Element | `data-testid` |
|---|---|---|---|---|
| 16 | `two-factor-auth` | `apps/ui/src/views/pages/controlPanel/accountSettings/TwoFactorAuth.jsx` | outer `<Grid item>` | `two-factor-root` |
| 17 | `two-factor-setup` | same file | (same anchor; QR readiness via existing `mfa-qr` testid) | `two-factor-root` / `mfa-qr` |
| 18 | `two-factor-recovery-codes` | same file | (same anchor, post-enable state) | `two-factor-root` |

The spec computes a real TOTP code from the on-screen manual-entry secret
(`utils/totp.ts`) to complete enrollment, captures the one-time recovery
codes section, then **disables 2FA through the re-auth modal** so the
shared fixture user is clean for the next project/run. `mfa-qr` predates
this spec (it's the QR mount point in the component) and is reused as the
enrollment-readiness anchor.

## Categories — new shot added 2026-07-11 (Show Fairness release)

Shot 19 (`sequences-categories`) covers the Categories management tab that
shipped with the Show Fairness epic (#125).

| # | Shot name | Component file | Element | `data-testid` |
|---|---|---|---|---|
| 19 | `sequences-categories` | `apps/ui/src/views/pages/controlPanel/sequences/Categories.jsx` | outer `<Box>` | `sequences-categories-root` |

Full-page capture anchored on `sequences-categories-root` (the testid
shipped with the feature itself). The spec additionally waits for a seeded
category name ("Traditional") to render so it never captures the empty
"no categories yet" state. Seed dependency: the top-level `categories[]`
array in `docs-demo-show.json` — six first-class categories whose names
match the seed sequences' `category` strings, with varied `requestLimit`
and `antiConsecutive` values so every column shows real data. This same
seed addition populates the category chips/column on the existing
`sequences-list` shot.

Not captured from this release (deliberate): the Voting/Safeguards settings
fields (settings docs are text-only; no testids exist in
`VotingSettings.jsx` / `InteractionSettings.jsx`) and the public viewer
page's votes-left countdown and unavailable-song gray-out (the pipeline
only drives authed `/control-panel/*` routes; a public-viewer capture path
is a future enhancement).

> **Table drift note:** the "Per-shot testid table" above predates the
> PSA Quick-Play (`dashboard-psa-quick-play`) and Special Roles
> (`sequences-special-roles` — anchors `special-roles-tab` / `psa-table`)
> shots, which are documented in their specs. Counting those, the pipeline
> produced 20 named shots before this addendum; with `sequences-categories`,
> 21 (verified against the run manifest, 2026-07-11).

## Public Show Map — new shots added 2026-07-22

The Public Show Map release (#138) added the unauthenticated `/map` page and
swapped the admin Shows Map from Google Maps to the shared MapLibre GL
component. New/changed testids:

| # | Shot name | Component file | Element | `data-testid` |
|---|---|---|---|---|
| 20 | `public-map` | `apps/ui/src/views/pages/map/index.jsx` | outer `<Box>` shell | `public-map-root` |
| 21 | `public-map-details` | same file (details card open) | (same `public-map-root` anchor; card opened via the search box) | `public-map-root` |
| — | (load anchor, both maps) | `apps/ui/src/ui-component/maps/ShowsMapLibre.jsx` | the MapLibre container `<Box>` | `shows-maplibre` |

Notes:

- **`public-map-root`** is the full-page load anchor on the public `/map`
  page, following the `-root` convention. `public-map.screenshot.ts`
  captures it twice: the default map, then a `details-open` state opened by
  selecting a show from the search box (a deterministic path — clicking a
  canvas pin is unreliable headless).
- **`shows-maplibre`** ships with the `ShowsMapLibre` component itself (the
  map container). Both the public-map spec and the admin `shows-map` spec
  (#13) now wait on it so they assert the map path rendered (not the list
  fallback) and give basemap tiles a beat to paint. `shows-map` (#13) is
  otherwise unchanged — it just picks up the new two-toggle MapLibre admin
  UI on regeneration.
- **Seed dependency:** for the public map to show real pins the docs seed
  sets `preferences.showOnMapPublic: true` on the demo show and inserts
  `fixtures/seed-shows-docs/public-map-pins.json` (7 scattered public shows,
  two clustered near the demo pin) — see `global-setup.ts` Phase C. This
  also lights the public toggle + "Public" badge on the `shows-map` shot.

## Cross-reference

- PRD source: **Appendix B** of
  `RemoteFalcon-Docs-Screenshot-Automation-PRD.md`
- Shot inventory and seed-state map: **Appendix A.1** of the same PRD
