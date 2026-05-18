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

| # | Phase | Effort | Risk | Status |
|---|---|---|---|---|
| 0 | Land assets | — | none | ✅ shipped |
| 1 | Wire v2 ThemeProvider (became per-route theme split) | ~½ day | low | ✅ shipped |
| 2 | Place `ThemeToggle` on marketing site + control panel | ~½ day | low | 🟡 marketing done · control-panel pending |
| 3 | Migrate the layout shell (`MainLayout`) | 1–2 days | medium | ❌ pending |
| 4 | Replace `MainCard` / `SubCard` patterns | 1 day | low | ❌ pending |
| 5 | Refresh marketing site (landing) | 1–2 days | low | ✅ shipped |
| 6 | Sequences page polish | 1 day | low | ❌ pending |
| 7 | Settings: form-with-submit pattern | 2 days | medium | ❌ pending |
| 8 | Command palette (⌘K) | 1–2 days | low | ❌ pending |
| 9 | Empty states & skeletons sweep | 1 day | low | ❌ pending |
| 10 | Delete legacy theme & SCSS modules | ½ day | low | ❌ pending (gated on 2–9) |

### Bonus work shipped along the way (not in original plan)

- **AuthShell** — split-screen treatment for Login, Register, Forgot/Reset password, Verify email. Marketing AppBar with `variant="auth"` mode (lockup + ThemeToggle only) keeps the brand pinned across `/`, `/signin`, `/signup`.
- **MiscPageShell + legal rewrites** — Privacy Policy and Terms of Service rewritten in plain language to reflect the real stack (PostHog, MailerSend, MapTiler, etc.); Show Ownership page removed; 404 page redesigned with a "spilling jukebox" decoration. Catch-all redirect for unmatched URLs.
- **Landing feature visuals** — four stylized v2 mockups replace the old gradient cards: Jukebox+Voting phones with show brands, code-editor preview with syntax-highlighted HTML/CSS, streets-style map with status pins, GitHub-flavored repo feed.
- **Polish bin** — AppBar opacity bump, scrollbar-gutter stability fix, form-label centering across all OutlinedInputs, per-field spacing, transparent RF icon, footer Support column (Patreon / Ko-fi / Buy Me a Coffee), `MAILER_DEV_BYPASS` env to keep e2e clean, `.dockerignore` exclusion of `.env.local` so dev-only flags can't leak into prod builds.
- **Phase 5 caveat** — the "two CTAs" item from the original Phase 5 plan landed with only one ("Create your show — free"). The "Watch a live show" ghost CTA isn't in. Worth revisiting once the public Shows Map ships and there's something to actually link to.

### Suggested next-up order

1. **Phase 2 control-panel half** (ThemeToggle on `MainLayout/Header` + sidebar footer) — cheap warm-up, ~30 min.
2. **Phase 3 — layout shell** — biggest perceived modernization for signed-in users. Sidebar rail, grouped menu, slim topbar, command-palette trigger placeholder.
3. **Phase 4 — cards** — drop borders/shadows from `MainCard`/`SubCard` defaults. Snowballs the visual upgrade across every dashboard surface for free.
4. **Phase 9 — empty states + skeletons** — small but high-touch; can land alongside or just after 3/4.
5. **Phase 6 — sequences** — table polish (pagination, sort, density, filter chips) + replace `RFSplitButton` with a stock MUI `ButtonGroup` + kebab menu.
6. **Phase 7 — settings forms** — Formik + sticky save bar. Medium risk (touches save behavior).
7. **Phase 8 — command palette** — wire to the trigger Phase 3 added.
8. **Phase 10 — delete legacy** — once nothing references Berry palette keys, swap App.jsx's import to v2 and delete `apps/ui/src/themes/`.

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

### Status

- ✅ **Marketing AppBar** — `<ThemeToggle />` is in `apps/ui/src/ui-component/extended/AppBar.jsx`, visible on every public route (landing, signin, signup, legal, 404). Also kept in the `variant="auth"` AppBar so the toggle is still reachable while logged out.
- ❌ **Control-panel topbar** — `apps/ui/src/layout/MainLayout/Header/index.jsx` doesn't import `ThemeToggle` yet. Drop it next to the notifications icon (left side, before `NotificationSection`).
- ❌ **Control-panel sidebar footer** — `apps/ui/src/layout/MainLayout/Sidebar/index.jsx` doesn't render `<ThemeToggle variant="rail" />`. Add it above wherever the rail-collapse toggle will live (Phase 3).

### What's left

1. **Control-panel topbar**: place `<ThemeToggle />` to the left of `NotificationSection`. Ensure it's reachable at every breakpoint.
2. **Control-panel sidebar footer**: place `<ThemeToggle variant="rail" />` above the rail-collapse toggle (which Phase 3 introduces; for now, just put it at the bottom of the sidebar). Icon-only when collapsed, "Light mode" / "Dark mode" beside the icon when expanded.
3. **Smoke-test the cross-theme toggle** — change theme on landing → sign in → confirm dashboard reflects the new mode without a reload. Both Berry (control panel) and v2 (public) read `navType` from `useConfig()`, so they stay in sync.

