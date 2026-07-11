/**
 * Move a sequence group from one position to another. Pure + non-mutating —
 * returns a fresh array so the caller can dispatch it straight to Redux.
 *
 * Sequence group order IS the array order: updateSequenceGroups does a
 * full-array replace, so persisting the reordered array is what makes the drag
 * stick. Unlike Sequence/PSA/Category, SequenceGroup carries no numeric order
 * field — the viewer positions a group at its first member's sequence order, so
 * order here is organizational, scoped to the Groups tab.
 *
 * @param {Array} groups current sequence groups, in display order
 * @param {number} fromIndex index being dragged
 * @param {number} toIndex   index it was dropped on
 * @returns {Array} groups with the item moved
 */
export const reorderSequenceGroups = (groups, fromIndex, toIndex) => {
  const next = [...(groups ?? [])];
  const within = (i) => Number.isInteger(i) && i >= 0 && i < next.length;
  if (within(fromIndex) && within(toIndex)) {
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
  }
  return next;
};
