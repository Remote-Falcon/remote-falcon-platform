// Translates our flat style state into a qr-code-styling options object.
// Pure (no DOM) so QrPreview and the download path build identical options
// at any size, and so the mapping is unit-testable without a canvas.

import { EMBLEMS } from './presets';

// A center emblem punches a hole in the QR matrix; force the highest error
// correction so the code still scans regardless of the operator's chosen EC.
export const effectiveErrorCorrection = (style) =>
  style.emblem && style.emblem !== 'none' ? 'H' : style.errorCorrection;

export const buildQrOptions = (style, data, size = 1024, type = 'canvas') => {
  const dotsOptions = style.gradient
    ? {
        type: style.dotStyle,
        gradient: {
          type: 'linear',
          rotation: 0,
          colorStops: [
            { offset: 0, color: style.fgColor },
            { offset: 1, color: style.gradientColor }
          ]
        }
      }
    : { type: style.dotStyle, color: style.fgColor };

  const emblemUri = style.emblem && style.emblem !== 'none' ? EMBLEMS[style.emblem]?.dataUri : null;

  return {
    width: size,
    height: size,
    type,
    data: data || '',
    margin: Math.round(size * 0.04),
    qrOptions: { errorCorrectionLevel: effectiveErrorCorrection(style) },
    dotsOptions,
    backgroundOptions: { color: style.bgColor },
    cornersSquareOptions: { type: style.cornerStyle, color: style.fgColor },
    cornersDotOptions: { color: style.fgColor },
    ...(emblemUri
      ? {
          image: emblemUri,
          imageOptions: { crossOrigin: 'anonymous', margin: 6, imageSize: 0.35, hideBackgroundDots: true }
        }
      : {})
  };
};
