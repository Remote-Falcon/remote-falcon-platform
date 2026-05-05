# Remote Falcon — Design System

**Status:** v2 (in migration). The legacy theme under `src/themes/` is still active; this system lives alongside it under `src/design-system/` and rolls in over the phases described in [`MIGRATION.md`](./MIGRATION.md).

This document is the source of truth for visual & interaction design across:
- The marketing site (`src/views/pages/landing/`)
- The control panel (`src/views/pages/controlPanel/` + `src/layout/MainLayout/`)

Everything here maps 1:1 to the token files in `src/design-system/tokens/`. **If a value isn't in a token file, it doesn't exist.**

---

## Principles

1. **Modernize the brand, don't replace it.** Remote Falcon's identity is the falcon mark, the brand blue (`#2196f3`), and the brand purple (`#7c4dff`/`#673ab7`). All of those carry forward. v2 changes the *surfaces* around them — typography, spacing, shadows, radius, density — not the brand itself.
2. **Tokens, not magic numbers.** Every spacing, color, radius, and shadow comes from a named token. Hardcoded `#hex` values, `borderRadius: 4`, or `boxShadow: '0 2px 8px ...'` are review blockers.
3. **Less is more visual weight.** Borders, shadows, and dividers each cost attention. Pick one to delineate a surface, not all three.
4. **Restraint scales.** A page with three accent colors looks designed; a page with seven looks frantic. Brand blue is the primary CTA color. Brand purple is the secondary accent. Amber is *only* for live-state UI ("now playing", focused row, "live" badges). Nothing else gets to be loud.
5. **Motion is communication, not decoration.** Animate what the user changed (a sequence reordered, a panel opened). Don't animate decoration.
6. **Dark default, light first-class.** Dark mode is the default — the product is used at night, looking at lights. But the theme toggle is a top-level affordance on every surface, and the user's choice persists across reloads. Light mode must look polished, not like a dark-mode afterthought.
7. **Power users deserve speed.** Keyboard navigation, command palette, dense data views, bulk actions. The control panel is operated, not browsed.

---

## Brand assets

These ship in `apps/ui/src/assets/images/` today and stay. **Do not rebrand or replace these without a design lead's sign-off.**

| Asset | Path | Use |
|---|---|---|
| **Falcon icon mark** | `assets/images/rf-icon.svg` | Sidebar logo, favicon, any 1:1 logo placement |
| Falcon icon (raster) | `assets/images/rf-icon.png`, `rf-icon-small.png` | Anywhere SVG isn't supported (rare) |
| Wordmark logo (light) | `assets/images/logo.svg` | Marketing site nav on light bg |
| Wordmark logo (dark) | `assets/images/logo-dark.svg` | Marketing site nav on dark bg |
| Hero image | `assets/images/landing/full-jukebox-1301x1041.png` | Landing hero |
| Hero background | `assets/images/landing/header-bg.jpg` | Optional layered hero bg |
| "WL" mascot mark | `assets/images/WL.png` | Community / Winter Lights references |

**Rules**:
- Always pair the falcon mark with a brand-blue→brand-purple gradient backdrop when displayed at small sizes (sidebar, nav). Don't put it on a flat amber background — that breaks brand.
- The hero jukebox image is preserved through the migration. Phase 4 of [`MIGRATION.md`](./MIGRATION.md) replaces the `transform: scale(1.7)` hack with proper responsive sizing — the asset itself stays.
- Favicon (`public/favicon.svg` + `public/rf-icon.png`) is unchanged.
- When you need a new branded asset, derive it from the falcon mark or the existing color pair.

---

## Tokens

### Brand colors — preserved from the existing palette

| Token | Hex | Usage |
|---|---|---|
| `brand.500` | `#2196f3` | **Primary CTA**, links, brand anchor (existing primary blue) |
| `brand.700` | `#1565c0` | Hover state for primary CTA (existing $primary800) |
| `secondary.500` (dark) | `#7c4dff` | Secondary CTA, brand purple in dark mode (existing $darkSecondaryMain) |
| `secondary` (light)    | `#673ab7` | Same role in light mode (existing $secondaryMain) |
| `accent.500` | `#f5a524` | **Live-state only** — now-playing badge, focused row marker, "live" indicators |
| `cyan.400` | `#22d3ee` | Charts (secondary series), info badges |
| `pink.400` | `#f472b6` | Brand gradients only |

**Rule:**
- Primary CTAs are always `brand` (blue). Secondary CTAs are `secondary` (purple). These are the historic Remote Falcon colors and they stay.
- `accent` (amber) is the "lights are on" highlight — reserve for things that should evoke a stage light. The "Now playing" art, the upcoming-vote winner row, the "live" pill on the marketing eyebrow. **Never** a generic primary CTA.
- `cyan`/`pink` show up only inside data viz or branded gradients.

### Dark surfaces — preserved from the existing navy/indigo family