### Acceptance

- [x] Toggle on every public surface (landing / signin / signup / legal / 404).
- [ ] Toggle on dashboard / sequences / settings / viewer-page / shows-map.
- [ ] Toggling on the landing page persists when navigating to the control panel and vice versa.
- [x] After page reload, the last-chosen mode is restored (`localStorage('rf-config')`).
- [ ] No flash of unstyled content (FOUC) on initial load — the saved mode is applied before paint.
- [x] Mobile (< 600px): toggle is reachable without opening a menu (already true for the marketing AppBar).

---

## Phase 3 — Migrate the layout shell

The control panel's perceived modernization comes 80% from the shell. The
target shape is documented in [`docs/design-system/mockup.html`](./docs/design-system/mockup.html)
under the `[data-screen="control"]` section — that file is the source of
truth when the prose below is ambiguous.

### Files to touch

- `apps/ui/src/layout/MainLayout/index.jsx`
- `apps/ui/src/layout/MainLayout/Header/index.jsx`
- `apps/ui/src/layout/MainLayout/Sidebar/index.jsx`
- `apps/ui/src/menu-items/controlPanel.jsx` (group items by section)
- `apps/ui/src/store/constant.jsx` — change `drawerWidth` to support collapsed/expanded
- `apps/ui/src/hooks/useConfig.jsx` + `apps/ui/src/contexts/ConfigContext.jsx` — add `sidebarCollapsed` state
- (new) `apps/ui/src/ui-component/PageHead.jsx` — title + meta + right-side actions, used on every signed-in page

### Changes

1. **Sidebar → icon rail.** Replace the fixed 320px drawer with a collapsible rail (72px collapsed → 248px expanded). Persist the state to localStorage via the existing config store. Per the mockup: section labels render only when expanded; rail footer holds `<ThemeToggle variant="rail" />` above a "Collapse / Expand" toggle.
2. **Group menu items.** Update `menu-items/controlPanel.jsx` to nest items under section labels (matching the mockup):
   - *Show* — Dashboard, Sequences, Viewer Page, Templates
   - *Account* — Settings, Image Hosting
   - *Community* — Shows Map
   - *Admin* — admin-role-only items (only rendered when role === 'admin')
3. **Slim the topbar** to 56px. Per the mockup, contents (left → right): breadcrumb trail (`Show / Dashboard`), search-trigger chip (`Search sequences, pages, settings… ⌘K`), `<ThemeToggle />`, what's-new icon, notifications icon, profile avatar. Move legacy localization + customization buttons into an overflow `IconButton`+Menu (or drop entirely — the only locale we ship in is English).
4. **Topbar breadcrumb** derives from the route (e.g. `/control-panel/sequences` → `Show / Sequences`). Pull the label from `menu-items/controlPanel.jsx`'s `title` field.
5. **Page-head component.** Build `<PageHead title="Tonight's show" meta={<>Live · Show <strong>winterlights2026</strong></>} actions={<>...</>} />` per the mockup pattern. Wire into the dashboard first as the validation case; other pages adopt it as part of their phase.
6. **Add command-palette trigger** to the topbar. Wire to a placeholder modal that just logs `cmd-k pressed` — Phase 8 implements the real palette.

### Acceptance

- [ ] Sidebar collapses smoothly (250ms transition) and persists across reloads.
- [ ] All nav items reachable, grouped under sections; admin section gated by role.
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

## Phase 5 — Refresh marketing site _(SHIPPED)_

The landing page rewrite landed in PR #21. Final shape:

- **Hero** — `transform: scale(1.7)` gone. New v2 typography, single amber CTA "Create your show — free", soft gradient orb behind the hero, jukebox at natural size with a subtle drop-shadow.
- **Feature blocks** — `KeyFeature.jsx` is no longer imported (left on disk, dead code; should be deleted in Phase 10). Four alternating left/right blocks live in the new `Feature.jsx`, each with a stylized v2 visual mockup instead of a placeholder gradient card.
- **Icon tiles** — 44×44 tinted tiles, no Avatar circles.
- **Footer** — 4-column layout: Product / Community / Support (Patreon, Ko-fi, Buy Me a Coffee) / Legal. Dark gradient surface, version chip + copyright bottom strip.
- **AppBar** — always-on `backdrop-filter: blur(14px) saturate(150%)`, sticky, ThemeToggle on the right, full nav links + Sign In / Sign Up.

### Outstanding follow-up

- The original plan called for **two** hero CTAs ("Create your show" + "Watch a live show"). We shipped one. Revisit when the public Shows Map ships and there's a real link target.
- `KeyFeature.jsx` is dead code — delete in Phase 10.

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

For each page with async data: image hosting, shows map (filtered to no results), sequences (new account), dashboard (no show running).

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
