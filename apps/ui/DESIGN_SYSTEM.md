# Remote Falcon — Design System

**Status:** v2 (in migration). The legacy theme under `src/themes/` is still active; this system lives alongside it under `src/design-system/` and rolls in over the phases described in [`MIGRATION.md`](./MIGRATION.md).

This document is the source of truth for visual & interaction design across:
- The marketing site (`src/views/pages/landing/`)
- The control panel (`src/views/pages/controlPanel/` + `src/layout/MainLayout/`)

Everything here maps 1:1 to the token files in `src/design-system/tokens/`. **If a value isn't in a token file, it doesn't exist.**

---

## Principles

1. **Tokens, not magic numbers.** Every spacing, color, radius, and shadow comes from a named token. Hardcoded `#hex` values, `borderRadius: 4`, or `boxShadow: '0 2px 8px ...'` are review blockers.
2. **Less is more visual weight.** Borders, shadows, and dividers each cost attention. Pick one to delineate a surface, not all three.
3. **Restraint scales.** A page with three accent colors looks designed; a page with seven looks frantic. Use brand `accent` (amber) for primary CTAs and "what's important right now" — nothing else.
4. **Motion is communication, not decoration.** Animate what the user changed (a sequence reordered, a panel opened). Don't animate decoration.
5. **Dark first.** The product is used at night, looking at lights. Dark mode is the default and the canonical target. Light mode must work, but design decisions break ties toward dark.
6. **Power users deserve speed.** Keyboard navigation, command palette, dense data views, bulk actions. The control panel is operated, not browsed.

---

## Tokens

### Brand colors

| Token | Hex | Usage |
|---|---|---|
| `brand.500` | `#3b5bff` | Links, info, secondary brand surfaces |
| `brand.700` | `#1f37c4` | Hover state for brand surfaces |
| `accent.500` | `#f5a524` | **Primary CTA**, "now playing", focused/selected state |
| `accent.300` | `#ffd28a` | Hover/pressed state of accent |
| `cyan.400` | `#22d3ee` | Charts (secondary series), info badges |
| `pink.400` | `#f472b6` | Gradients only (paired with `accent`) |

**Rule:** A page may use *one* primary action color (always `accent`). `brand` is a supporting role; `cyan`/`pink` show up only inside data viz or branded gradients.

### Neutrals (dark mode)

| Token | Hex | Usage |
|---|---|---|
| `bg0` | `#07090f` | Page background |
| `bg1` | `#0c111c` | App shell, sidebar |
| `bg2` | `#121826` | Cards, default surface |
| `bg3` | `#1a2030` | Elevated cards, popovers, inputs |
| `text1` | `#f5f7fb` | Primary text |
| `text2` | `#c2c8d4` | Secondary text |
| `text3` | `#7e8699` | Muted, labels, captions |
| `text4` | `#525a6e` | Hints, placeholders, disabled |
| `line` | `rgba(255,255,255,0.06)` | Default divider |
| `lineStrong` | `rgba(255,255,255,0.12)` | Hover/focused divider, prominent borders |

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
