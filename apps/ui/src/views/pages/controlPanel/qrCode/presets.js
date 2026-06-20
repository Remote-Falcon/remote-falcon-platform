// Pure config for the QR Code generator: the default style, the allowed
// enum values the controls render against, the curated center emblems, and
// the one-click seasonal presets. No DOM, no React — kept separate so the
// option mapper and the controls share a single source of truth and so it's
// trivially unit-testable.

// Center emblems are emoji baked into a tiny inline SVG so we ship zero
// binary assets and the glyph renders in the OS emoji font. qr-code-styling
// accepts the data URI directly as its `image`.
const emojiEmblem = (emoji) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">` +
      `<text x="50" y="54" font-size="78" text-anchor="middle" dominant-baseline="central">${emoji}</text>` +
      `</svg>`
  )}`;

// Keyed so a style only has to persist the emblem id, not the whole data URI.
export const EMBLEMS = {
  none: { label: 'None', emoji: '', dataUri: null },
  snowflake: { label: 'Snowflake', emoji: '❄️', dataUri: emojiEmblem('❄️') },
  bat: { label: 'Bat', emoji: '🦇', dataUri: emojiEmblem('🦇') },
  leaf: { label: 'Leaf', emoji: '🍂', dataUri: emojiEmblem('🍂') },
  star: { label: 'Star', emoji: '⭐', dataUri: emojiEmblem('⭐') },
  heart: { label: 'Heart', emoji: '❤️', dataUri: emojiEmblem('❤️') }
};

// Dot + corner values map straight onto qr-code-styling's option strings, so
// keep these in sync with what the library accepts (see qrOptions.js).
export const DOT_STYLES = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'dots', label: 'Dots' }
];

export const CORNER_STYLES = [
  { value: 'square', label: 'Square' },
  { value: 'extra-rounded', label: 'Rounded' },
  { value: 'dot', label: 'Dot' }
];

export const EC_LEVELS = [
  { value: 'L', label: 'L' },
  { value: 'M', label: 'M' },
  { value: 'Q', label: 'Q' },
  { value: 'H', label: 'H' }
];

export const PNG_SIZES = [512, 1024, 2048];

// Black-on-white, square, error-correction Q — maximum scanner compatibility.
export const DEFAULT_STYLE = {
  fgColor: '#000000',
  bgColor: '#ffffff',
  gradient: false,
  gradientColor: '#000000',
  dotStyle: 'square',
  cornerStyle: 'square',
  emblem: 'none',
  errorCorrection: 'Q'
};

// One click sets a tasteful, scan-tested palette + shapes + emblem. Mirrors
// the seasonal viewer-scripts (christmas/halloween/thanksgiving/…) so the
// brand language stays consistent. Each `style` is a full DEFAULT_STYLE
// override applied wholesale.
export const SEASONAL_PRESETS = [
  { id: 'none', label: 'None', emoji: '⬛', style: { ...DEFAULT_STYLE } },
  {
    id: 'christmas',
    label: 'Christmas',
    emoji: '🎄',
    style: {
      ...DEFAULT_STYLE,
      fgColor: '#c0203a',
      gradient: true,
      gradientColor: '#0f7a36',
      dotStyle: 'rounded',
      cornerStyle: 'extra-rounded',
      emblem: 'snowflake',
      errorCorrection: 'H'
    }
  },
  {
    id: 'halloween',
    label: 'Halloween',
    emoji: '🎃',
    style: {
      ...DEFAULT_STYLE,
      fgColor: '#e8620c',
      bgColor: '#0d0d0d',
      dotStyle: 'rounded',
      cornerStyle: 'extra-rounded',
      emblem: 'bat',
      errorCorrection: 'H'
    }
  },
  {
    id: 'thanksgiving',
    label: 'Thanksgiving',
    emoji: '🦃',
    style: {
      ...DEFAULT_STYLE,
      fgColor: '#8a4b1f',
      bgColor: '#fbf3e3',
      dotStyle: 'rounded',
      cornerStyle: 'extra-rounded',
      emblem: 'leaf',
      errorCorrection: 'H'
    }
  },
  {
    id: 'fourth-of-july',
    label: 'Fourth of July',
    emoji: '🇺🇸',
    style: {
      ...DEFAULT_STYLE,
      fgColor: '#0a2a66',
      gradient: true,
      gradientColor: '#b21e35',
      cornerStyle: 'extra-rounded',
      emblem: 'star',
      errorCorrection: 'H'
    }
  },
  {
    id: 'valentines',
    label: "Valentine's",
    emoji: '❤️',
    style: {
      ...DEFAULT_STYLE,
      fgColor: '#c41e5a',
      bgColor: '#fde7ef',
      dotStyle: 'rounded',
      cornerStyle: 'extra-rounded',
      emblem: 'heart',
      errorCorrection: 'H'
    }
  }
];
