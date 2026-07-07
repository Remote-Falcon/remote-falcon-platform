import { afterEach, describe, expect, it, vi } from 'vitest';

import getMapStyleUrl, { getMapTextFont } from '../mapStyle';

// Pins the provider-swap contract (PRD FR-35): explicit style URLs beat the
// Protomaps key, the key builds the hosted-API URL, and with nothing set we
// fall back to the keyless demo style so dev environments still render.
describe('getMapStyleUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the explicit style URL for the mode when set (self-hosted switch)', () => {
    vi.stubEnv('VITE_MAP_STYLE_LIGHT', 'https://tiles.example.com/light.json');
    vi.stubEnv('VITE_MAP_STYLE_DARK', 'https://tiles.example.com/dark.json');
    vi.stubEnv('VITE_PROTOMAPS_API_KEY', 'ignored');
    expect(getMapStyleUrl('light')).toBe('https://tiles.example.com/light.json');
    expect(getMapStyleUrl('dark')).toBe('https://tiles.example.com/dark.json');
  });

  it('builds the Protomaps hosted API style URL from the key', () => {
    vi.stubEnv('VITE_MAP_STYLE_LIGHT', '');
    vi.stubEnv('VITE_MAP_STYLE_DARK', '');
    vi.stubEnv('VITE_PROTOMAPS_API_KEY', 'abc123');
    expect(getMapStyleUrl('light')).toBe('https://api.protomaps.com/styles/v5/light/en.json?key=abc123');
    expect(getMapStyleUrl('dark')).toBe('https://api.protomaps.com/styles/v5/dark/en.json?key=abc123');
  });

  it('falls back to the keyless MapLibre demo style when nothing is configured', () => {
    vi.stubEnv('VITE_MAP_STYLE_LIGHT', '');
    vi.stubEnv('VITE_MAP_STYLE_DARK', '');
    vi.stubEnv('VITE_PROTOMAPS_API_KEY', '');
    expect(getMapStyleUrl('dark')).toBe('https://demotiles.maplibre.org/style.json');
  });
});

describe('getMapTextFont', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses Noto Sans when a real basemap is configured', () => {
    vi.stubEnv('VITE_PROTOMAPS_API_KEY', 'abc123');
    expect(getMapTextFont('dark')).toEqual(['Noto Sans Medium']);
  });

  it('uses Open Sans for the demo fallback style', () => {
    vi.stubEnv('VITE_MAP_STYLE_LIGHT', '');
    vi.stubEnv('VITE_MAP_STYLE_DARK', '');
    vi.stubEnv('VITE_PROTOMAPS_API_KEY', '');
    expect(getMapTextFont('dark')).toEqual(['Open Sans Semibold']);
  });
});
