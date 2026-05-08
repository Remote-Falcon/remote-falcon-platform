# UI Modernization — Migration Plan

This document is the execution plan for moving Remote Falcon's UI from the legacy MUI/Berry theme to the v2 design system documented in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

**Guiding rule:** ship in phases. The legacy and v2 systems coexist. No phase is allowed to break the app on `main`.

---

## What's already done

The following already exists in the repo as a non-breaking addition:

```
apps/ui/
├── DESIGN_SYSTEM.md                       ← the style guide
├── MIGRATION.md                           ← this file
├── docs/design-system/
│   ├── PATTERNS.md                        ← component pattern reference
│   └── mockup.html                        ← interactive visual reference
└── src/design-system/
    ├── README.md                          ← engineer quick-start
    ├── components/
    │   ├── ThemeToggle.jsx                ← light/dark switcher (uses useConfig)
    │   ├── LogoMark.jsx                   ← RF monogram (wraps public/rf-icon.png)
    │   └── Logo.jsx                       ← brand lockup + hero variant
    ├── tokens/
    │   ├── colors.js                      ← navy + amber + red, drawn from theme3
    │   ├── radius.js
    │   ├── shadows.js
    │   ├── typography.js
    │   ├── motion.js
    │   ├── spacing.js
    │   ├── breakpoints.js
    │   └── index.js
    └── theme/
        ├── palette.js
        ├── typography.js
        ├── componentOverrides.js
        └── index.jsx                      ← v2 ThemeProvider (drop-in)
```

The legacy theme under `src/themes/` is untouched. **Nothing has been migrated yet.** Phase 1 below is what flips the switch.

---

## Phased rollout

| # | Phase | Effort | Risk | Owner |
|---|---|---|---|---|
| 0 | Land assets (this PR) | — | none | — |
| 1 | Wire v2 ThemeProvider behind a flag | ~½ day | low | UI |
| 2 | Place `ThemeToggle` on marketing site + control panel | ~½ day | low | UI |
| 3 | Migrate the layout shell (`MainLayout`) | 1–2 days | medium | UI |
| 4 | Replace `MainCard` / `SubCard` patterns | 1 day | low | UI |
| 5 | Refresh marketing site (landing) | 1–2 days | low | UI |
| 6 | Sequences page polish | 1 day | low | UI |
| 7 | Settings: form-with-submit pattern | 2 days | medium | UI |
| 8 | Command palette (⌘K) | 1–2 days | low | UI |
| 9 | Empty states & skeletons sweep | 1 day | low | UI |
| 10 | Delete legacy theme & SCSS modules | ½ day | low | UI |

Phases 1–5 deliver the bulk of the visible upgrade. Phases 6–10 are polish and can ship any order after 5.

---

## Phase 1 — Per-route theme split _(SHIPPED)_

The original plan was to gate v2 behind a `VITE_USE_DESIGN_SYSTEM_V2`
env var. We landed on a different shape that ships v2 to users today
without waiting for the control-panel migration:

- `apps/ui/src/App.jsx` imports `LegacyTheme` (Berry) directly as the
  global default. Anything that doesn't have its own override renders
  Berry — which is exactly what `MainRoutes` (`/control-panel/*`)
  needs because it still references Berry-only palette keys
  (`palette.dark`, `palette.text.dark`, `customShadows.medium`,
  `customInput`).
- `apps/ui/src/routes/LoginRoutes.jsx` wraps its element tree in the
  v2 `ThemeCustomization` from `design-system/theme`. Public surfaces
  — landing, signin/signup, forgot/reset password, verify-email,
  privacy, terms, and 404 — render under v2.
- `apps/ui/.dockerignore` excludes `.env.local` / `.env.*.local` so
  developer-local toggles never leak into the production bundle.

When Phases 3–9 finish migrating the control-panel surfaces off
Berry-only theme keys, Phase 10 swaps `App.jsx`'s import to
`design-system/theme` and removes the override in `LoginRoutes`.

---

## Phase 2 — Place `ThemeToggle` on marketing site + control panel

