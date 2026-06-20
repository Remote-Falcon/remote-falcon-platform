import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { Box } from '@mui/material';
import PropTypes from 'prop-types';

import QRCodeStyling from 'qr-code-styling';

import { buildQrOptions } from './qrOptions';
import { composeCard } from './renderCard';

// Thin wrapper around qr-code-styling. Rebuilds the on-screen preview on every
// change and, via the imperative handle, mints throwaway instances at export
// resolution so a 2048px download never resizes (or blurs) the preview. The
// library is DOM-only — fine here since the whole QR Code route is lazy-loaded.
const QrPreview = forwardRef(({ data, style, size = 280, card = null }, ref) => {
  const containerRef = useRef(null);
  const cardEnabled = Boolean(card);

  // qr-code-styling's update() DEEP-MERGES options, so dropping a key — e.g.
  // turning off a gradient or clearing a center emblem — leaves the old value
  // in place and the preview goes stale (the new style applies on add but
  // never on remove). Recreating the instance each change keeps the preview an
  // exact mirror of the current style; trivially cheap at preview resolution.
  //
  // In card mode we composite the QR onto the same captioned card the download
  // produces (via the shared composeCard), so what's on screen is the exact
  // image that gets saved. That path is async — we abort stale renders and only
  // swap the DOM once the new card is ready, so typing a caption never flashes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let cancelled = false;

    if (!cardEnabled) {
      const qr = new QRCodeStyling(buildQrOptions(style, data, size));
      el.replaceChildren();
      qr.append(el);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const blob = await new QRCodeStyling(buildQrOptions(style, data, size, 'canvas')).getRawData('png');
        if (cancelled || !blob) return;
        const canvas = await composeCard(blob, {
          title: card.title,
          caption: card.caption,
          fgColor: style.fgColor,
          bgColor: style.bgColor
        });
        if (cancelled) return;
        el.replaceChildren(canvas);
      } catch {
        // Leave the prior preview in place on a transient render failure.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, style, size, cardEnabled, card?.title, card?.caption]);

  useImperativeHandle(
    ref,
    () => ({
      // Returns a PNG Blob at the requested size for card compositing.
      getPngBlob: (exportSize) => new QRCodeStyling(buildQrOptions(style, data, exportSize, 'canvas')).getRawData('png'),
      // Triggers a direct browser download of a plain code.
      download: (format, exportSize, name) =>
        new QRCodeStyling(buildQrOptions(style, data, exportSize, format === 'svg' ? 'svg' : 'canvas')).download({
          name,
          extension: format
        })
    }),
    [data, style]
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        '& canvas, & svg': {
          width: size,
          height: 'auto',
          maxWidth: '100%',
          borderRadius: 1,
          display: 'block'
        }
      }}
    />
  );
});

QrPreview.displayName = 'QrPreview';

QrPreview.propTypes = {
  data: PropTypes.string,
  style: PropTypes.object.isRequired,
  size: PropTypes.number,
  // When set, the preview renders the captioned yard-sign card instead of the
  // bare code — the exact image the PNG-card download produces.
  card: PropTypes.shape({
    title: PropTypes.string,
    caption: PropTypes.string
  })
};

export default QrPreview;
