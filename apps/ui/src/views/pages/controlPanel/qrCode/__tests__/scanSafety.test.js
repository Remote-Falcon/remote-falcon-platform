import { describe, it, expect } from 'vitest';

import { hexToRgb, contrastRatio, evaluateScanSafety } from '../scanSafety';
import { DEFAULT_STYLE } from '../presets';

// The scan-safety check is the operator's insurance against printing 50 signs
// with an unscannable code. Pin the contrast math and the reason-emitting
// thresholds so a styling change can't silently turn the warning off.

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('expands 3-digit shorthand', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('returns null for garbage', () => {
    expect(hexToRgb('nope')).toBeNull();
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb(null)).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('is 1 for identical colors', () => {
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 5);
  });
});

describe('evaluateScanSafety', () => {
  it('passes the default black-on-white style', () => {
    const result = evaluateScanSafety(DEFAULT_STYLE);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.ratio).toBeGreaterThan(20);
  });

  it('flags low contrast (light gray on white)', () => {
    const result = evaluateScanSafety({ ...DEFAULT_STYLE, fgColor: '#dddddd' });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('low-contrast');
  });

  it('uses the worst of the two stops for a gradient', () => {
    // Strong fg, but the gradient second stop is near-white on white.
    const result = evaluateScanSafety({
      ...DEFAULT_STYLE,
      gradient: true,
      fgColor: '#000000',
      gradientColor: '#f2f2f2'
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('low-contrast');
  });

  it('reports invalid-color for an unparseable value', () => {
    const result = evaluateScanSafety({ ...DEFAULT_STYLE, fgColor: 'rebeccapurple' });
    expect(result.reasons).toContain('invalid-color');
    expect(result.ratio).toBeNull();
  });

  it('does not flag an emblem because EC is forced to H', () => {
    const result = evaluateScanSafety({ ...DEFAULT_STYLE, emblem: 'star', errorCorrection: 'L' });
    expect(result.reasons).not.toContain('emblem-needs-ec');
  });
});