**Goal:** users can flip between light/dark on every screen, and their choice persists across reloads. Persistence is already free — `ConfigContext` writes `navType` to `localStorage('rf-config')` via `useLocalStorage`.

### Files to touch

- `apps/ui/src/views/pages/landing/Header.jsx` (marketing nav) — or `apps/ui/src/ui-component/extended/AppBar.jsx` if the toggle should live in the shared marketing AppBar
- `apps/ui/src/layout/MainLayout/Header/index.jsx` (control panel topbar)
- `apps/ui/src/layout/MainLayout/Sidebar/index.jsx` (control panel rail footer)

### Changes

1. **Marketing nav**: import `ThemeToggle` from `design-system/components/ThemeToggle` and place it to the left of the "Sign in" button. The toggle stays visible on mobile.
2. **Control panel topbar**: place `<ThemeToggle />` to the left of the notifications icon. Ensure it's reachable at every breakpoint.
3. **Control panel sidebar footer**: place `<ThemeToggle variant="rail" />` above the collapse-rail toggle. When the rail is collapsed (icon-only), the icon stays visible; when expanded, it shows "Light mode" / "Dark mode" beside the icon.
4. **Verify the v2 ThemeProvider re-renders on toggle.** It already reads `navType` from `useConfig()`; no extra plumbing should be needed. Smoke-test by toggling and confirming all surfaces (landing, dashboard, sequences) update without a reload.

### Acceptance

- [ ] Toggle is visible and clickable on landing, dashboard, sequences, settings, viewer-page, shows-map.
- [ ] Toggling on the landing page persists when navigating to the control panel and vice versa.
- [ ] After page reload, the last-chosen mode is restored.
- [ ] No flash of unstyled content (FOUC) on initial load — the saved mode is applied before paint.
- [ ] Mobile (< 600px): toggle is reachable without opening a menu.

---

## Phase 3 — Migrate the layout shell

The control panel's perceived modernization comes 80% from the shell.

### Files to touch

- `apps/ui/src/layout/MainLayout/index.jsx`
- `apps/ui/src/layout/MainLayout/Header/index.jsx`
- `apps/ui/src/layout/MainLayout/Sidebar/index.jsx`
- `apps/ui/src/menu-items/controlPanel.jsx` (group items by section)
- `apps/ui/src/store/constant.jsx` — change `drawerWidth` to support collapsed/expanded
- `apps/ui/src/hooks/useConfig.js` — add `sidebarCollapsed` state

### Changes

1. **Sidebar → icon rail.** Replace the fixed 320px drawer with a collapsible rail (72px collapsed → 248px expanded). Persist the state to localStorage (or the existing config store).
2. **Group menu items.** Update `menu-items/controlPanel.jsx` to nest items under section labels: *Show* / *Account* / *Community* / *Admin*. Section labels render only when expanded.
3. **Slim the topbar** to 56px. Move localization, customization, and "what's new" into one overflow `IconButton` with a Menu. Keep only profile + notifications visible.
4. **Add command-palette trigger** to topbar (the search-shaped chip with ⌘K hint). Wire to a placeholder modal for now — Phase 7 implements the real palette.

### Acceptance

- [ ] Sidebar collapses smoothly (250ms transition) and persists across reloads.
- [ ] All 9 nav items reachable, grouped under 4 sections.
- [ ] Topbar height = 56px, no horizontal scroll on 1280px.
- [ ] Mobile (< 600px) keeps current full-screen drawer behavior.

---

## Phase 4 — Replace `MainCard` / `SubCard` patterns

The legacy `MainCard` adds a border *and* a shadow on hover *and* a divider — three layers of visual weight. The v2 theme already strips the default border from `MuiCard`. We just need to stop telling individual `MainCard` instances to add it back.

### Files to touch

- `apps/ui/src/ui-component/cards/MainCard.jsx`
- `apps/ui/src/ui-component/cards/SubCard.jsx`
- (A few page-level overrides that pass `border={true}` — search for them.)

### Changes

1. In `MainCard`, remove the default `border` and `borderColor` props. Default `boxShadow` to `'none'`. Reserve borders for explicit use cases (`<MainCard variant="outlined">`).
2. Default the inner `CardHeader` padding to `theme.spacing(2)` (16px), down from 20px.
3. In `SubCard`, drop the secondary border entirely — it's redundant inside a `MainCard`.

