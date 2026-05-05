/**
 * Typography tokens.
 *
 * One typeface (Inter) for the entire product — drop the per-config
 * Inter / Poppins / Roboto switch. Inter handles UI, marketing, and code
 * captions. JetBrains Mono is reserved for code blocks and the kbd hint.
 *
 * Scale: 1.25 modular ratio anchored at 16px body.
 *   12 → 14 → 16 → 18 → 22 → 28 → 36 → 44 → 56 → 72
 *
 * Line heights are tighter for headings, generous for body.
 */

export const fontFamily = {
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "Cascadia Mono", "SF Mono", monospace'
};

export const fontWeight = {
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
  display:  800
};

export const letterSpacing = {
  tighter: '-0.03em',
  tight:   '-0.02em',
  snug:    '-0.015em',
  normal:  '0',
  wide:    '0.04em',
  wider:   '0.06em',
  widest:  '0.08em'
};

/**
 * Semantic type roles. Each role has a target rem size, a line-height,
 * a weight, and a letter-spacing. Components reference roles, not raw sizes.
 */
export const roles = {
  display: { size: '4.5rem',  lineHeight: 1.05, weight: 700, tracking: '-0.03em' }, // 72px — hero only
  h1:      { size: '2.25rem', lineHeight: 1.10, weight: 700, tracking: '-0.02em' }, // 36px
  h2:      { size: '1.5rem',  lineHeight: 1.20, weight: 700, tracking: '-0.015em' }, // 24px
  h3:      { size: '1.125rem', lineHeight: 1.30, weight: 600, tracking: '0' },       // 18px
  h4:      { size: '1rem',     lineHeight: 1.40, weight: 600, tracking: '0' },       // 16px
  body:    { size: '0.9375rem', lineHeight: 1.6, weight: 400, tracking: '0' },       // 15px
  bodySm:  { size: '0.8125rem', lineHeight: 1.5, weight: 400, tracking: '0' },       // 13px
  label:   { size: '0.75rem',   lineHeight: 1.2, weight: 600, tracking: '0.06em' },  // 12px UPPERCASE
  caption: { size: '0.75rem',   lineHeight: 1.4, weight: 400, tracking: '0' },       // 12px
  code:    { size: '0.8125rem', lineHeight: 1.5, weight: 500, tracking: '0' }
};

const typography = { fontFamily, fontWeight, letterSpacing, roles };
export default typography;
