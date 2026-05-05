/**
 * MUI palette built from design tokens.
 *
 * Drop-in replacement for `themes/palette.jsx`. Reads from the new token
 * files instead of the SCSS module presets — but preserves Remote Falcon's
 * existing brand colors:
 *   - primary   → brand blue   (#2196f3, default CTA)
 *   - secondary → brand purple (#7c4dff in dark, #673ab7 in light)
 *
 * Adds custom roles:
 *   - palette.accent     — warm amber for live/now-playing highlights only
 *   - palette.surfaces.* — semantic surface tokens (bg0..bg3, line, lineStrong)
 *   - palette.text.muted — between secondary and disabled
 */

import { brand, secondary, accent, cyan, pink, semantic, neutralsFor } from '../tokens/colors';

const buildPalette = (mode = 'dark') => {
  const neutrals = neutralsFor(mode);
  const isDark = mode === 'dark';

  return {
    mode,

    // Standard MUI roles — match legacy app behavior ------------------------
    primary: {
      light: brand[300],
      main:  brand[500],   // brand blue, the existing primary CTA color
      dark:  brand[700],
      200:   brand[200],
      800:   brand[700],
      contrastText: '#ffffff'
    },
    secondary: {
      // Light mode uses the more muted #673ab7; dark mode uses vivid #7c4dff.
      // This mirrors the legacy default theme exactly.
      light: secondary[200],
      main:  isDark ? secondary[500] : '#673ab7',
      dark:  isDark ? secondary[700] : '#5e35b1',
      200:   secondary[200],
      800:   secondary[900],
      contrastText: '#ffffff'
    },
    error:   { main: semantic.danger,  light: '#fca5a5', dark: '#b91c1c', contrastText: '#ffffff' },
    warning: { main: semantic.warning, light: '#fcd34d', dark: '#b45309', contrastText: '#1a1100' },
    success: { main: semantic.success, light: '#86efac', dark: '#15803d', contrastText: '#ffffff' },
    info:    { main: semantic.info,    light: '#67e8f9', dark: '#0e7490', contrastText: '#0b1118' },

    // Brand ramps (custom — referenced as theme.palette.brand[500]) ---------
    brand:  { ...brand,     main: brand[500] },
    accent: { ...accent,    main: accent[500] }, // tertiary — live-state only
    cyan:   { ...cyan,      main: cyan[400] },
    pink:   { ...pink,      main: pink[400] },

    // Surfaces & lines ------------------------------------------------------
    background: {
      default:  neutrals.bg0,
      paper:    neutrals.bg2,
      elevated: neutrals.bg3,
      subtle:   neutrals.bg1
    },
    divider: neutrals.line,
    surfaces: {
      bg0: neutrals.bg0,
      bg1: neutrals.bg1,
      bg2: neutrals.bg2,
      bg3: neutrals.bg3,
      line: neutrals.line,
      lineStrong: neutrals.lineStrong
    },

    // Text ------------------------------------------------------------------
    text: {
      primary:   neutrals.text1,
      secondary: neutrals.text2,
      muted:     neutrals.text3,
      disabled:  neutrals.text4,
      // legacy keys for compatibility with existing components
      dark:      neutrals.text1,
      hint:      neutrals.text3
    },

    // Action overrides — affect MUI's hover/selected/disabled states --------
    action: {
      hover:        isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
      // Selected state uses brand blue tint, not amber — it's the brand color.
      selected:     isDark ? 'rgba(33,150,243,0.12)'  : 'rgba(33,150,243,0.10)',
      disabled:     neutrals.text4,
      disabledBackground: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      focus:        isDark ? 'rgba(33,150,243,0.20)'  : 'rgba(33,150,243,0.15)'
    }
  };
};

export default buildPalette;