### Acceptance

- [ ] Dashboard, sequences, settings pages render with the new look without any per-page changes.
- [ ] Zero "double border" surfaces.
- [ ] No visual regressions on opt-in `variant="outlined"` callouts.

---

## Phase 5 — Refresh marketing site

### Files to touch

- `apps/ui/src/views/pages/landing/index.jsx`
- `apps/ui/src/views/pages/landing/Header.jsx` (hero)
- `apps/ui/src/views/pages/landing/Feature.jsx`
- `apps/ui/src/views/pages/landing/KeyFeature.jsx`
- `apps/ui/src/views/pages/landing/Footer.jsx`
- `apps/ui/src/ui-component/extended/AppBar.jsx`

### Changes

1. **Hero (`Header.jsx`)**: drop `transform: scale(1.7)` on the jukebox. Replace the manual `<img>` with `<Logo variant="hero" />` from `design-system/components/Logo` — that component owns the asset path and sizing. Reduce hero top padding from `mt: 18.75 / 10` to `mt: 6 / 4`. Add a soft animated gradient orb behind (mockup has the CSS).
2. **Two CTAs**: "Create your show — free" (primary, `accent`) + "Watch a live show" (ghost). Today there's only one.
3. **Feature blocks**: replace the rigid 3-up `SubCard` grid in `Feature.jsx` and `KeyFeature.jsx` with alternating left/right blocks (image one side, copy the other). 2 blocks per "screen" instead of 3 cramped.
4. **Drop the icon `Avatar` circles**. Use 44×44 flat icon tiles with a tinted background.
5. **Footer**: switch from solid `secondary.dark` block to dark `bg0`/`#03050a` gradient. 4-column layout: brand+blurb / Product / Community / Company.
6. **AppBar**: enable `backdrop-filter: blur(14px)` always (not just on scroll). The component override in `componentOverrides.js` already does this.

### Acceptance

- [ ] Hero renders crisp at 1×, 2×, and 3× displays. No `scale()` hacks.
- [ ] Lighthouse "Best Practices" still ≥ 90.
- [ ] Cumulative Layout Shift < 0.05 on hero load.

---

## Phase 6 — Sequences page polish

### Files to touch

- `apps/ui/src/views/pages/controlPanel/sequences/index.jsx`
- `apps/ui/src/ui-component/RFSplitButton.jsx`

### Changes

1. Add **pagination** (10 / 25 / 50 / 100) and **column sort**.
2. Add a **density toggle** (Compact / Comfortable / Spacious) that adjusts row padding.
3. Add **filter chips** above the table: All / Active / Hidden / Cooldown.
4. Replace the custom `RFSplitButton` with a standard MUI `ButtonGroup` (Delete / Export) + a kebab `Menu` for "Delete inactive", "Delete all".
5. **Confirm dialogs** for every destructive action. No exceptions.

### Acceptance

- [ ] 100+ sequences renders in < 200ms with pagination active.
- [ ] All destructive actions show a confirm dialog with the count of affected items.
- [ ] No `RFSplitButton` references remain.

---

## Phase 7 — Settings: form-with-submit pattern

The legacy pattern is to save settings on `onBlur` of every field. The v2 pattern uses Formik (already a dep) with an explicit submit and a sticky save bar.

### Files to touch

- `apps/ui/src/views/pages/controlPanel/viewerSettings/*`
- `apps/ui/src/views/pages/controlPanel/accountSettings/*`
- (Add) `apps/ui/src/ui-component/forms/StickyFormBar.jsx`

### Changes

1. Wrap each settings page in a `<Formik>` with the existing field config.
2. Add a `<StickyFormBar>` that appears at the bottom only when `formik.dirty`. Buttons: "Save changes" (primary) / "Discard" (ghost).
3. Show inline field-level errors via Formik's `meta.error`.
4. On save success, show a success snackbar and reset `formik.dirty`.
5. Block route navigation when dirty (use a `useBlocker` hook with a confirm dialog).

### Acceptance

