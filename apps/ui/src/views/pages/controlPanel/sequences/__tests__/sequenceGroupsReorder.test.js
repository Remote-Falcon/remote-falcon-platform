import { describe, expect, it } from 'vitest';

import { reorderSequenceGroups } from '../sequenceGroupsReorder';

const groups = (...names) => names.map((name) => ({ name, visibilityCount: 0 }));

describe('reorderSequenceGroups', () => {
  it('moves a group down', () => {
    const result = reorderSequenceGroups(groups('A', 'B', 'C'), 0, 2);
    expect(result.map((g) => g.name)).toEqual(['B', 'C', 'A']);
  });

  it('moves a group up', () => {
    const result = reorderSequenceGroups(groups('A', 'B', 'C'), 2, 0);
    expect(result.map((g) => g.name)).toEqual(['C', 'A', 'B']);
  });

  it('preserves all group fields', () => {
    const input = [
      { name: 'A', visibilityCount: 3 },
      { name: 'B', visibilityCount: 0 }
    ];
    const result = reorderSequenceGroups(input, 1, 0);
    expect(result).toEqual([
      { name: 'B', visibilityCount: 0 },
      { name: 'A', visibilityCount: 3 }
    ]);
  });

  it('does not mutate the input array or its objects', () => {
    const input = groups('A', 'B', 'C');
    const snapshot = JSON.parse(JSON.stringify(input));
    reorderSequenceGroups(input, 0, 2);
    expect(input).toEqual(snapshot);
  });

  it('tolerates out-of-range indices by returning the list unmoved', () => {
    const result = reorderSequenceGroups(groups('A', 'B'), 5, 0);
    expect(result.map((g) => g.name)).toEqual(['A', 'B']);
  });

  it('tolerates null/undefined groups', () => {
    expect(reorderSequenceGroups(undefined, 0, 1)).toEqual([]);
    expect(reorderSequenceGroups(null, 0, 1)).toEqual([]);
  });
});
