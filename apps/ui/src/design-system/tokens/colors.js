/**
 * Color tokens — framework-agnostic source of truth.
 *
 * Honors the existing Remote Falcon brand identity:
 *   - Primary blue   → kept from legacy `_themes-vars.module.scss` ($primaryMain).
 *   - Secondary purple → kept (uses dark-mode-friendly variant by default).
 *   - Dark surfaces  → kept from legacy navy/indigo family ($darkPaper / $darkBackground / $darkLevel1).
 *
 * What's new in v2:
 *   - `accent` (warm amber) — TERTIARY highlight, used for live-state UI:
 *     "now playing", active sequence indicator, focused row marker.
 *     NOT the primary CTA color. Primary CTA stays brand blue.
 *   - Three-level shadow scale (see shadows.js) instead of the legacy z1..z24 ladder.
 *   - One typeface (Inter) instead of the per-config Roboto/Poppins/Inter switch.
 *
 * Token tiers:
 *   1. Brand        — accent colors that carry the Remote Falcon identity.
 *   2. Neutrals     — surfaces and text. Different ramps for light & dark.
 *   3. Semantic     — success / warning / danger / info. Same in both modes.
 */

// 1. Brand --------------------------------------------------------------------

/**
 * Primary brand color — Remote Falcon blue.
 * Hex values match the legacy `_themes-vars.module.scss` $primaryLight..800.
 */
export const brand = {
  50:  '#e3f2fd',
  100: '#bbdefb',
  200: '#90caf9',
  300: '#64b5f6',
  500: '#2196f3', // primary CTA / brand anchor
  700: '#1565c0',
  900: '#0d47a1'
};

/**
 * Secondary brand color — Remote Falcon purple.
 * Uses the legacy dark-mode-friendly $darkSecondaryMain (#7c4dff) so the
 * default mode (dark) gets a vivid purple. Light mode adjusts via theme.
 */
export const secondary = {
  50:  '#ede7f6',
  100: '#d1c4e9',
  200: '#b39ddb',
  300: '#9575cd',
  500: '#7c4dff', // dark-mode-friendly vivid purple
  700: '#5e35b1',
  900: '#4527a0'
};

/**
 * Tertiary highlight — warm amber. Reserved for live-state UI (now playing,
 * focused row, "show is live" badges) so it reads like a stage light. NEVER
 * the primary CTA — that's brand blue.
 */
export const accent = {
  300: '#ffd28a',
  500: '#f5a524',
  700: '#c47a08'
};

/** Cyan + pink used in chart series and brand gradients only. */
export const cyan = { 400: '#22d3ee' };
export const pink = { 400: '#f472b6' };

// 2. Neutrals — dark mode (default) -------------------------------------------

/**
 * Dark surfaces follow the existing Remote Falcon navy/indigo family.
 * Maps onto the legacy $darkPaper / $darkBackground / $darkLevel1 / $darkLevel2.
 */
export const dark = {
  bg0: '#0b1029', // page background — deeper variant of darkPaper
  bg1: '#111936', // app shell, sidebar — legacy $darkPaper
  bg2: '#1a223f', // cards, default surface — legacy $darkBackground
  bg3: '#29314f', // elevated cards, popovers, inputs — legacy $darkLevel1

  text1: '#f5f7fb',
  text2: '#c2c8d4',
  text3: '#8590ad', // tuned for navy bg — slightly brighter than my v1 attempt
  text4: '#525a6e',

  line:        'rgba(255,255,255,0.07)',
  lineStrong:  'rgba(255,255,255,0.14)'
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

export const neutralsFor = (mode) => (mode === 'light' ? light : dark);

const colors = { brand, secondary, accent, cyan, pink, dark, light, semantic, neutralsFor };
export default colors;
