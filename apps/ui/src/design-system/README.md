# `design-system/` — engineer quick-start

This directory is the v2 design system for `apps/ui`. It coexists with the legacy `themes/` directory during migration.

## Quick links

- **The rules:** [`../DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md)
- **Pattern cookbook:** [`../docs/design-system/PATTERNS.md`](../../docs/design-system/PATTERNS.md)
- **Migration plan:** [`../MIGRATION.md`](../../MIGRATION.md)
- **Visual reference:** [`../docs/design-system/mockup.html`](../../docs/design-system/mockup.html) — open in a browser

## Layout

```
design-system/
├── components/          ← shared v2 components
│   ├── ThemeToggle.jsx  ← light/dark switcher (uses existing useConfig)
│   ├── LogoMark.jsx     ← RF monogram, sized + with optional neon glow
│   └── Logo.jsx         ← brand lockup (mark + wordmark) and hero variant
├── tokens/              ← framework-agnostic source of truth
│   ├── colors.js        ← navy + amber + red, drawn from the deployed theme3
│   ├── radius.js
│   ├── shadows.js
│   ├── typography.js
│   ├── motion.js
│   ├── spacing.js
│   ├── breakpoints.js
│   └── index.js
└── theme/               ← MUI adapter (consumes tokens, builds the theme)
    ├── palette.js
    ├── typography.js
    ├── componentOverrides.js
    └── index.jsx        ← drop-in <ThemeCustomization>
```

## Logos

```jsx
import LogoMark from 'design-system/components/LogoMark';
import Logo     from 'design-system/components/Logo';

<LogoMark />                  // 28px RF monogram — nav, sidebar
<LogoMark size={44} glow />   // with neon halo — hero, splash, auth
<Logo />                      // mark + "Remote Falcon" lockup
<Logo variant="hero" />       // full neon REMOTE FALCON wordmark — hero only
```

Wraps `apps/ui/public/rf-icon.png` and `apps/ui/public/jukebox.png` (the only brand-correct logo assets in the repo). The Berry-template SVGs at `src/assets/images/logo.svg` / `logo-dark.svg` / `public/favicon.svg` are leftovers and should never be referenced.

## Theme toggle

```jsx
import ThemeToggle from 'design-system/components/ThemeToggle';

<ThemeToggle />                 // icon-only — for topbar / nav
<ThemeToggle variant="rail" />  // labeled — for sidebar footer
```

Uses the existing `useConfig()` hook, so persistence (localStorage `rf-config`) is automatic. Drop it anywhere under `<ConfigProvider>`.

## Using tokens directly

```jsx
import { brand, accent, neutralsFor } from 'design-system/tokens/colors';
import { radius } from 'design-system/tokens/radius';
import { shadowsFor } from 'design-system/tokens/shadows';

const dark = neutralsFor('dark');
const sh = shadowsFor('dark');

// In sx prop
<Box sx={{
  bgcolor: dark.bg2,
  borderRadius: `${radius.md}px`,
  boxShadow: sh.subtle
}} />
```

## Using the MUI theme

Most of the time you should reach for the theme, not raw tokens. The MUI adapter exposes everything via the standard `theme.*` API plus a few v2-only extensions.

```jsx
import { useTheme } from '@mui/material/styles';

const theme = useTheme();

theme.palette.primary.main          // brand-500 (#3b5bff)
theme.palette.secondary.main        // accent-500 (#f5a524) — your CTA color
theme.palette.text.primary          // text-1
theme.palette.text.muted            // text-3 (custom — v2 only)
theme.palette.surfaces.bg2          // card surface (custom — v2 only)
theme.palette.surfaces.line         // hairline divider (custom — v2 only)

theme.customShadows.subtle          // mirrors legacy API
theme.customShadows.glow            // accent CTA glow

theme.spacing(2)                    // 16px
theme.transitions.duration.standard // 250ms
```

## How to add a new token

1. Add the value to the right file in `tokens/` (e.g. a new color goes in `colors.js`).
2. Re-export from `tokens/index.js` if it's a top-level addition.
3. If MUI components should pick it up, wire it into `theme/palette.js` or `theme/componentOverrides.js`.
4. Document the rule of when to use it in `DESIGN_SYSTEM.md`.

**Don't** introduce a token that's used only once. Tokens earn their place by being reusable.

## Previewing v2

While migration is in progress, the v2 theme is gated behind an env var:

```bash
cd apps/ui
VITE_USE_DESIGN_SYSTEM_V2=true npm run dev
```

See [`MIGRATION.md`](../../MIGRATION.md) for the full rollout sequence.

## When this directory replaces `themes/`

After Phase 9 of the migration plan, the legacy `themes/` directory is deleted and `design-system/theme/` moves up to `themes/`. At that point, this README's contents merge into a single top-level theme README.