| Token | Hex | Maps to legacy | Usage |
|---|---|---|---|
| `bg0` | `#0b1029` | (deeper variant) | Page background |
| `bg1` | `#111936` | `$darkPaper` | App shell, sidebar |
| `bg2` | `#1a223f` | `$darkBackground` | Cards, default surface |
| `bg3` | `#29314f` | `$darkLevel1` | Elevated cards, popovers, inputs |
| `text1` | `#f5f7fb` | — | Primary text |
| `text2` | `#c2c8d4` | — | Secondary text |
| `text3` | `#8590ad` | — | Muted, labels, captions (tuned for navy bg) |
| `text4` | `#525a6e` | — | Hints, placeholders, disabled |
| `line` | `rgba(255,255,255,0.07)` | — | Default divider |
| `lineStrong` | `rgba(255,255,255,0.14)` | — | Hover/focused divider, prominent borders |

Light mode mirrors this with corresponding inverts (see `tokens/colors.js`). A component must work in both modes — never `color: '#fff'`, always `theme.palette.text.primary`.

### Semantic

| Token | Hex | Usage |
|---|---|---|
| `success` | `#22c55e` | "Active", positive trends |
| `warning` | `#f59e0b` | "Cooldown", non-blocking issues |
| `danger` | `#ef4444` | Destructive actions, errors |
| `info` | `#22d3ee` | Neutral notifications |

### Radius

```
xs: 4   — small accents, ticks
sm: 8   — text inputs, small badges
md: 12  — buttons, standard cards (default)
lg: 16  — large cards, modals
xl: 24  — hero/marketing visuals
pill    — chips, badges, tag pills
```

**Rule:** Buttons and cards are `md` (12). Inputs are `sm` (8). The legacy `borderRadius: 4` looks like a 2018 admin template — don't reach for `xs` for general surfaces.

### Shadows (3 levels)

```
subtle    — resting state for floating elements
medium    — hover state, dropdown menus, tooltips
elevated  — modals, command palette, popovers
glow      — accent emphasis (CTAs, "now playing" art)
```

**Rule:** Cards do **not** have a default shadow. Shadows announce a state change (hover) or a layer above the page (modal, popover). The legacy `z1`–`z24` ladder is gone. Don't rebuild it.

### Type scale (Inter, 1.25 ratio)

| Role | Size | Weight | Usage |
|---|---|---|---|
| `display` | 72 / 1.05 | 700 | Marketing hero **only** |
| `h1` | 36 / 1.10 | 700 | Page titles |
| `h2` | 24 / 1.20 | 700 | Section titles |
| `h3` | 18 / 1.30 | 600 | Card titles, dialog titles |
| `h4` | 16 / 1.40 | 600 | Subheadings |
| `body` | 15 / 1.6 | 400 | Default body text |
| `bodySm` | 13 / 1.5 | 400 | Dense data, captions |
| `label` | 12 / 1.2 | 600 + UPPERCASE | Stat labels, section eyebrows |
| `caption` | 12 / 1.4 | 400 | Hints, metadata |

**One typeface.** Inter for everything visible. JetBrains Mono only for code blocks and the `kbd` keyboard hint. Drop the legacy Poppins/Roboto switch.

### Motion

| Token | Duration | Usage |
|---|---|---|
| `fast` | 150ms | Hover, focus, button press |
| `base` | 250ms | Drawer collapse, modal open |
| `slow` | 450ms | Marketing reveals, staggered lists |

Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard). Use this for 95% of transitions. Stagger multi-item reveals at 80ms (`stagger.normal`).

### Spacing

4px base unit. Use `theme.spacing(n)` — not magic strings.

```
xs: 4    sm: 8    md: 12    lg: 16
xl: 24   2xl: 32  3xl: 48   4xl: 64   5xl: 96
```

---

## Do & Don't

### Color

✅ **Do**
```jsx
sx={{ color: theme.palette.text.muted }}
sx={{ bgcolor: theme.palette.surfaces.bg2 }}
sx={{ borderColor: theme.palette.surfaces.line }}
```

❌ **Don't**
```jsx
sx={{ color: '#7e8699' }}                        // hardcoded
sx={{ bgcolor: 'grey.300' }}                     // legacy MUI grey ramp
sx={{ borderColor: 'rgba(255,255,255,0.06)' }}   // bypasses tokens
```

### Cards

✅ **Do**
```jsx
<Card>
  <CardHeader title="Sequences" />
  <CardContent>...</CardContent>
</Card>
```
The new theme renders Card with no border and no shadow by default. Lean on the surface color difference (`bg2` on `bg0`) for separation.

❌ **Don't**
```jsx
<MainCard sx={{ border: '1px solid', borderColor: 'primary.200', boxShadow: 'z8' }}>
```
This was the `MainCard` pattern under the old theme — three layers of visual weight on top of each other. Pick one.

### Buttons

✅ **Do**
```jsx
<Button variant="contained" color="secondary">Create your show →</Button>  {/* primary CTA */}
<Button variant="outlined">Cancel</Button>                                  {/* ghost */}
<Button color="error">Delete sequence</Button>                              {/* destructive */}
```

