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

9 testids across 8 files. (Shots 4 and 5 share one testid —
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
| 10 | `sequences-groups` | `apps/ui/src/views/pages/controlPanel/sequences/SequenceGroups.jsx` | outermost component root | `sequences-groups-root` |

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

## Out-of-scope (Phase 1.5)

When the docs-alignment PRD picks up the deferred shots (header,
viewer-page, sequences inline-edit), additional testids will be added.
Tracked in Appendix B.6 of the PRD; not added by this contract.

## Cross-reference

- PRD source: **Appendix B** of
  `RemoteFalcon-Docs-Screenshot-Automation-PRD.md`
- Shot inventory and seed-state map: **Appendix A.1** of the same PRD
