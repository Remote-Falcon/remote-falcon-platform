# Remote Falcon Style Guide

The visual and interaction standards for every Remote Falcon UI surface we own — marketing, control panel, auth, and admin tools. Public viewer pages are out of scope: each show is custom-themed by its owner.

If a value isn't documented here or codified in a token file under [`src/design-system/tokens/`](src/design-system/tokens/), it doesn't exist.

---

## 1. Identity

Remote Falcon is **navy + amber + red**, dark by default. The product is used at night, looking at lights, so dark surfaces feel native. Light mode is first-class — the toggle is a top-level affordance and the user's choice persists across reloads.

Three colors carry meaning:

- **Amber** — the warm primary CTA. *"Press here to start the show."*
- **Navy** — the cool brand foundation. Surfaces, supporting buttons, brand emphasis.
- **Red** — the live-state highlight. *"Show is live", "now playing"*, festive accents.

Nothing else gets to be loud.

---

## 2. Voice

- **Direct.** "Let your viewers take control."
- **Specific.** Name the feature, the action, the result. Avoid abstract claims.
- **Restrained.** A page with three accent colors looks designed; a page with seven looks frantic.

---

## 3. Brand assets

| Asset | Path | Use |
|---|---|---|
| RF monogram | `public/rf-icon.png` | App icon mark — sidebar header, marketing nav, favicon, any 1:1 logo placement |
| RF wordmark | `public/jukebox.png` | Marketing hero, splash/loading states, large brand placements |

Two helper components handle every placement:

- **`<LogoMark size={n} />`** — monogram alone. Default 28px. Use in chips, version stamps, compact rails.
- **`<Logo variant="lockup" />`** — monogram + "Remote Falcon" wordmark side-by-side. Use in the marketing nav, sidebar header, footer, auth shell.
- **`<Logo variant="hero" />`** — full neon jukebox image. Use in the marketing hero only.

Standard sizings:

| Surface | Mark | Wordmark | Form |
|---|---|---|---|
| Marketing AppBar (sticky) | 72px | 22px | Lockup |
| Auth shell brand panel | 72px | 22px | Lockup |
| Footer | 32–64px | 18–22px | Lockup |
| Inline (chips, version stamps) | 16–20px | — | Mark only |

---

## 4. Typography

**Sans:** Inter (400, 500, 600, 700, 800)
**Mono:** JetBrains Mono (400, 500) — code blocks, kbd hints, version stamps

### Scale

1.25 modular ratio anchored at 16px body:

`12 → 14 → 16 → 18 → 22 → 28 → 36 → 44 → 56 → 72`

### Roles

| Role | Size / Line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| display | 72px / 1.05 | 700 | -0.03em | Hero only |
| h1 | 36px / 1.10 | 700 | -0.02em | Page heading |
| h2 | 24px / 1.20 | 700 | -0.015em | Section heading |
| h3 | 18px / 1.30 | 600 | 0 | Subsection |
| h4 | 16px / 1.40 | 600 | 0 | Card title |
| body | 15px / 1.6 | 400 | 0 | Default body |
| bodySm | 13px / 1.5 | 400 | 0 | Secondary text |
| label | 12px / 1.2 | 600 | 0.06em | UPPERCASE labels |
| caption | 12px / 1.4 | 400 | 0 | Help text |

Components reference roles, not raw sizes. Roles live in [`src/design-system/tokens/typography.js`](src/design-system/tokens/typography.js).

---

## 5. Color palette

### Brand

| Color | Anchor | Light variant | Dark-mode primary | Other steps |
|---|---|---|---|---|
| **Navy** (primary) | `#16595a` (500) | `#e3ebeb` (50) · `#8bacad` (200) | `#1f7778` (600) | `#135152` (700) · `#0c3e3f` (800) |
| **Amber** (CTA) | `#c77e23` (500) | `#f8f0e5` (100) · `#e3bf91` (200) | — | `#c1761f` (700) · `#b36115` (800) |
| **Red** (live state) | `#ef2b3d` (500) | `#ff8a8a` (300) | — | `#d61f30` (600) · `#a8182a` (700) · `#7a0f1c` (900) |

Red also has a glow filter for the neon "show is live" effect:

```css
filter: drop-shadow(0 0 8px rgba(239,43,61,0.55))
        drop-shadow(0 0 24px rgba(239,43,61,0.30));
```

### Neutrals (dark — default)

| Token | Value | Use |
|---|---|---|
| `bg0` | `#01080d` | Page |
| `bg1` | `#010f17` | Shell, sidebar |
| `bg2` | `#02131d` | Cards |
| `bg3` | `#0a1828` | Elevated cards, popovers, inputs |
| `text1` | `#ffffff` | Primary text |
| `text2` | `#c2c8d4` | Body text |
| `text3` | `#8492c4` | Muted, navy-cast |
| `text4` | `#525a6e` | Disabled, placeholders |
| `line` | `rgba(255,255,255,0.07)` | Dividers, subtle borders |
| `lineStrong` | `rgba(255,255,255,0.14)` | Field borders, prominent dividers |

### Neutrals (light)

| Token | Value |
|---|---|
| `bg0` | `#ffffff` |
| `bg1` | `#f8fafc` |
| `bg2` | `#ffffff` |
| `bg3` | `#f1f5f9` |
| `text1` | `#0f172a` |
| `text2` | `#334155` |
| `text3` | `#64748b` |
| `text4` | `#94a3b8` |
| `line` | `rgba(15,23,42,0.08)` |
| `lineStrong` | `rgba(15,23,42,0.16)` |

