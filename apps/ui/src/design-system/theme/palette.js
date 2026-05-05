/**
 * MUI palette built from design tokens.
 *
 * Drop-in replacement for `themes/palette.jsx`. Reads from the new token
 * files instead of the SCSS module presets — but preserves Remote Falcon's
 * actual brand identity (theme3 = navy + amber):
 *   - primary    → navy   (#16595a light / #1f7778 dark — theme3 primary)
 *   - secondary  → amber  (#c77e23 — theme3 secondary, the warm CTA color)
 *
 * Adds custom roles:
 *   - palette.brand.red  — Christmas-warm tertiary, for live-state UI
 *                          ("show is live", festive accents). NOT for errors.
 *   - palette.surfaces.* — semantic surface tokens (bg0..bg3, line, lineStrong)
 *   - palette.text.muted — between secondary and disabled
 */

import { navy, amber, red, semantic, neutralsFor } from '../tokens/colors';

const buildPalette = (mode = 'dark') => {
  const neutrals = neutralsFor(mode);
  const isDark = mode === 'dark';

  return {
    mode,

    // Standard MUI roles ----------------------------------------------------
    primary: {
      light: navy[200],
      // Dark mode uses the slightly brighter #1f7778 so navy reads on near-black bg.
      main:  isDark ? navy[600] : navy[500],
      dark:  isDark ? navy[500] : navy[700],
      200:   navy[200],
      800:   navy[800],
      contrastText: '#ffffff'
    },
    secondary: {
      light: amber[200],
      main:  amber[500],   // brand amber — the warm primary CTA color
      dark:  amber[700],
      200:   amber[200],
      800:   amber[800],
      contrastText: '#1a1100'
    },
    error:   { main: semantic.danger,  light: '#fca5a5', dark: '#b91c1c', contrastText: '#ffffff' },
    warning: { main: semantic.warning, light: '#fcd34d', dark: '#b45309', contrastText: '#1a1100' },
    success: { main: semantic.success, light: '#86efac', dark: '#15803d', contrastText: '#ffffff' },
    info:    { main: semantic.info,    light: '#67e8f9', dark: '#0e7490', contrastText: '#0b1118' },

    // Brand ramps (custom — referenced as theme.palette.brand.*) -----------
    brand: {
      navy:  { ...navy,  main: isDark ? navy[600] : navy[500] },
      amber: { ...amber, main: amber[500] },
      red:   { ...red,   main: red[500] }
    },

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
      // Selected state uses amber tint (the brand CTA color).
      selected:     isDark ? 'rgba(199,126,35,0.14)'  : 'rgba(199,126,35,0.10)',
      disabled:     neutrals.text4,
      disabledBackground: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      focus:        isDark ? 'rgba(199,126,35,0.22)'  : 'rgba(199,126,35,0.18)'
    }
  };
};

export default buildPalette;
