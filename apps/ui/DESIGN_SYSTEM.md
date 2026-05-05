# Remote Falcon — Design System

**Status:** v2 (in migration). The legacy theme under `src/themes/` is still active; this system lives alongside it under `src/design-system/` and rolls in over the phases described in [`MIGRATION.md`](./MIGRATION.md).

This document is the source of truth for visual & interaction design across:
- The marketing site (`src/views/pages/landing/`)
- The control panel (`src/views/pages/controlPanel/` + `src/layout/MainLayout/`)

Everything here maps 1:1 to the token files in `src/design-system/tokens/`. **If a value isn't in a token file, it doesn't exist.**

---

## Principles

1. **Modernize the brand, don't replace it.** Remote Falcon's identity is **navy + amber + red** (the deployed `theme3` preset, which `src/config.jsx` sets as the default). All of those carry forward. v2 changes the *surfaces* around them — typography, spacing, shadows, radius, density — not the brand itself.
2. **Tokens, not magic numbers.** Every spacing, color, radius, and shadow comes from a named token. Hardcoded `#hex` values, `borderRadius: 4`, or `boxShadow: '0 2px 8px ...'` are review blockers.
3. **Less is more visual weight.** Borders, shadows, and dividers each cost attention. Pick one to delineate a surface, not all three.
4. **Restraint scales.** A page with three accent colors looks designed; a page with seven looks frantic. **Amber** is the warm primary CTA — "press here to start the show." **Navy** is the cool brand foundation — surfaces, supporting buttons, brand emphasis. **Red** is the live-state highlight — "show is live", "now playing", festive accents. Nothing else gets to be loud.
5. **Motion is communication, not decoration.** Animate what the user changed (a sequence reordered, a panel opened). Don't animate decoration.
6. **Dark default, light first-class.** Dark mode is the default — the product is used at night, looking at lights. But the theme toggle is a top-level affordance on every surface, and the user's choice persists across reloads. Light mode must look polished, not like a dark-mode afterthought.
7. **Power users deserve speed.** Keyboard navigation, command palette, dense data views, bulk actions. The control panel is operated, not browsed.

---

## Brand assets

There are exactly **two** brand-correct logo assets in the repo today. Several other files look like brand assets but are actually leftover from the Berry admin template the app was originally scaffolded from — they should be cleaned up during migration, not used.

### Brand-correct (use these)

| Asset | Path | What it is | Use |
|---|---|---|---|
| **RF monogram** | `public/rf-icon.png`, `src/assets/images/rf-icon.png`, `src/assets/images/rf-icon-small.png` | Neon "RF" glowing red on a dark sphere | App icon mark — sidebar header, marketing nav, favicon, any 1:1 logo placement |
| **REMOTE FALCON wordmark** | `public/jukebox.png`, `src/assets/images/landing/full-jukebox-1301x1041.png` | The iconic neon jukebox arch with "REMOTE FALCON" wordmark below | Marketing hero, marketing about page, splash/loading states |

The two PNG variants of the wordmark are the same image at different resolutions — `public/jukebox.png` for in-app/UI use, the `landing/full-jukebox-*.png` for the marketing hero where higher resolution matters.

### Don't use these — Berry template leftovers

| Asset | Path | What it actually is |
|---|---|---|
| Berry wordmark | `src/assets/images/logo.svg`, `logo-dark.svg` | A "BERRY" wordmark with a stylized berry icon, in `#2196f3` blue and `#673ab7` purple — never updated for Remote Falcon |
| Berry favicon | `public/favicon.svg` | Same Berry icon, not the RF brand. The deployed favicon should be replaced with the RF monogram |
| "Wally's Lights" | `src/assets/images/WL.png` | A community partner/show — **not** a Remote Falcon brand asset |

These should be **deleted** during Phase 10 (Delete legacy) of [`MIGRATION.md`](./MIGRATION.md). Until then, every reference to `logo.svg` / `logo-dark.svg` / `favicon.svg` should be migrated to the brand-correct asset.

### How to use the logos in code

Two helper components are provided:

```jsx
import LogoMark from 'design-system/components/LogoMark';
import Logo     from 'design-system/components/Logo';
```

**`<LogoMark />`** — the RF monogram alone. Defaults to 28px (nav-friendly).

```jsx
<LogoMark />                    // 28px, no glow — sidebar/nav default
<LogoMark size={44} glow />     // 44px with neon halo — hero, footer, splash
<LogoMark size={20} />          // 20px — dense/inline
```

**`<Logo />`** — the lockup (mark + "Remote Falcon" text), or the full neon hero variant.

```jsx
<Logo />                        // mark + "Remote Falcon" wordmark — nav, sidebar header, footer
<Logo variant="hero" />         // full neon REMOTE FALCON jukebox arch — marketing hero only
```

### Logo usage rules

