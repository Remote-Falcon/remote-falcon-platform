/**
 * Column sorting for the sequences table, and the "save this sort as the
 * viewer page order" operation built on top of it.
 *
 * Two orders exist and owners conflate them constantly:
 *   - the TABLE sort (clicking a column header) — a view, nothing persisted
 *   - `sequence.order` — the field the viewer service sorts on
 *     (GraphQLQueryService sorts by Sequence::getOrder), i.e. the actual
 *     song order on the viewer page
 *
 * The old control panel had a "Sort Alphabetically" button that wrote the
 * second from the first; the dashboard rebuild (#26) dropped it, leaving
 * drag-and-drop as the only way to set viewer order. `applySortAsOrder`
 * restores that path for ANY sortable column.
 *
 * Both functions share one comparator on purpose: what the owner previews
 * in the table is byte-for-byte what gets saved, so the two can never drift.
 */

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

// Case- and accent-insensitive, and numeric-aware so "Song 2" precedes
// "Song 10". Punctuation still sorts ahead of letters under this collation,
// which is what makes the common "* prefix = new this year" convention work.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * Compare two sequences on one column. Blanks are pinned last in BOTH
 * directions — flipping to descending on a sparsely-filled column (Artist,
 * Category) should not bury every real value under a screen of empty cells.
 */
const compareOn = (a, b, key, descending) => {
  const av = a?.[key];
  const bv = b?.[key];

  const aBlank = isBlank(av);
  const bBlank = isBlank(bv);
  if (aBlank || bBlank) {
    if (aBlank && bBlank) return 0;
    return aBlank ? 1 : -1;
  }

  let result;
  if (typeof av === 'number' && typeof bv === 'number') {
    result = av - bv;
  } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
    result = Number(av) - Number(bv);
  } else {
    result = collator.compare(String(av), String(bv));
  }

  return descending ? -result : result;
};

/**
 * Sort sequences by a column. Pure + non-mutating; Array.prototype.sort is
 * stable, so rows with equal keys keep their incoming order.
 *
 * @param {Array} sequences show.sequences (any order)
 * @param {string} orderBy  column key ('displayName', 'artist', 'order', …)
 * @param {'asc'|'desc'} order direction
 * @returns {Array} a new array, same objects, sorted
 */
export const sortSequencesByColumn = (sequences, orderBy, order = 'asc') => {
  const list = [...(sequences ?? [])];
  if (!orderBy) return list;
  const descending = order === 'desc';
  return list.sort((a, b) => compareOn(a, b, orderBy, descending));
};

/**
 * Take the current column sort and make it the viewer page order: sort, then
 * renumber `order` 0..n-1 so the array position and the persisted field agree
 * (gap-free, inactive rows included — they still hold a slot, and skipping
 * them would leave holes the next drag has to reconcile).
 *
 * Callers must pass the FULL sequence list, not a filtered view: `order` is
 * global, so renumbering a subset would silently reshuffle the rest.
 *
 * @param {Array} sequences show.sequences
 * @param {string} orderBy  column key currently sorted in the table
 * @param {'asc'|'desc'} order direction currently shown
 * @returns {Array} new sequence objects with `order` rewritten
 */
export const applySortAsOrder = (sequences, orderBy, order = 'asc') =>
  sortSequencesByColumn(sequences, orderBy, order).map((sequence, i) => ({ ...sequence, order: i }));
