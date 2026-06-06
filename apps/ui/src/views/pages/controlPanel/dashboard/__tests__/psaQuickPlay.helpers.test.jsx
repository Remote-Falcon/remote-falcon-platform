import { describe, it, expect } from 'vitest';

import { visibleEnabledPsas } from '../psaQuickPlay.helpers';

// visibleEnabledPsas decides which PSAs the dashboard quick-play card shows.
// It must drop disabled / nameless PSAs (a disabled PSA no-ops the override)
// and present them in operator-defined `order`, without mutating the source.
describe('visibleEnabledPsas', () => {
  it('returns an empty array for null / undefined / empty input', () => {
    expect(visibleEnabledPsas(null)).toEqual([]);
    expect(visibleEnabledPsas(undefined)).toEqual([]);
    expect(visibleEnabledPsas([])).toEqual([]);
  });

  it('keeps enabled PSAs (true / null / undefined) and drops explicit false', () => {
    const input = [
      { name: 'A', enabled: true, order: 0 },
      { name: 'B', enabled: false, order: 1 },
      { name: 'C', order: 2 }, // undefined enabled => enabled
      { name: 'D', enabled: null, order: 3 } // null enabled => enabled
    ];
    expect(visibleEnabledPsas(input).map((p) => p.name)).toEqual(['A', 'C', 'D']);
  });

  it('drops null entries and entries without a name', () => {
    const input = [null, { enabled: true, order: 0 }, { name: '', order: 1 }, { name: 'Keep', order: 2 }];
    expect(visibleEnabledPsas(input).map((p) => p.name)).toEqual(['Keep']);
  });

  it('sorts by order ascending, treating missing order as 0', () => {
    const input = [
      { name: 'third', order: 5 },
      { name: 'first' }, // no order => 0
      { name: 'second', order: 2 }
    ];
    expect(visibleEnabledPsas(input).map((p) => p.name)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input array', () => {
    const input = [
      { name: 'B', order: 2 },
      { name: 'A', order: 1 }
    ];
    const snapshot = [...input];
    visibleEnabledPsas(input);
    expect(input).toEqual(snapshot);
  });
});