- **Mark color is part of the brand identity.** Never recolor the RF monogram with CSS filters that shift hue, never put it on amber or red backgrounds (kills the glow). Always on a surface darker than `bg1`, or on transparent.
- **Aspect ratio is sacred.** The RF mark is 1:1 (square). The wordmark/jukebox image has its own aspect (~5:4). Never stretch.
- **Minimum sizes.** RF monogram: 20px floor. Wordmark: 240px wide floor — below that, switch to the lockup with text.
- **Clear space.** Pad at least 1× the logo's height around it. Don't crowd with text or borders.
- **The hero variant uses the iconic glow image as-is.** Don't try to recreate it with CSS — the PNG already has the carefully-tuned glow baked in.

---

## Tokens

### Brand colors — drawn from theme3 (the deployed default)

The hex values match `apps/ui/src/assets/scss/_theme3.module.scss`, which is what `src/config.jsx` sets as `presetColor: 'theme3'`. Red is new in v2.

| Token | Hex | MUI role | Usage |
|---|---|---|---|
| `navy.500` | `#16595a` | `primary.main` (light) | Brand anchor — outline buttons, supporting fills, brand text accents |
| `navy.600` | `#1f7778` | `primary.main` (dark) | Same role in dark mode (slightly brighter so navy reads on near-black) |
| `navy.700` | `#135152` | `primary.dark` | Hover state for primary buttons |
| `amber.500` | `#c77e23` | `secondary.main` | **Primary CTA** — "Start free", "Save changes", "Show is live" |
| `amber.700` | `#c1761f` | `secondary.dark` | Hover state for primary CTA |
| `amber.200` | `#e3bf91` | `secondary.light` | Tinted backgrounds, eyebrow pills |
| `red.500` | `#d4332e` | `palette.brand.red.main` | **Live-state only** — "now playing", "live" pills, festive accents |
| `red.700` | `#a02520` | `palette.brand.red.dark` | Hover/pressed state for red badges |

**Rules:**
- **Amber is the primary CTA.** Use `<Button color="secondary">` for the warm "go" buttons across both surfaces. This is the historical Remote Falcon CTA color from `theme3.$secondaryMain` and it stays.
- **Navy is the brand foundation.** Use `<Button color="primary">` for cooler/secondary buttons (Sign in, Cancel, supporting actions). Use `theme.palette.primary.main` for brand emphasis text (the `control` accent in the hero copy is `primary.main` today — that pattern continues).
- **Red is for live state.** The "Show is live" dot, the "Now playing" art glow, the upcoming-vote winner highlight, the eyebrow pulse. **Distinct from `error`** — error is for destructive actions and validation; red is for warmth + presence.
- **No additional accent colors.** Resist adding teal, purple, blue. The brand is three colors. If you need to differentiate something, use surface tier (`bg2` vs `bg3`) or weight (text-1 vs text-3) — not a new hue.

### Dark surfaces — preserved from theme3

The dark mode surfaces match `_theme3.module.scss` exactly, which gives the product its signature near-black "night sky" feel. The brand colors pop against this in a way they wouldn't against pure black.

| Token | Hex | Maps to theme3 | Usage |
|---|---|---|---|
| `bg0` | `#01080d` | (slightly lifted from `$darkBackground` `#010606`) | Page background |
| `bg1` | `#010f17` | `$darkPaper` | App shell, sidebar |
| `bg2` | `#02131d` | `$darkLevel1` | Cards, default surface |
| `bg3` | `#0a1828` | (slightly lighter for elevation) | Elevated cards, popovers, inputs |
| `text1` | `#ffffff` | `$darkTextPrimary` | Primary text |
| `text2` | `#c2c8d4` | — | Secondary text |
| `text3` | `#8492c4` | `$darkTextSecondary` | Muted, labels, captions (note: the navy-cast is intentional — preserves theme3) |
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
<Button variant="contained" color="secondary">Start free →</Button>     {/* primary CTA — amber */}
<Button variant="contained" color="primary">Save</Button>                {/* supporting CTA — navy */}
<Button variant="outlined">Cancel</Button>                                {/* ghost */}
<Button color="error">Delete sequence</Button>                            {/* destructive — red, with confirm */}
```

`color="secondary"` (amber) is the warm primary CTA across the product. `color="primary"` (navy) is the cooler, supporting button — sign in, cancel, save in less prominent spots. **Don't get this backward** — calling MUI's `color="primary"` "the primary CTA" is intuitive but wrong here, because the brand designates amber as the warm "go" color and amber maps to `secondary` in the MUI theme.

For "live" badges and live-state UI, use the `red` brand role:
```jsx
<Box sx={{ bgcolor: 'brand.red.main', borderRadius: 'pill', px: 1.5, py: 0.5 }}>
  ● Live
</Box>
```

❌ **Don't**
- Use `variant="text"` as a primary CTA — too easy to miss.
- Mix size variants in one row (`size="large"` + `size="small"` together is the `RFSplitButton` mistake).
- Manually override `background` and `&:hover` on every button — change the theme instead.
- Use `color="error"` for "live" or "active" badges — that's brand red, not error red.

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
