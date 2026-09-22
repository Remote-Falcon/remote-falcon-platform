// Whether a sequence should render grayed out on the viewer page.
//
// This is the client half of a decision the server also makes. It must agree
// with NightlyPlayLimitHelper (libs/schema), which backs the plugin's play
// selection and the viewer's SEQUENCE_UNAVAILABLE rejection: if the client
// grays out something the server would accept, the viewer loses a song they
// could have had; if it doesn't gray out something the server rejects, they
// get an error instead of a request.
//
// sequenceAvailability.test.js pins the same null/0/>0 matrix as
// NightlyPlayLimitHelperTest for exactly that reason.

/**
 * The nightly play limit in force for a song, or null when none applies.
 *
 * A category's own limit wins over the show's: null means inherit, 0 means
 * never capped, >0 is that category's limit. Zero reads as "no cap" on both
 * the category and the show setting.
 */
export const effectiveNightlyLimit = (showLimit, sequenceCategory, categories) => {
  if (sequenceCategory && Array.isArray(categories)) {
    const match = categories.find(
      (category) => category?.name && category.name.toLowerCase() === String(sequenceCategory).toLowerCase()
    );
    if (match) {
      // null/undefined means inherit, so fall through to the show limit
      // rather than reading the category as uncapped.
      return match.nightlyPlayLimit ?? showLimit ?? null;
    }
  }
  // No category, or one that no longer exists: behave as before this existed.
  return showLimit ?? null;
};

/** True when the sequence has reached the nightly limit that applies to it. */
export const isNightlyCapped = (seq, showLimit, categories) => {
  // Group entries carry a representative member's playsToday, and the server
  // never applies the nightly cap to a grouped request or vote, so the client
  // must not either.
  if (!seq || seq.group) return false;
  const limit = effectiveNightlyLimit(showLimit, seq.category, categories);
  if (limit === null || limit === undefined || limit <= 0) return false;
  return (seq.playsToday ?? 0) >= limit;
};

/**
 * True when the sequence should render as unavailable: either in its
 * post-play cooldown (visibilityCount) or capped for the night.
 */
export const isSequenceUnavailable = (seq, showLimit, categories) =>
  (seq?.visibilityCount ?? 0) > 0 || isNightlyCapped(seq, showLimit, categories);
