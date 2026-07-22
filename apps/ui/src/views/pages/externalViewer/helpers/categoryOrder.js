import _ from 'lodash';

// Uncategorized sequences lead the list (preserving their incoming sequence
// order); sequences whose category isn't in show.categories (orphaned — e.g. a
// stale category name) trail after every known category.
const UNCATEGORIZED_RANK = -1;
const ORPHAN_RANK = Number.MAX_SAFE_INTEGER;

/**
 * Order a show's sequences so the viewer page renders category sections in the
 * operator's dashboard order (Sequences → Categories tab).
 *
 * The viewer page builds a category section the first time it encounters a
 * member while walking the sequence list, so the order sections appear in is
 * just the order their first member appears. To honor the dashboard order we
 * stable-sort the sequences by each category's rank before that walk.
 *
 * Rank source: a category's `displayOrder` when set, otherwise its position in
 * `show.categories` — which is exactly the top-to-bottom order the Categories
 * tab renders. The sort is stable, so within a category members keep their
 * incoming order (the viewer service already sorts sequences by `order`), and
 * uncategorized songs keep theirs.
 *
 * Pure + non-mutating: returns a new array, leaving the input untouched.
 *
 * @param {Array} sequences  show.sequences (already sorted by `order`)
 * @param {Array} categories show.categories (dashboard array order)
 * @returns {Array} sequences reordered so categories group in dashboard order
 */
export const orderSequencesByCategory = (sequences, categories) => {
  const seqs = sequences ?? [];
  const cats = categories ?? [];

  // Collapse (displayOrder ?? array index) into a 0..n-1 rank per category name.
  const rankByName = new Map();
  cats
    .map((category, idx) => ({
      name: category?.name,
      sortKey: typeof category?.displayOrder === 'number' ? category.displayOrder : idx,
      idx
    }))
    .sort((a, b) => a.sortKey - b.sortKey || a.idx - b.idx)
    .forEach((category, position) => {
      if (category.name != null) rankByName.set(category.name, position);
    });

  const rankOf = (sequence) => {
    const category = sequence?.category;
    if (category == null || category === '') return UNCATEGORIZED_RANK;
    return rankByName.has(category) ? rankByName.get(category) : ORPHAN_RANK;
  };

  // _.sortBy is stable, so equal-rank sequences keep their incoming order.
  return _.sortBy(seqs, rankOf);
};
