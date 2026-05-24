import { describe, it, expect } from 'vitest';

import buildPalette from '../palette';
import buildTypography from '../typography';
import buildComponentOverrides from '../componentOverrides';

// The v2 ThemeProvider builds MUI options from the token modules. Smoke
// test the three builders directly so a token rename or a bad MUI option
// surfaces here instead of crashing the entire ThemeProvider at app boot.

describe('buildPalette', () => {
  it('exposes the documented MUI roles in dark mode', () => {
    const p = buildPalette('dark');
    expect(p.mode).toBe('dark');
    expect(p.primary).toBeDefined();
    expect(p.secondary).toBeDefined();
    expect(p.text).toBeDefined();
    expect(p.background).toBeDefined();
  });

  it('exposes the documented MUI roles in light mode', () => {
    const p = buildPalette('light');
    expect(p.mode).toBe('light');
    expect(p.primary).toBeDefined();
    expect(p.secondary).toBeDefined();
  });

  it('defaults to dark mode when called with no args', () => {
    expect(buildPalette().mode).toBe('dark');
  });
});

describe('buildTypography', () => {
  it('exposes Inter (or the documented family) and the full heading scale', () => {
    const t = buildTypography();
    expect(t.fontFamily).toBeTruthy();
    for (const role of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body1', 'body2']) {
      expect(t[role], role).toBeDefined();
      expect(t[role].fontWeight, role).toBeDefined();
    }
  });
});

describe('buildComponentOverrides', () => {
  it('returns an MUI components map with at least one Mui* override', () => {
    const palette = buildPalette('dark');
    const t = { palette, typography: buildTypography(), spacing: () => '8px', shape: { borderRadius: 12 } };
    const components = buildComponentOverrides(t);
    expect(components).toBeDefined();
    // Must include at least one MUI component override (e.g. MuiButton)
    expect(Object.keys(components).length).toBeGreaterThan(0);
    expect(Object.keys(components).every((k) => k.startsWith('Mui'))).toBe(true);
  });
});
