import { describe, expect, it, vi } from 'vitest';

import { readUtmParams, sanitizeUtmValue, stripUtmFromAddressBar, stripUtmParams, UTM_MAX_LENGTH } from '../utmParams';

describe('sanitizeUtmValue', () => {
  it('trims and lowercases', () => {
    expect(sanitizeUtmValue('  QR ')).toBe('qr');
  });

  it('caps at 32 characters', () => {
    expect(sanitizeUtmValue('A'.repeat(50))).toBe('a'.repeat(UTM_MAX_LENGTH));
  });

  it('returns null for blank, empty or missing values', () => {
    expect(sanitizeUtmValue('   ')).toBeNull();
    expect(sanitizeUtmValue('')).toBeNull();
    expect(sanitizeUtmValue(null)).toBeNull();
    expect(sanitizeUtmValue(undefined)).toBeNull();
  });
});

describe('readUtmParams', () => {
  it('reads the QR code tag', () => {
    expect(readUtmParams('?utm_source=qr&utm_medium=print')).toEqual({ utmSource: 'qr', utmMedium: 'print' });
  });

  it('normalizes values', () => {
    expect(readUtmParams('?utm_source=%20QR%20&utm_medium=Print')).toEqual({ utmSource: 'qr', utmMedium: 'print' });
  });

  it('returns only the params that are present', () => {
    expect(readUtmParams('?utm_source=qr')).toEqual({ utmSource: 'qr' });
    expect(readUtmParams('?utm_medium=print&utm_source=')).toEqual({ utmMedium: 'print' });
  });

  it('returns an empty object for untagged visits', () => {
    expect(readUtmParams('')).toEqual({});
    expect(readUtmParams('?foo=bar')).toEqual({});
    expect(readUtmParams(undefined)).toEqual({});
  });

  it('ignores other utm params', () => {
    expect(readUtmParams('?utm_campaign=xmas')).toEqual({});
  });
});

describe('stripUtmParams', () => {
  it('removes utm_source and utm_medium and keeps other params and the hash', () => {
    expect(stripUtmParams('https://show.remotefalcon.com/?a=1&utm_source=qr&utm_medium=print&b=2#top')).toBe('/?a=1&b=2#top');
  });

  it('drops the question mark when nothing else remains', () => {
    expect(stripUtmParams('https://show.remotefalcon.com/path?utm_source=qr&utm_medium=print')).toBe('/path');
  });

  it('leaves other utm params alone', () => {
    expect(stripUtmParams('https://x.test/?utm_source=qr&utm_campaign=xmas')).toBe('/?utm_campaign=xmas');
  });

  it('returns null when there is nothing to strip', () => {
    expect(stripUtmParams('https://x.test/?a=1#h')).toBeNull();
    expect(stripUtmParams('not a url')).toBeNull();
  });
});

describe('stripUtmFromAddressBar', () => {
  it('replaces the current history entry without the utm params', () => {
    const replaceState = vi.fn();
    const win = {
      location: { href: 'https://x.test/?utm_source=qr&utm_medium=print#h' },
      history: { state: { key: 'k' }, replaceState }
    };
    stripUtmFromAddressBar(win);
    expect(replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/#h');
  });

  it('does nothing for an untagged URL', () => {
    const replaceState = vi.fn();
    stripUtmFromAddressBar({ location: { href: 'https://x.test/?a=1' }, history: { state: null, replaceState } });
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('tolerates a missing history API', () => {
    expect(() => stripUtmFromAddressBar({ location: { href: 'https://x.test/?utm_source=qr' } })).not.toThrow();
  });
});
