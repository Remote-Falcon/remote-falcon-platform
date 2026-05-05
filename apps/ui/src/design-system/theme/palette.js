/**
 * MUI palette built from design tokens.
 *
 * Drop-in replacement for `themes/palette.jsx`. Reads from the new token
 * files instead of the SCSS module presets.
 */

import { brand, accent, cyan, pink, semantic, neutralsFor } from '../tokens/colors';

const buildPalette = (mode = 'dark') => {
  const neutrals = neutralsFor(mode);
  const isDark = mode === 'dark';

  return {
    mode,

    // Standard MUI roles ----------------------------------------------------
    primary: {
      light: brand[300],
      main:  brand[500],
      dark:  brand[700],
      contrastText: '#ffffff'
    },
    secondary: {
      light: accent[300],
      main:  accent[500],
      dark:  accent[700],
      contrastText: '#1a1100'
    },
    error:   { main: semantic.danger,  light: '#fca5a5', dark: '#b91c1c', contrastText: '#ffffff' },
    warning: { main: semantic.warning, light: '#fcd34d', dark: '#b45309', contrastText: '#1a1100' },
    success: { main: semantic.success, light: '#86efac', dark: '#15803d', contrastText: '#ffffff' },
    info:    { main: semantic.info,    light: '#67e8f9', dark: '#0e7490', contrastText: '#0b1118' },

    // Brand ramps (custom — referenced as theme.palette.brand[500]) ---------
    brand:  { ...brand,  main: brand[500] },
    accent: { ...accent, main: accent[500] },
    cyan:   { ...cyan,   main: cyan[400] },
    pink:   { ...pink,   main: pink[400] },

    // Surfaces & lines ------------------------------------------------------
    background: {
      default: neutrals.bg0,
      paper:   neutrals.bg2,
      elevated: neutrals.bg3,
      subtle:  neutrals.bg1
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

    // Action overrides — affect MUI's hover/selected/disabled states ---------
    action: {
      hover:        isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
      selected:     isDark ? 'rgba(245,165,36,0.10)'  : 'rgba(245,165,36,0.10)',
      disabled:     neutrals.text4,
      disabledBackground: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      focus:        isDark ? 'rgba(245,165,36,0.18)'  : 'rgba(245,165,36,0.18)'
    }
  };
};

export default buildPalette;
