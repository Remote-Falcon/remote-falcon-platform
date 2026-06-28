/**
 * Move a category from one position to another and renumber every category's
 * `displayOrder` to match the new array order (0-based). Pure + non-mutating —
 * returns a fresh array so the caller can dispatch it straight to Redux.
 *
 * `displayOrder` is what the viewer page sorts category sections by
 * (externalViewer/helpers/categoryOrder.js), so keeping it in lockstep with the
 * dashboard array order means a drag here is reflected on the viewer page.
 *
 * @param {Array} categories current categories, in dashboard order
 * @param {number} fromIndex index being dragged
 * @param {number} toIndex   index it was dropped on
 * @returns {Array} reordered categories with contiguous displayOrder 0..n-1
 */
export const reorderCategories = (categories, fromIndex, toIndex) => {
  const next = [...(categories ?? [])];
  const within = (i) => Number.isInteger(i) && i >= 0 && i < next.length;
  if (within(fromIndex) && within(toIndex)) {
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
  }
  // Always renumber so displayOrder is contiguous and matches the array order,
  // normalizing any legacy null/gapped values in the process.
  return next.map((category, index) => ({ ...category, displayOrder: index }));
};
