/**
 * Color tokens — framework-agnostic source of truth.
 *
 * Honors the actual Remote Falcon brand identity (navy, amber, red),
 * derived from the deployed theme3 preset (apps/ui/src/assets/scss/
 * _theme3.module.scss is the canonical default per src/config.jsx).
 *
 *   - Primary navy   → preserves theme3 primary (#16595a / #1f7778).
 *                      Used as a deep brand surface accent and outline color.
 *   - Secondary amber → preserves theme3 secondary (#c77e23).
 *                       The warm primary CTA color — "press here to start the show."
 *   - Tertiary red    → new brand color, Christmas-warm. Used for live-state UI
 *                       ("show is live", urgent actions). NOT the same as `error`.
 *   - Dark surfaces   → preserve theme3's near-black blue-cast family
 *                       (#010606 / #010f17 / #02131d).
 *
 * What's new in v2 (vs. legacy theme3):
 *   - Three-level shadow scale (see shadows.js) instead of the legacy z1..z24.
 *   - One typeface (Inter) instead of the per-config Roboto/Poppins switch.
 *   - Brand red as a first-class token (today red is only `error`).
 *
 * Token tiers:
 *   1. Brand        — navy (primary), amber (secondary), red (tertiary).
 *   2. Neutrals     — surfaces and text. Different ramps for light & dark.
 *   3. Semantic     — success / warning / danger / info. Independent from brand.
 */

// 1. Brand --------------------------------------------------------------------

/**
 * Primary brand color — Remote Falcon navy.
 * Preserves theme3's primary (#16595a) and dark variant (#1f7778). The hex
 * leans deep blue-green and reads as "midnight" — fits the night-sky theme.
 */
export const navy = {
  50:  '#e3ebeb',  // theme3 $primaryLight
  200: '#8bacad',  // theme3 $primary200
  500: '#16595a',  // theme3 $primaryMain — the brand anchor
  600: '#1f7778',  // theme3 $darkPrimaryMain — used in dark mode
  700: '#135152',  // theme3 $primaryDark
  800: '#0c3e3f'   // theme3 $primary800
};

/**
 * Secondary brand color — Remote Falcon amber.
 * Preserves theme3's secondary (#c77e23) exactly. The warm primary CTA color.
 */
export const amber = {
  100: '#f8f0e5',  // theme3 $secondaryLight
  200: '#e3bf91',  // theme3 $secondary200
  500: '#c77e23',  // theme3 $secondaryMain — the brand CTA color
  700: '#c1761f',  // theme3 $secondaryDark
  800: '#b36115'   // theme3 $secondary800
};

/**
 * Tertiary brand color — neon red. New in v2 as a token, but the value
 * matches what the deployed brand uses across the RF monogram + the
 * "REMOTE FALCON" jukebox-arch wordmark (apps/ui/public/rf-icon.png and
 * apps/ui/public/jukebox.png). The hue is intentionally hot/saturated so
 * it reads as a neon glow against the near-black surfaces.
 *
 * Usage: live-state indicators, "show is live" badges, the RF monogram
 * glow halo, festive accents. Distinct from semantic.danger — that's
 * for destructive actions and validation errors.
 */
export const red = {
  300: '#ff8a8a',
  500: '#ef2b3d', // brand neon-red
  600: '#d61f30', // matches the rest tone of the wordmark glow edges
  700: '#a8182a',
  900: '#7a0f1c',
  /**
   * `glow` is a CSS box-shadow / filter value, not a color. Use it
   * directly when something needs the brand "neon" effect:
   *   sx={{ filter: red.glow }}
   */
  glow: 'drop-shadow(0 0 8px rgba(239,43,61,0.55)) drop-shadow(0 0 24px rgba(239,43,61,0.30))'
};

// 2. Neutrals — dark mode (default) -------------------------------------------

/**
 * Dark surfaces preserve theme3's near-black blue-cast family. The page
 * background is so dark that brand colors pop against it — exactly the
 * "night sky with warm lights" feel of the product.
 */
export const dark = {
  bg0: '#01080d', // page — slightly lifted from #010606 for breathing room
  bg1: '#010f17', // shell, sidebar — theme3 $darkPaper / $darkLevel2
  bg2: '#02131d', // cards — theme3 $darkLevel1
  bg3: '#0a1828', // elevated cards, popovers, inputs — slightly lighter

  text1: '#ffffff',  // theme3 $darkTextPrimary
  text2: '#c2c8d4',
  text3: '#8492c4',  // theme3 $darkTextSecondary — has a subtle navy cast
  text4: '#525a6e',

  line:        'rgba(255,255,255,0.07)',
  lineStrong:  'rgba(255,255,255,0.14)'
};

// 2b. Neutrals — light mode ---------------------------------------------------
//
// Page (bg0) is intentionally OFF-white so cards (bg2 = pure white) pop
// against it. Earlier iteration used #ffffff for both, which made the
// page-vs-card boundary disappear — surfaces blended together and
// section structure was hard to read.
//
// Slate-100/200 ramp chosen for a cool, neutral undertone that doesn't
// fight the navy/amber brand colors.
export const light = {
  bg0: '#eef2f7', // page — slate-100ish, gives cards something to sit on
  bg1: '#e2e8f0', // sidebar / shell — slate-200, slightly deeper than page
  bg2: '#ffffff', // cards — true white
  bg3: '#f8fafc', // elevated cards / popovers — barely off-white

  text1: '#0f172a',
  text2: '#334155',
  text3: '#64748b',
  text4: '#94a3b8',

  // Bumped from 0.08/0.16 — cards on bg0 need a visible 1px edge or they
  // lose their boundary, especially at the card-to-card seam.
  line:        'rgba(15,23,42,0.12)',
  lineStrong:  'rgba(15,23,42,0.22)'
};

// 3. Semantic -----------------------------------------------------------------

/**
 * Semantic colors are independent from brand. Specifically:
 *   - `danger` is for destructive actions / errors. It's a true red, slightly
 *     different from brand `red.500` so the two don't collide visually.
 *   - Brand `red.500` carries warmth + holiday meaning. Semantic `danger`
 *     carries warning + caution.
 */
export const semantic = {
  success: '#22c55e',
  warning: '#f59e0b',
  danger:  '#ef4444',
  info:    '#22d3ee'
};

// Helpers ---------------------------------------------------------------------

export const neutralsFor = (mode) => (mode === 'light' ? light : dark);

const colors = { navy, amber, red, dark, light, semantic, neutralsFor };
export default colors;
