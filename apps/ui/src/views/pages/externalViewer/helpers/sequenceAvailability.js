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

/** True when one sequence has reached the nightly limit that applies to it. */
const isSingleCapped = (seq, showLimit, categories) => {
  const limit = effectiveNightlyLimit(showLimit, seq?.category, categories);
  if (limit === null || limit === undefined || limit <= 0) return false;
  return (seq?.playsToday ?? 0) >= limit;
};

/**
 * True when the sequence has reached the nightly limit that applies to it.
 *
 * A group entry stands for every member: requesting or voting it queues or
 * plays them all, so it is capped as soon as ANY member is. #177 closed the
 * bypass that used to exempt groups from the cap altogether, and the server
 * now rejects a capped group, so this has to agree — otherwise a viewer gets
 * an error on something that looked available.
 */
export const isNightlyCapped = (seq, showLimit, categories, allSequences) => {
  if (!seq) return false;
  if (seq.group) {
    // Without the full list the other members aren't visible; fall back to
    // this entry's own tally rather than declaring the group available.
    if (!Array.isArray(allSequences)) return isSingleCapped(seq, showLimit, categories);
    return allSequences
      .filter((member) => member?.group && String(member.group).toLowerCase() === String(seq.group).toLowerCase())
      .some((member) => isSingleCapped(member, showLimit, categories));
  }
  return isSingleCapped(seq, showLimit, categories);
};

/**
 * True when the sequence should render as unavailable: either in its
 * post-play cooldown (visibilityCount) or capped for the night.
 */
export const isSequenceUnavailable = (seq, showLimit, categories, allSequences) =>
  (seq?.visibilityCount ?? 0) > 0 || isNightlyCapped(seq, showLimit, categories, allSequences);
