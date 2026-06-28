import { describe, expect, it } from 'vitest';

import { reorderCategories } from '../categoriesReorder';

const cats = (...names) => names.map((name) => ({ name }));

describe('reorderCategories', () => {
  it('moves a category down and renumbers displayOrder', () => {
    const result = reorderCategories(cats('A', 'B', 'C'), 0, 2);
    expect(result.map((c) => c.name)).toEqual(['B', 'C', 'A']);
    expect(result.map((c) => c.displayOrder)).toEqual([0, 1, 2]);
  });

  it('moves a category up and renumbers displayOrder', () => {
    const result = reorderCategories(cats('A', 'B', 'C'), 2, 0);
    expect(result.map((c) => c.name)).toEqual(['C', 'A', 'B']);
    expect(result.map((c) => c.displayOrder)).toEqual([0, 1, 2]);
  });

  it('preserves all other category fields', () => {
    const input = [
      { name: 'A', requestLimit: 5, antiConsecutive: true, color: '#fff' },
      { name: 'B', requestLimit: 0, antiConsecutive: false }
    ];
    const result = reorderCategories(input, 1, 0);
    expect(result[0]).toEqual({ name: 'B', requestLimit: 0, antiConsecutive: false, displayOrder: 0 });
    expect(result[1]).toEqual({ name: 'A', requestLimit: 5, antiConsecutive: true, color: '#fff', displayOrder: 1 });
  });

  it('normalizes legacy null/gapped displayOrder to contiguous 0..n-1', () => {
    const input = [
      { name: 'A', displayOrder: null },
      { name: 'B', displayOrder: 7 },
      { name: 'C' }
    ];
    // A no-op move (same index) still renumbers.
    const result = reorderCategories(input, 1, 1);
    expect(result.map((c) => c.displayOrder)).toEqual([0, 1, 2]);
    expect(result.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the input array or its objects', () => {
    const input = cats('A', 'B', 'C');
    const snapshot = JSON.parse(JSON.stringify(input));
    reorderCategories(input, 0, 2);
    expect(input).toEqual(snapshot);
  });

  it('tolerates out-of-range indices by renumbering without a move', () => {
    const result = reorderCategories(cats('A', 'B'), 5, 0);
    expect(result.map((c) => c.name)).toEqual(['A', 'B']);
    expect(result.map((c) => c.displayOrder)).toEqual([0, 1]);
  });

  it('tolerates null/undefined categories', () => {
    expect(reorderCategories(undefined, 0, 1)).toEqual([]);
    expect(reorderCategories(null, 0, 1)).toEqual([]);
  });
});