### Semantic (independent from brand)

| Token | Value | Meaning |
|---|---|---|
| `success` | `#22c55e` | Success states, "live now" pin |
| `warning` | `#f59e0b` | Warning, "scheduled" pin |
| `danger` | `#ef4444` | Destructive actions, validation errors |
| `info` | `#22d3ee` | Informational |

`semantic.danger` is for destructive intent; brand `red.500` is for warmth and holiday meaning. Don't conflate.

---

## 6. Spacing

8-point scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72 / 96 / 128`

Surface defaults:

| Surface | Padding |
|---|---|
| Card | 20 |
| Section (vertical) | 80 |
| Button | 12 / 20 |
| Input | 12 / 14 |
| Marketing nav | 12 / 32 (min-height 96) |

---

## 7. Radius

`xs 4 / sm 8 / md 12 / lg 16 / xl 24 / pill 999`

| Surface | Radius |
|---|---|
| Buttons | `md` |
| Inputs | `md` |
| Cards | `lg` |
| Popups, sheets | `lg` |
| Pills, badges, status chips | `pill` |
| Avatars | `pill` |

---

## 8. Elevation

Three-level shadow scale (dark; light values in [`tokens/shadows.js`](src/design-system/tokens/shadows.js)):

| Token | Value |
|---|---|
| `subtle` | `0 1px 2px rgba(0,0,0,0.30), 0 1px 0 rgba(255,255,255,0.02) inset` |
| `medium` | `0 6px 18px rgba(0,0,0,0.40)` |
| `elevated` | `0 20px 50px rgba(0,0,0,0.55)` |

CTA-specific glows:

| Token | Value |
|---|---|
| Amber rest | `0 6px 20px rgba(199,126,35,0.30)` |
| Amber hover | `0 8px 28px rgba(199,126,35,0.45)` |
| Red live ring | `0 0 0 1px rgba(239,43,61,0.45), 0 10px 40px rgba(239,43,61,0.25)` |

**Pick one delineator per surface.** Borders, shadows, and dividers each cost attention. Don't stack all three.

---

## 9. Motion

| Speed | Duration | Use |
|---|---|---|
| `fast` | 150ms | Hover, focus, micro-interactions |
| `base` | 250ms | Theme swaps, panel transitions |
| `slow` | 450ms | Entrance animations, hero |

Easing: `cubic-bezier(0.4, 0, 0.2, 1)` for everything.

**Animate what the user changed.** A sequence reordered, a panel opened, a vote cast, a show going live. Don't animate decoration.

---

## 10. Iconography

- Style: line, 2px stroke, rounded caps and joins
- Sizes: 16 (inline) · 18 (nav) · 20 (controls) · 24 (section)
- Color: inherits `text2` resting, `text1` on hover/active

For decorative icon tiles in feature blocks: 44×44 flat squares with `r-md` radius, tinted background at 14% with the brand color, foreground icon at the brand color.

---

## 11. Component primitives

### Buttons

| Variant | Use | Treatment |
|---|---|---|
| Primary | Main CTA | `amber.500` fill, white text, `r-md` radius, amber-glow shadow, `translateY(-1px)` on hover |
| Ghost | Secondary, in-form alternates | Transparent, `lineStrong` border, `text1` text, fast bg-tint hover |
| Block | Full-width form actions | Either variant, `width: 100%`, 14px vertical padding |

### Cards

- Surface: `bg2`, `lg` radius, `shadow-medium`
- No default border — use `variant="outlined"` for explicit callouts only
- Header padding: 16px

### Form fields

- Background: `bg3`
- Border: `lineStrong` resting, `navy.600` on focus
- Radius: `r-md`
- Padding: 12 / 14
- Label: 13px, `500` weight, `text2` resting
- Error: `semantic.danger` border + helper text

### Status pills

- `pill` radius, 6/14 padding
- 12px `label` role (UPPERCASE, 600 weight, 0.06em letter-spacing)
- Background: brand-color mix at 14%
- Border: brand-color mix at 28%

### Popups

- `bg2` surface, `lg` radius, `shadow-elevated`
- 14px arrow pointer when anchored to a target
- Mobile (< 720px): bottom-sheet pattern, no arrow, full-width edge-to-edge

---

## 12. Theme behavior

- Dark default. Light first-class.
- Toggle is reachable on every public surface and the control-panel topbar.
- User preference persists via localStorage.
- Theme switching is **live** — no page reload, viewport state preserved.
- Light mode is held to the same polish standard as dark, never an afterthought.

---

## 13. Accessibility

- Color contrast meets WCAG AA in both themes.
- Every interactive element is keyboard-reachable.
- Focus rings: `navy.600` outline, 2px stroke, 2px offset.
- Status is communicated via text or icon, not color alone.
- Pins, badges, and other color-coded elements include a text or shape variant.

---

## 14. Anti-patterns

- Hardcoded hex values, magic numbers for spacing or radius — **review blocker**.
- Border + shadow + divider stacked on the same surface.
- Multiple primary CTAs on one screen.
- Animating decoration (shimmers, pulses on non-interactive elements without status meaning).
- More than three accent colors visible at once.
- Skipping the token layer ("just this once").

---

## Source of truth

The values in this guide come from token files under [`src/design-system/tokens/`](src/design-system/tokens/):

- `colors.js` — brand, neutrals, semantic
- `typography.js` — fonts, scale, roles
- `spacing.js` — 8-point scale
- `radius.js`
- `shadows.js`
- `motion.js`
- `breakpoints.js`

If you need a value, import the token. Don't redefine it.
