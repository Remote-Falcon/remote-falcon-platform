import { describe, it, expect, beforeEach, vi } from 'vitest';

import { sanitizeQrStyle, loadQrStyle, saveQrStyle, hasCustomStyle } from '../qrStyleStorage';
import { DEFAULT_STYLE } from '../presets';

// sanitizeQrStyle is the trust boundary for anything read from localStorage.
// A stale or hand-edited blob must never feed an out-of-range value into the
// QR renderer, so every field falls back to the default when invalid.

describe('sanitizeQrStyle', () => {
  it('returns the default for non-objects', () => {
    expect(sanitizeQrStyle(null)).toEqual(DEFAULT_STYLE);
    expect(sanitizeQrStyle('string')).toEqual(DEFAULT_STYLE);
  });

  it('keeps valid values and drops invalid ones to default', () => {
    const result = sanitizeQrStyle({
      fgColor: '#abcdef',
      bgColor: 'notacolor',
      gradient: 'yes', // not a boolean → default false
      dotStyle: 'rounded',
      cornerStyle: 'banana', // invalid → default square
      emblem: 'snowflake',
      errorCorrection: 'Z' // invalid → default Q
    });
    expect(result.fgColor).toBe('#abcdef');
    expect(result.bgColor).toBe(DEFAULT_STYLE.bgColor);
    expect(result.gradient).toBe(false);
    expect(result.dotStyle).toBe('rounded');
    expect(result.cornerStyle).toBe('square');
    expect(result.emblem).toBe('snowflake');
    expect(result.errorCorrection).toBe('Q');
  });

  it('rejects an unknown emblem id', () => {
    expect(sanitizeQrStyle({ emblem: 'dragon' }).emblem).toBe('none');
  });
});

describe('hasCustomStyle', () => {
  it('is false for the default and true once anything changes', () => {
    expect(hasCustomStyle(DEFAULT_STYLE)).toBe(false);
    expect(hasCustomStyle({ ...DEFAULT_STYLE, fgColor: '#c0203a' })).toBe(true);
  });
});

describe('load/save round-trip', () => {
  beforeEach(() => {
    const store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      }
    });
  });

  it('returns the default when nothing is stored', () => {
    expect(loadQrStyle('myshow')).toEqual(DEFAULT_STYLE);
  });

  it('persists and reloads a sanitized style', () => {
    const style = { ...DEFAULT_STYLE, fgColor: '#c0203a', emblem: 'snowflake' };
    saveQrStyle('myshow', style);
    expect(loadQrStyle('myshow')).toEqual(style);
  });

  it('is keyed per subdomain', () => {
    saveQrStyle('showA', { ...DEFAULT_STYLE, fgColor: '#111111' });
    expect(loadQrStyle('showB')).toEqual(DEFAULT_STYLE);
  });

  it('falls back to default on corrupt JSON', () => {
    window.localStorage.setItem('rf-qr-style:myshow', '{not json');
    expect(loadQrStyle('myshow')).toEqual(DEFAULT_STYLE);
  });

  it('no-ops without a subdomain', () => {
    expect(() => saveQrStyle(null, DEFAULT_STYLE)).not.toThrow();
    expect(loadQrStyle(null)).toEqual(DEFAULT_STYLE);
  });
});
