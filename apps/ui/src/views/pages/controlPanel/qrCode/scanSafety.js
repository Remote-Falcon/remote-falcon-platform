// A cheap pre-print sanity check: will this styled code actually scan? We
// don't decode the rendered image (that's a stretch goal) — we catch the two
// failure modes that bite operators in practice: foreground/background
// contrast too low, and a center emblem riding on error correction too weak
// to absorb it. Pure functions, WCAG relative-luminance math.

import { effectiveErrorCorrection } from './qrOptions';

const CONTRAST_THRESHOLD = 3; // below this a QR reader starts to struggle

const clamp8 = (n) => Math.max(0, Math.min(255, n));

export const hexToRgb = (hex) => {
  const cleaned = String(hex || '').trim().replace(/^#/, '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: clamp8(parseInt(full.slice(0, 2), 16)),
    g: clamp8(parseInt(full.slice(2, 4), 16)),
    b: clamp8(parseInt(full.slice(4, 6), 16))
  };
};

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
};

export const contrastRatio = (hexA, hexB) => {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  if (a == null || b == null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
};

// Returns { ok, ratio, reasons }. `ratio` is the worst-case foreground vs
// background contrast (gradient codes check both stops). `reasons` carries
// machine-readable codes the UI maps to copy and PostHog reports.
export const evaluateScanSafety = (style) => {
  const reasons = [];

  const fgRatio = contrastRatio(style.fgColor, style.bgColor);
  const gradientRatio = style.gradient ? contrastRatio(style.gradientColor, style.bgColor) : null;
  const ratios = [fgRatio, gradientRatio].filter((r) => r != null);
  const ratio = ratios.length ? Math.min(...ratios) : null;

  if (ratio == null) {
    reasons.push('invalid-color');
  } else if (ratio < CONTRAST_THRESHOLD) {
    reasons.push('low-contrast');
  }

  // Emblem present but error correction can't cover it. effectiveErrorCorrection
  // forces H whenever an emblem is set, so this only fires if that guard is
  // ever bypassed — it's a belt-and-suspenders check on the contract.
  const hasEmblem = style.emblem && style.emblem !== 'none';
  if (hasEmblem && ['L', 'M'].includes(effectiveErrorCorrection(style))) {
    reasons.push('emblem-needs-ec');
  }

  return {
    ok: reasons.length === 0,
    ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
    reasons
  };
};

// Human-readable copy for the indicator under the preview.
export const SCAN_REASON_TEXT = {
  'low-contrast': 'Low contrast — may not scan. Try a darker foreground on a lighter background.',
  'invalid-color': 'Invalid color value.',
  'emblem-needs-ec': 'Center icon needs error correction H to stay scannable.'
};
