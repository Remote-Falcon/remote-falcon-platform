import { describe, expect, it } from 'vitest';

import { orderSequencesByCategory } from '../categoryOrder';

// Helper: collapse the result to the category-section order the viewer page
// would render (first-encounter walk), so assertions read like the UI.
const sectionOrder = (sequences) => {
  const seen = [];
  sequences.forEach((s) => {
    const key = s.category == null || s.category === '' ? '(uncategorized)' : s.category;
    if (!seen.includes(key)) seen.push(key);
  });
  return seen;
};

describe('orderSequencesByCategory', () => {
  it('orders category sections by dashboard array order, not by sequence order', () => {
    // Sequences arrive ordered such that "Spooky" would be encountered first,
    // but the dashboard lists Christmas before Spooky.
    const sequences = [
      { name: 'a', category: 'Spooky', order: 1 },
      { name: 'b', category: 'Christmas', order: 2 },
      { name: 'c', category: 'Spooky', order: 3 }
    ];
    const categories = [{ name: 'Christmas' }, { name: 'Spooky' }];

    expect(sectionOrder(orderSequencesByCategory(sequences, categories))).toEqual(['Christmas', 'Spooky']);
  });

  it('honors displayOrder when set, overriding array position', () => {
    const sequences = [
      { name: 'a', category: 'Christmas' },
      { name: 'b', category: 'Spooky' }
    ];
    const categories = [
      { name: 'Christmas', displayOrder: 2 },
      { name: 'Spooky', displayOrder: 1 }
    ];

    expect(sectionOrder(orderSequencesByCategory(sequences, categories))).toEqual(['Spooky', 'Christmas']);
  });

  it('keeps member order within a category stable (sort is stable)', () => {
    const sequences = [
      { name: 'x', category: 'Christmas', order: 1 },
      { name: 'y', category: 'Spooky', order: 2 },
      { name: 'z', category: 'Christmas', order: 3 }
    ];
    const categories = [{ name: 'Christmas' }, { name: 'Spooky' }];

    const result = orderSequencesByCategory(sequences, categories);
    expect(result.map((s) => s.name)).toEqual(['x', 'z', 'y']);
  });

  it('leads with uncategorized sequences, preserving their order', () => {
    const sequences = [
      { name: 'cat1', category: 'Christmas' },
      { name: 'free1', category: '' },
      { name: 'free2', category: null },
      { name: 'cat2', category: 'Christmas' }
    ];
    const categories = [{ name: 'Christmas' }];

    expect(orderSequencesByCategory(sequences, categories).map((s) => s.name)).toEqual([
      'free1',
      'free2',
      'cat1',
      'cat2'
    ]);
  });

  it('trails sequences whose category is not in show.categories (orphans)', () => {
    const sequences = [
      { name: 'orphan', category: 'Deleted' },
      { name: 'known', category: 'Christmas' }
    ];
    const categories = [{ name: 'Christmas' }];

    expect(sectionOrder(orderSequencesByCategory(sequences, categories))).toEqual(['Christmas', 'Deleted']);
  });

  it('does not mutate the input array', () => {
    const sequences = [
      { name: 'a', category: 'Spooky' },
      { name: 'b', category: 'Christmas' }
    ];
    const original = [...sequences];
    orderSequencesByCategory(sequences, [{ name: 'Christmas' }, { name: 'Spooky' }]);
    expect(sequences).toEqual(original);
  });

  it('is a no-op-safe passthrough when there are no categories', () => {
    const sequences = [
      { name: 'a', category: '' },
      { name: 'b', category: null }
    ];
    expect(orderSequencesByCategory(sequences, []).map((s) => s.name)).toEqual(['a', 'b']);
    expect(orderSequencesByCategory(sequences, undefined).map((s) => s.name)).toEqual(['a', 'b']);
  });

  it('tolerates undefined sequences', () => {
    expect(orderSequencesByCategory(undefined, [{ name: 'Christmas' }])).toEqual([]);
  });
});
