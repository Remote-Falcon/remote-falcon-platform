import { describe, it, expect } from 'vitest';

import tokens, {
  colors,
  dark,
  light,
  semantic,
  neutralsFor,
  radius,
  shadows,
  shadowsFor,
  typography,
  fontFamily,
  fontWeight,
  roles,
  motion,
  duration,
  easing,
  transition,
  spacingTokens,
  spacing,
  density,
  baseUnit,
  breakpoints
} from '../index';

// `navy` / `amber` / `red` are exported by colors.js as the actual
// brand ramps — pull those directly so we can pin the documented hex.
import { navy, amber, red } from '../colors';

// Design tokens are the single source of truth that the legacy MUI theme
// AND the v2 dashboard chrome both read from. The tests here exist to:
//   • catch a bad export (refactor that drops a named export)
//   • lock the documented numeric values that downstream CSS/JS relies on
//   • verify the neutralsFor / shadowsFor selectors switch on mode

describe('design-system tokens module', () => {
  it('default export bundles all six token families', () => {
    expect(tokens).toHaveProperty('colors');
    expect(tokens).toHaveProperty('radius');
    expect(tokens).toHaveProperty('shadows');
    expect(tokens).toHaveProperty('typography');
    expect(tokens).toHaveProperty('motion');
    expect(tokens).toHaveProperty('spacing');
    expect(tokens).toHaveProperty('breakpoints');
  });

  it('re-exports the live named tokens (sanity)', () => {
    [
      colors, dark, light, semantic, neutralsFor,
      radius, shadows, shadowsFor,
      typography, fontFamily, fontWeight, roles,
      motion, duration, easing, transition,
      spacingTokens, spacing, density, baseUnit, breakpoints
    ].forEach((v) => expect(v).toBeDefined());
  });
});

describe('breakpoints', () => {
  it('matches the MUI default ramp (compatibility)', () => {
    expect(breakpoints).toEqual({ xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 });
  });
});

describe('motion', () => {
  it('exposes three timing buckets', () => {
    expect(duration.fast).toBe(150);
    expect(duration.base).toBe(250);
    expect(duration.slow).toBe(450);
  });

  it('exposes the documented easings', () => {
    expect(easing.standard).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(easing.enter).toBe('cubic-bezier(0, 0, 0.2, 1)');
    expect(easing.exit).toBe('cubic-bezier(0.4, 0, 1, 1)');
  });

  it('transition strings pair duration + easing', () => {
    expect(transition.fast).toBe('all 150ms cubic-bezier(0.4, 0, 0.2, 1)');
    expect(transition.base).toBe('all 250ms cubic-bezier(0.4, 0, 0.2, 1)');
    expect(transition.slow).toBe('all 450ms cubic-bezier(0.4, 0, 0.2, 1)');
  });
});

describe('colors', () => {
  it('navy ramp anchored at the documented theme3 hex', () => {
    expect(navy[500]).toBe('#16595a');
  });

  it('amber ramp anchored at the documented theme3 hex', () => {
    expect(amber[500]).toBe('#c77e23');
  });

  it('red ramp anchored at the documented brand neon-red hex', () => {
    expect(red[500]).toBe('#ef2b3d');
  });

  it('semantic tokens are flat hex strings (not nested ramps)', () => {
    expect(semantic).toEqual({
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#22d3ee'
    });
  });

  it('semantic.danger is distinct from brand red (intentional separation)', () => {
    expect(semantic.danger).not.toBe(red[500]);
  });

  it('neutralsFor returns a different ramp for light vs dark', () => {
    expect(neutralsFor('light')).toBe(light);
    expect(neutralsFor('dark')).toBe(dark);
  });
});

describe('shadows', () => {
  it('shadowsFor returns mode-specific elevations', () => {
    expect(shadowsFor('light')).toBeDefined();
    expect(shadowsFor('dark')).toBeDefined();
  });
});

describe('radius / spacing / typography exports parse', () => {
  it('radius has at least one named scale', () => {
    expect(Object.keys(radius).length).toBeGreaterThan(0);
  });
  it('spacing exports a numeric base unit', () => {
    expect(typeof baseUnit).toBe('number');
    expect(spacing).toBeDefined();
    expect(density).toBeDefined();
  });
  it('typography exposes fontFamily, fontWeight, roles', () => {
    expect(fontFamily).toBeDefined();
    expect(fontWeight).toBeDefined();
    expect(roles).toBeDefined();
  });
});
