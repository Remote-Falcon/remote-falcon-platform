import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveArtworkUrl } from '../artworkUrl';

const API = 'https://remotefalcon.com/remote-falcon-viewer';
const REF = '/remote-falcon-viewer/artwork/myshow/0123456789abcdef0123456789abcdef.png';

describe('resolveArtworkUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves a root-relative viewer artwork reference against the viewer API origin', () => {
    expect(resolveArtworkUrl(REF, API)).toBe(`https://remotefalcon.com${REF}`);
  });

  it('keeps the viewer API port (dev stack, self-host)', () => {
    expect(resolveArtworkUrl(REF, 'http://localhost:8080/remote-falcon-viewer')).toBe(`http://localhost:8080${REF}`);
  });

  it('reads VITE_VIEWER_API by default', () => {
    vi.stubEnv('VITE_VIEWER_API', 'http://192.168.1.5:8000/remote-falcon-viewer');
    expect(resolveArtworkUrl(REF)).toBe(`http://192.168.1.5:8000${REF}`);
  });

  it('leaves absolute URLs and data URIs untouched', () => {
    const abs = `https://remotefalcon.com${REF}`;
    expect(resolveArtworkUrl(abs, API)).toBe(abs);
    expect(resolveArtworkUrl('https://cdn.example.com/a.png', API)).toBe('https://cdn.example.com/a.png');
    expect(resolveArtworkUrl('data:image/png;base64,AAAA', API)).toBe('data:image/png;base64,AAAA');
  });

  it("leaves an operator's own root-relative image path alone", () => {
    expect(resolveArtworkUrl('/images/cover.png', API)).toBe('/images/cover.png');
  });

  it('passes empty values and a missing/invalid API through', () => {
    expect(resolveArtworkUrl(undefined, API)).toBeUndefined();
    expect(resolveArtworkUrl('', API)).toBe('');
    expect(resolveArtworkUrl(REF, '')).toBe(REF);
    expect(resolveArtworkUrl(REF, 'not a url')).toBe(REF);
  });
});
