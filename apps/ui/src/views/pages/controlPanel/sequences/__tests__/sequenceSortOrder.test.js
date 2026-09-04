import { describe, expect, it } from 'vitest';

import { applySortAsOrder, sortSequencesByColumn } from '../sequenceSortOrder';

// Sequences as the table sees them: `order` is the persisted viewer-page
// position, everything else is display metadata.
const seq = (name, extra = {}) => ({
  name,
  displayName: name,
  index: 0,
  active: true,
  visible: true,
  ...extra
});

const names = (list) => list.map((s) => s.displayName);

describe('sortSequencesByColumn', () => {
  it('sorts strings case-insensitively, so "apple" precedes "Zebra"', () => {
    const result = sortSequencesByColumn([seq('Zebra'), seq('apple')], 'displayName', 'asc');
    expect(names(result)).toEqual(['apple', 'Zebra']);
  });

  it('keeps asterisk-prefixed names first ascending — the "new this year" workflow', () => {
    const list = [seq('Carol of the Bells'), seq('*Frozen'), seq('Amazing Grace'), seq('*Angels')];
    expect(names(sortSequencesByColumn(list, 'displayName', 'asc'))).toEqual([
      '*Angels',
      '*Frozen',
      'Amazing Grace',
      'Carol of the Bells'
    ]);
  });

  it('reverses on desc', () => {
    const result = sortSequencesByColumn([seq('B'), seq('A'), seq('C')], 'displayName', 'desc');
    expect(names(result)).toEqual(['C', 'B', 'A']);
  });

  it('orders embedded numbers naturally (2 before 10)', () => {
    const list = [seq('Song 10'), seq('Song 2'), seq('Song 1')];
    expect(names(sortSequencesByColumn(list, 'displayName', 'asc'))).toEqual(['Song 1', 'Song 2', 'Song 10']);
  });

  it('compares numeric columns numerically, not lexically', () => {
    const list = [seq('a', { index: 10 }), seq('b', { index: 2 }), seq('c', { index: 100 })];
    expect(names(sortSequencesByColumn(list, 'index', 'asc'))).toEqual(['b', 'a', 'c']);
  });

  it('sorts booleans false-first ascending', () => {
    const list = [seq('on', { active: true }), seq('off', { active: false })];
    expect(names(sortSequencesByColumn(list, 'active', 'asc'))).toEqual(['off', 'on']);
    expect(names(sortSequencesByColumn(list, 'active', 'desc'))).toEqual(['on', 'off']);
  });

  it('pins blanks last in BOTH directions so empty cells never head the list', () => {
    const list = [seq('a', { artist: 'Mannheim' }), seq('b', { artist: '' }), seq('c', { artist: 'Bing' })];
    expect(names(sortSequencesByColumn(list, 'artist', 'asc'))).toEqual(['c', 'a', 'b']);
    expect(names(sortSequencesByColumn(list, 'artist', 'desc'))).toEqual(['a', 'c', 'b']);
  });

  it('treats null and undefined as blank', () => {
    const list = [seq('a', { category: null }), seq('b', { category: 'Rock' }), seq('c', {})];
    expect(names(sortSequencesByColumn(list, 'category', 'asc'))).toEqual(['b', 'a', 'c']);
  });

  it('sorts by the canonical order field when asked', () => {
    const list = [seq('c', { order: 2 }), seq('a', { order: 0 }), seq('b', { order: 1 })];
    expect(names(sortSequencesByColumn(list, 'order', 'asc'))).toEqual(['a', 'b', 'c']);
  });

  it('is stable — equal keys keep their incoming order', () => {
    const list = [seq('b', { group: 'G' }), seq('a', { group: 'G' }), seq('c', { group: 'G' })];
    expect(names(sortSequencesByColumn(list, 'group', 'asc'))).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate its input', () => {
    const list = [seq('B'), seq('A')];
    const snapshot = JSON.parse(JSON.stringify(list));
    sortSequencesByColumn(list, 'displayName', 'asc');
    expect(list).toEqual(snapshot);
  });

  it('tolerates null/undefined lists', () => {
    expect(sortSequencesByColumn(null, 'displayName', 'asc')).toEqual([]);
    expect(sortSequencesByColumn(undefined, 'displayName', 'asc')).toEqual([]);
  });
});

describe('applySortAsOrder', () => {
  it('renumbers order 0..n-1 to match the sorted view', () => {
    const list = [
      seq('Carol', { order: 0 }),
      seq('*Frozen', { order: 1 }),
      seq('Amazing', { order: 2 })
    ];
    const result = applySortAsOrder(list, 'displayName', 'asc');
    expect(result.map((s) => [s.displayName, s.order])).toEqual([
      ['*Frozen', 0],
      ['Amazing', 1],
      ['Carol', 2]
    ]);
  });

  it('produces exactly the order the preview showed', () => {
    const list = [seq('c'), seq('a'), seq('b')];
    const preview = sortSequencesByColumn(list, 'displayName', 'asc');
    const applied = applySortAsOrder(list, 'displayName', 'asc');
    expect(names(applied)).toEqual(names(preview));
  });

  it('renumbers inactive sequences too, so order stays gap-free', () => {
    const list = [seq('b', { order: 0, active: false }), seq('a', { order: 1 })];
    const result = applySortAsOrder(list, 'displayName', 'asc');
    expect(result.map((s) => s.order)).toEqual([0, 1]);
    expect(names(result)).toEqual(['a', 'b']);
  });

  it('preserves every other field on each sequence', () => {
    const list = [seq('b', { order: 0, artist: 'X', imageUrl: 'u', category: 'C' })];
    const [result] = applySortAsOrder(list, 'displayName', 'asc');
    expect(result).toEqual({ ...list[0], order: 0 });
  });

  it('does not mutate the input sequences', () => {
    const list = [seq('b', { order: 0 }), seq('a', { order: 1 })];
    const snapshot = JSON.parse(JSON.stringify(list));
    applySortAsOrder(list, 'displayName', 'asc');
    expect(list).toEqual(snapshot);
  });

  it('tolerates an empty list', () => {
    expect(applySortAsOrder([], 'displayName', 'asc')).toEqual([]);
    expect(applySortAsOrder(null, 'displayName', 'asc')).toEqual([]);
  });
});
