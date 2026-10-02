import React from 'react';

// #190 - how a song row renders when the viewer can't request or vote on it
// right now (post-play cooldown or nightly cap, see sequenceAvailability.js).
//
// The reason used to live only in a `title` attribute. Phones have no hover,
// and the row's pointer-events:none blocked hover on desktop too, so nobody
// ever saw it. It is now a visible line under the artist.
//
// Dimming moved from the row to its content (image, name, artist) so the hint
// can render at full opacity: a child can't be more opaque than its parent.
// The row keeps pointer-events:none so it stays non-interactive.
//
// Operator page CSS can target:
//   .sequence-unavailable       the row (also carries aria-disabled="true")
//   .sequence-unavailable-hint  the reason line

export const UNAVAILABLE_ROW_CLASS = 'sequence-unavailable';
export const UNAVAILABLE_HINT_CLASS = 'sequence-unavailable-hint';

// Inline so they hold regardless of the operator's page CSS, as before #190.
export const UNAVAILABLE_ROW_STYLE = { pointerEvents: 'none' };
export const UNAVAILABLE_CONTENT_STYLE = { opacity: 0.4 };

// The hint's size is a default, not an override. Every stock template has a
// bare `div { font-size: 11px }` rule, which already sizes the artist line;
// an inline font-size would beat it and render the hint larger than the
// artist above it. :where() has zero specificity, so that rule (or any
// operator rule on .sequence-unavailable-hint) wins, and pages with no such
// rule still get a smaller line than the song name.
export const UNAVAILABLE_HINT_DEFAULT_CSS = `:where(.${UNAVAILABLE_HINT_CLASS}) { font-size: 0.8em; }`;

/** The visible reason a row is unavailable. */
export const unavailableHintText = (seq) =>
  (seq?.visibilityCount ?? 0) > 0 ? 'Available again soon' : 'Back next show';

/**
 * A DOM id for the row's hint, for aria-describedby. Sequence names are free
 * text, so anything outside [A-Za-z0-9_-] is replaced; the playlist index is
 * included so two names that sanitize alike still get distinct ids.
 */
export const unavailableHintId = (seq) => {
  const name = String(seq?.name ?? '').replace(/[^A-Za-z0-9_-]/g, '-');
  return `${UNAVAILABLE_HINT_CLASS}-${seq?.index ?? 'x'}-${name}`;
};

/**
 * Props for the row element. An available row gets only its base class, so
 * its markup is exactly what it was before #190.
 */
export const unavailableRowProps = (baseClassName, seq, unavailable) => {
  if (!unavailable) {
    return { className: baseClassName };
  }
  return {
    className: `${baseClassName} ${UNAVAILABLE_ROW_CLASS}`,
    style: UNAVAILABLE_ROW_STYLE,
    'aria-disabled': 'true',
    'aria-describedby': unavailableHintId(seq)
  };
};

/** The reason line, rendered after the artist line of an unavailable row. */
export const UnavailableHint = ({ sequence }) => (
  <div className={UNAVAILABLE_HINT_CLASS} id={unavailableHintId(sequence)}>
    {unavailableHintText(sequence)}
  </div>
);

/**
 * The row's children: image, name, artist line, and for an unavailable row the
 * dimmed versions of those plus the hint.
 *
 * Dimming adds no wrapper around the image (it gets an inline style), so
 * templates that size or float `.sequence-image` see the same element. The
 * name is a bare text node and can't take a style, so only an unavailable
 * row wraps it in an inline span.
 */
export const sequenceRowContent = ({ sequence, image, artistClassName, artistProps = {}, unavailable }) => {
  const dim = unavailable ? UNAVAILABLE_CONTENT_STYLE : undefined;
  const shownImage =
    unavailable && React.isValidElement(image)
      ? React.cloneElement(image, { style: { ...image.props.style, ...UNAVAILABLE_CONTENT_STYLE } })
      : image;
  return (
    <>
      {shownImage}
      {unavailable ? <span style={dim}>{sequence?.displayName}</span> : sequence?.displayName}
      <div data-key={sequence?.name} {...artistProps} className={artistClassName} style={dim}>
        {sequence?.artist}
      </div>
      {unavailable && <UnavailableHint sequence={sequence} />}
    </>
  );
};