- [ ] No field saves on blur.
- [ ] Discard reverts to last-saved values.
- [ ] Closing the tab with unsaved changes triggers the browser's native warning.

---

## Phase 8 — Command palette (⌘K)

### Files to touch

- (Add) `apps/ui/src/ui-component/CommandPalette/index.jsx`
- (Add) `apps/ui/src/ui-component/CommandPalette/useCommands.js`
- `apps/ui/src/layout/MainLayout/index.jsx` — mount the palette globally

### Changes

1. Build a global modal triggered by ⌘K / Ctrl+K (also from the topbar search chip).
2. Source commands from three buckets: **Navigation** (every menu item), **Sequences** (live data from the existing query), **Actions** (Play next / Pause / Toggle voting / etc.).
3. Fuzzy-match using `fuse.js` (small, single-purpose dep — bring it in only if needed) or a simple substring filter to start.
4. Keyboard navigation: ↑↓ to move, ↵ to select, Esc to close.

### Acceptance

- [ ] ⌘K opens the palette from any page.
- [ ] Typing "carol" surfaces the "Carol of the Bells" sequence.
- [ ] Selecting a sequence navigates to it; selecting an action runs it.

---

## Phase 9 — Empty states & skeletons sweep

For each page with async data: image hosting, shows map (filtered to no results), sequences (new account), dashboard (no show running), Ask Wattson (no history).

### Pattern

```jsx
<EmptyState
  icon={<IconPlaylist size={48} />}
  title="No sequences yet"
  description="Add your first sequence to get the show running."
  cta={{ label: 'Add sequence', onClick: ... }}
/>
```

The component lives at `apps/ui/src/ui-component/EmptyState.jsx` (build it during this phase). Skeleton loaders for tables and cards already partially exist (`DashboardStatsSkeleton`); standardize them.

---

## Phase 10 — Delete legacy

Once all control-panel pages render correctly under v2 (i.e. there are
no remaining Berry-only theme key references):

1. In `apps/ui/src/App.jsx`, swap `import LegacyTheme from './themes'`
   to `import ThemeCustomization from './design-system/theme'`.
2. In `apps/ui/src/routes/LoginRoutes.jsx`, drop the `<V2Theme>`
   override around the route element (no longer needed — the global
   default is v2).
3. Delete `apps/ui/src/themes/` and `apps/ui/src/assets/scss/_themes-vars.module.scss` + `_theme1..6.module.scss`.
4. Remove the `presetColor` config from `useConfig` (no more 6 preset themes — we ship one identity).
5. Move `apps/ui/src/design-system/theme/` to `apps/ui/src/themes/` (so the eventual import path is `from './themes'` again — clean).
6. **Delete the Berry-template logo leftovers**:
   - `apps/ui/src/assets/images/logo.svg`
   - `apps/ui/src/assets/images/logo-dark.svg`
   - `apps/ui/public/favicon.svg`  ← replace with a favicon derived from `public/rf-icon.png`
   Then `git grep "logo.svg\|logo-dark.svg\|favicon.svg"` to confirm zero references remain. All real logo placements should go through `<Logo />` or `<LogoMark />`.

### Acceptance

- [ ] `git grep -r "themes-vars\|theme1\.module"` returns zero hits.
- [ ] No references to legacy `presetColor` remain.
- [ ] Theme directory has a single source of truth.

---

## How to QA each phase

Local:
```bash
cd apps/ui
npm run dev
```

Per-phase smoke tests live in `tests/e2e/regression/`. Don't merge a phase without the regression suite being clean.

---

## Rollback

Every phase is reversible by:

- **Phase 1**: in `LoginRoutes.jsx`, unwrap the `<V2Theme>` around the route element. Public surfaces fall back to the global Berry default. The v2 token files and theme directory stay on disk; they're additive.
- **Phases 2–9**: revert the per-page commits. Token files and v2 theme stay; they're additive.
- **Phase 10**: unmerge the deletion commit; the legacy theme is in git history forever.

If a production issue surfaces on a v2-rendered surface, the rollback is one line — drop the `<V2Theme>` wrapper in `LoginRoutes.jsx` and redeploy.
