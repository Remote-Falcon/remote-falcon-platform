/**
 * Color tokens — framework-agnostic source of truth.
 *
 * NEVER hardcode hex values in components. Reach for these tokens via
 * the MUI theme (`theme.palette.brand[500]`) or import directly when
 * you need a raw value.
 *
 * Token tiers:
 *   1. Brand        — accent colors that carry the Remote Falcon identity.
 *   2. Neutrals     — surfaces and text. Different ramps for light & dark.
 *   3. Semantic     — success / warning / danger / info. Same in both modes.
 */

// 1. Brand --------------------------------------------------------------------

export const brand = {
  50:  '#eef4ff',
  100: '#d9e6ff',
  300: '#6f8bff',
  500: '#3b5bff', // primary brand blue
  700: '#1f37c4'
};

export const accent = {
  300: '#ffd28a',
  500: '#f5a524', // primary CTA / highlight color (warm amber, evokes lights)
  700: '#c47a08'
};

export const cyan = {
  400: '#22d3ee' // secondary highlight, charts, info-style data
};

export const pink = {
  400: '#f472b6' // tertiary, used in gradients with accent
};

// 2. Neutrals — dark mode (default) -------------------------------------------

export const dark = {
  bg0: '#07090f', // page background
  bg1: '#0c111c', // app shell / sidebar
  bg2: '#121826', // cards
  bg3: '#1a2030', // elevated cards / popovers / inputs

  text1: '#f5f7fb', // primary text
  text2: '#c2c8d4', // secondary text
  text3: '#7e8699', // muted / labels
  text4: '#525a6e', // hints / placeholders / disabled

  line:        'rgba(255,255,255,0.06)',
  lineStrong:  'rgba(255,255,255,0.12)'
};

// 2b. Neutrals — light mode ---------------------------------------------------

export const light = {
  bg0: '#ffffff',
  bg1: '#f8fafc',
  bg2: '#ffffff',
  bg3: '#f1f5f9',

  text1: '#0f172a',
  text2: '#334155',
  text3: '#64748b',
  text4: '#94a3b8',

  line:        'rgba(15,23,42,0.08)',
  lineStrong:  'rgba(15,23,42,0.16)'
};

// 3. Semantic -----------------------------------------------------------------

export const semantic = {
  success: '#22c55e',
  warning: '#f59e0b',
  danger:  '#ef4444',
  info:    '#22d3ee'
};

// Helpers ---------------------------------------------------------------------

/**
 * Returns the neutral ramp for a given color mode.
 */
export const neutralsFor = (mode) => (mode === 'light' ? light : dark);

const colors = { brand, accent, cyan, pink, dark, light, semantic, neutralsFor };
export default colors;
