// v1 persistence is localStorage keyed by subdomain (zero backend, no schema
// change — see PRD-006 open questions). sanitizeQrStyle is the trust boundary:
// anything loaded from storage is coerced back onto the known shape so a
// hand-edited or stale blob can't feed bad values into qr-code-styling.

import { DEFAULT_STYLE, DOT_STYLES, CORNER_STYLES, EC_LEVELS, EMBLEMS } from './presets';

const STORAGE_PREFIX = 'rf-qr-style:';

const HEX = /^#[0-9a-fA-F]{6}$/;
const isHex = (v) => typeof v === 'string' && HEX.test(v);
const oneOf = (v, list) => list.some((o) => o.value === v);

// Coerce an arbitrary object onto DEFAULT_STYLE, keeping only valid values.
export const sanitizeQrStyle = (raw) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    fgColor: isHex(src.fgColor) ? src.fgColor : DEFAULT_STYLE.fgColor,
    bgColor: isHex(src.bgColor) ? src.bgColor : DEFAULT_STYLE.bgColor,
    gradient: typeof src.gradient === 'boolean' ? src.gradient : DEFAULT_STYLE.gradient,
    gradientColor: isHex(src.gradientColor) ? src.gradientColor : DEFAULT_STYLE.gradientColor,
    dotStyle: oneOf(src.dotStyle, DOT_STYLES) ? src.dotStyle : DEFAULT_STYLE.dotStyle,
    cornerStyle: oneOf(src.cornerStyle, CORNER_STYLES) ? src.cornerStyle : DEFAULT_STYLE.cornerStyle,
    emblem: Object.prototype.hasOwnProperty.call(EMBLEMS, src.emblem) ? src.emblem : DEFAULT_STYLE.emblem,
    errorCorrection: oneOf(src.errorCorrection, EC_LEVELS) ? src.errorCorrection : DEFAULT_STYLE.errorCorrection
  };
};

export const loadQrStyle = (subdomain) => {
  if (!subdomain) return { ...DEFAULT_STYLE };
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${subdomain}`);
    if (!raw) return { ...DEFAULT_STYLE };
    return sanitizeQrStyle(JSON.parse(raw));
  } catch {
    // Corrupt JSON or storage unavailable (private mode) — fall back clean.
    return { ...DEFAULT_STYLE };
  }
};

export const saveQrStyle = (subdomain, style) => {
  if (!subdomain) return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${subdomain}`, JSON.stringify(sanitizeQrStyle(style)));
  } catch {
    // Best-effort; persistence is a nicety, not load-bearing.
  }
};

// Whether a loaded style differs from the default — drives the
// `had_saved_style` PostHog prop without re-reading storage.
export const hasCustomStyle = (style) => {
  const clean = sanitizeQrStyle(style);
  return Object.keys(DEFAULT_STYLE).some((k) => clean[k] !== DEFAULT_STYLE[k]);
};