❌ **Don't**
- Use `variant="text"` as a primary CTA — too easy to miss.
- Mix size variants in one row (`size="large"` + `size="small"` together is the `RFSplitButton` mistake).
- Manually override `background` and `&:hover` on every button — change the theme instead.

### Focus states

✅ **Do** — leave them alone. The base CssBaseline override gives every focusable element a 2px accent outline at 2px offset. Never `outline: none`.

❌ **Don't** rely on `:hover` for keyboard users. Hover ≠ focus.

### Spacing

✅ `theme.spacing(2)`, `gap: theme.spacing(3)`, semantic gaps (`density.normal`).
❌ `marginBottom: '16px'`, `mt: 2.5`, `pl: -3`.

### Icons

✅ **Do**
- Pick **one** family. The control panel uses `@tabler/icons-react`; keep it.
- Use 20px in nav, 24px in action buttons, 16px inline with text.
- Pair every icon button with an `aria-label` or `<Tooltip>`.

❌ **Don't**
- Mix `@mui/icons-material` and `@tabler/icons-react` on the same screen.
- Use a colored icon background (`Avatar` circles around feature icons) for the marketing site — that's the giveaway "Berry template" look.

### Forms & saving

✅ **Do** — use a form container with explicit submission. When fields are dirty, show a sticky "Save / Discard" footer.

❌ **Don't** save on `onBlur`. Users have no mental model of what changed and no way to undo.

---

## Theme mode (light / dark)

Both surfaces — marketing site and control panel — support light and dark mode. The user's choice persists across reloads.

### How it works

- The existing `ConfigContext` (at `src/contexts/ConfigContext.jsx`) already persists `navType: 'light' | 'dark'` to localStorage under the key `rf-config` via the `useLocalStorage` hook. **No new persistence layer is needed.**
- Toggling calls `onChangeMenuType('light' | 'dark')` from `useConfig()`.
- The v2 ThemeProvider (`src/design-system/theme/index.jsx`) reads `navType` from `useConfig()` on every render — so a toggle anywhere in the tree updates the entire app instantly, including the marketing site.
- Default is `dark` (matches `src/config.jsx`). New users see dark mode; returning users see whatever they last picked.

### The toggle component

`src/design-system/components/ThemeToggle.jsx` is the canonical toggle. Drop it anywhere under `<ConfigProvider>`:

```jsx
import ThemeToggle from 'design-system/components/ThemeToggle';

<ThemeToggle />                 {/* icon-only, default */}
<ThemeToggle variant="rail" />  {/* compact icon + label, for sidebar footer */}
```

### Where to place the toggle

**Marketing site** — to the *left* of the "Sign in" button in the nav (`src/views/pages/landing/Header.jsx` or `src/ui-component/extended/AppBar.jsx`). On mobile, it stays visible — never collapses into a hamburger menu.

**Control panel** — two places:
1. The topbar (`src/layout/MainLayout/Header/index.jsx`), to the *left* of the notifications icon.
2. The sidebar footer (above the collapse toggle) using `variant="rail"` — gives a labeled toggle when the rail is expanded, icon-only when collapsed.

### Rules

- The toggle is **always visible** on every screen of every surface. Never gated behind a settings menu.
- Sun icon = "you are in dark mode, click to go light." Moon icon = the reverse. (Matches `useConfig().navType`.)
- The toggle **must** survive Auth, ProfileSection, and other personalization changes — it's an app-level affordance, not a user-account preference.
- Persistence is automatic via `useLocalStorage('rf-config', …)`. **Don't roll your own.**

### Designing for both modes

Every component must work in both modes. This is enforced by:
- Using `theme.palette.text.primary` (not `'#fff'`) for text.
- Using `theme.palette.surfaces.bg2` (not the dark hex) for cards.
- Using `theme.palette.divider` (not `rgba(255,255,255,0.07)`) for borders.

The token files in `src/design-system/tokens/colors.js` export both `dark` and `light` neutral ramps — `neutralsFor(mode)` returns the right one automatically. If a component renders correctly in dark mode but breaks in light, you've hardcoded a value somewhere — fix it at the source.

---

## Accessibility

- **Contrast:** all text must clear WCAG AA (4.5:1 normal, 3:1 large). The dark `text2` on `bg2` combination is the floor — anything dimmer should be reserved for non-essential metadata.
- **Focus visible:** every focusable element shows the accent outline. CssBaseline handles this; don't override.
- **Keyboard:** every flow that's mouse-actionable must be keyboard-actionable. The command palette (`⌘K`) is a top-level shortcut.
- **Motion:** respect `prefers-reduced-motion` — wrap reveals in a check that disables transforms when set.
- **Color is never the only signal.** A status badge says "Active" *and* uses green; a destructive button says "Delete" *and* uses red.

---

## When in doubt

The interactive mockup at [`docs/design-system/mockup.html`](./docs/design-system/mockup.html) shows every token applied in context across three screens (Marketing / Control Panel / Tokens). Open it locally to feel the system before introducing a new pattern.

If you can't find a token for what you need to build, **add a token** — don't bypass the system. Open a discussion in `#ui` first.
