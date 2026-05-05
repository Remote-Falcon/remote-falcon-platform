/**
 * Shadow scale — three levels only.
 *
 * The legacy theme had z1..z24 graded shadows; the new system uses three
 * intent-named levels and reserves shadow for state changes (hover, active,
 * overlays) — never as default card decoration.
 *
 *   subtle    — resting state for floating elements
 *   medium    — hover state, dropdown menus, tooltips
 *   elevated  — modals, command palette, popovers
 *   glow      — branded emphasis (CTAs, "now playing" art)
 */

const dark = {
  subtle:   '0 1px 2px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.02) inset',
  medium:   '0 6px 18px rgba(0,0,0,0.35)',
  elevated: '0 20px 50px rgba(0,0,0,0.5)',
  glow:     '0 0 0 1px rgba(245,165,36,0.4), 0 10px 40px rgba(245,165,36,0.25)'
};

const light = {
  subtle:   '0 1px 2px rgba(15,23,42,0.06)',
  medium:   '0 4px 12px rgba(15,23,42,0.10)',
  elevated: '0 12px 32px rgba(15,23,42,0.18)',
  glow:     '0 0 0 1px rgba(245,165,36,0.5), 0 8px 24px rgba(245,165,36,0.30)'
};

export const shadowsFor = (mode) => (mode === 'light' ? light : dark);

const shadows = { dark, light, shadowsFor };
export default shadows;
