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
 * #186 - mirror of the server's NIGHTLY_RESET_GAP_HOURS (plugins-api
 * PluginService, viewer GraphQLMutationService). playsToday resets lazily on
 * the first counted play of a new show night, so until then it still holds
 * last night's tally. A gap longer than this since lastPlayCountedAt means the
 * tally is stale and must not gray anything out, exactly as the server ignores
 * it when deciding SEQUENCE_UNAVAILABLE.
 */
export const NIGHTLY_RESET_GAP_HOURS = 6;

const OFFSET_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse a lastPlayCountedAt value to epoch millis, or null when absent or
 * unparseable. The server stamps it with a bare LocalDateTime.now() (de facto
 * UTC) and sends it without an offset, so a value with no zone is read as UTC
 * rather than the viewer's local time.
 */
export const parseServerDateTime = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  const text = String(value).trim();
  const time = Date.parse(OFFSET_SUFFIX.test(text) ? text : `${text}Z`);
  return Number.isNaN(time) ? null : time;
};

/**
 * True when playsToday belongs to the current show night: the last counted
 * play is known and no more than NIGHTLY_RESET_GAP_HOURS ago. Mirrors the
 * server's `lastPlayCounted != null && !lastPlayCounted.isBefore(now - gap)`.
 */
export const isNightlyTallyCurrent = (lastPlayCountedAt, now = Date.now()) => {
  const last = parseServerDateTime(lastPlayCountedAt);
  if (last === null) return false;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return last >= nowMs - NIGHTLY_RESET_GAP_HOURS * 60 * 60 * 1000;
};

// Options for the predicates below. `lastPlayCountedAt` gates the nightly cap
// on the tally being current (#186); omitting the key keeps the pre-#186
// behaviour of trusting playsToday as-is. `now` is injectable for tests.
const tallyIsStale = (options) =>
  Boolean(options) &&
  Object.prototype.hasOwnProperty.call(options, 'lastPlayCountedAt') &&
  !isNightlyTallyCurrent(options.lastPlayCountedAt, options.now ?? Date.now());

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
 * Group rows need no special case here. The viewer query collapses a group to
 * a single representative row and never sends the other members, so the
 * client cannot evaluate "is any member capped" itself. Instead the server
 * stamps that row's playsToday when the group is capped
 * (GraphQLQueryService.stampGroupNightlyCap), so the same comparison below
 * gives the group the right answer.
 *
 * Pass `{ lastPlayCountedAt, now }` as the fourth argument to ignore a stale
 * playsToday from a previous show night (#186). A null lastPlayCountedAt in
 * that object means no play was ever counted, so nothing is capped.
 */
export const isNightlyCapped = (seq, showLimit, categories, options) =>
  !tallyIsStale(options) && isSingleCapped(seq, showLimit, categories);

/**
 * True when the sequence should render as unavailable: either in its
 * post-play cooldown (visibilityCount) or capped for the night. The cooldown
 * is not subject to the staleness gate; `options` only affects the cap.
 */
export const isSequenceUnavailable = (seq, showLimit, categories, options) =>
  (seq?.visibilityCount ?? 0) > 0 || isNightlyCapped(seq, showLimit, categories, options);
