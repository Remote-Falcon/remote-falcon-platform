import { describe, it, expect } from 'vitest';

import { buildQrOptions, effectiveErrorCorrection } from '../qrOptions';
import { DEFAULT_STYLE, EMBLEMS } from '../presets';

// buildQrOptions is the single mapping from our flat style state to the
// qr-code-styling option object used by both the live preview and every
// download. If this drifts, codes render or export wrong, so pin the shape.

describe('effectiveErrorCorrection', () => {
  it('returns the chosen level when there is no emblem', () => {
    expect(effectiveErrorCorrection({ ...DEFAULT_STYLE, emblem: 'none', errorCorrection: 'L' })).toBe('L');
    expect(effectiveErrorCorrection({ ...DEFAULT_STYLE, errorCorrection: 'Q' })).toBe('Q');
  });

  it('forces H whenever an emblem is present, overriding a weak level', () => {
    expect(effectiveErrorCorrection({ ...DEFAULT_STYLE, emblem: 'snowflake', errorCorrection: 'L' })).toBe('H');
  });
});

describe('buildQrOptions', () => {
  it('maps the default style to a solid foreground with no image', () => {
    const opts = buildQrOptions(DEFAULT_STYLE, 'https://x.test', 1024);
    expect(opts.data).toBe('https://x.test');
    expect(opts.width).toBe(1024);
    expect(opts.height).toBe(1024);
    expect(opts.dotsOptions).toEqual({ type: 'square', color: '#000000' });
    expect(opts.dotsOptions.gradient).toBeUndefined();
    expect(opts.backgroundOptions.color).toBe('#ffffff');
    expect(opts.qrOptions.errorCorrectionLevel).toBe('Q');
    expect(opts.image).toBeUndefined();
  });

  it('emits a two-stop gradient when gradient is enabled', () => {
    const opts = buildQrOptions({ ...DEFAULT_STYLE, gradient: true, fgColor: '#111111', gradientColor: '#222222' }, 'd');
    expect(opts.dotsOptions.color).toBeUndefined();
    expect(opts.dotsOptions.gradient.colorStops).toEqual([
      { offset: 0, color: '#111111' },
      { offset: 1, color: '#222222' }
    ]);
  });

  it('attaches the emblem image and forces EC=H when an emblem is set', () => {
    const opts = buildQrOptions({ ...DEFAULT_STYLE, emblem: 'heart', errorCorrection: 'M' }, 'd');
    expect(opts.image).toBe(EMBLEMS.heart.dataUri);
    expect(opts.imageOptions.hideBackgroundDots).toBe(true);
    expect(opts.qrOptions.errorCorrectionLevel).toBe('H');
  });

  it('scales margin with size and honors the requested export type', () => {
    expect(buildQrOptions(DEFAULT_STYLE, 'd', 2048).margin).toBe(Math.round(2048 * 0.04));
    expect(buildQrOptions(DEFAULT_STYLE, 'd', 512, 'svg').type).toBe('svg');
  });

  it('passes corner shape straight through to cornersSquareOptions', () => {
    const opts = buildQrOptions({ ...DEFAULT_STYLE, cornerStyle: 'extra-rounded' }, 'd');
    expect(opts.cornersSquareOptions.type).toBe('extra-rounded');
  });

  it('tolerates empty data without throwing', () => {
    expect(buildQrOptions(DEFAULT_STYLE, null).data).toBe('');
  });
});
