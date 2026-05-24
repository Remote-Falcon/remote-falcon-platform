import { describe, it, expect } from 'vitest';

import reducer, { activeItem, openDrawer } from '../menu';

describe('menu slice reducer', () => {
  const initial = reducer(undefined, { type: '@@INIT' });

  it('starts with the dashboard item selected and the drawer closed', () => {
    expect(initial).toEqual({ selectedItem: ['dashboard'], drawerOpen: false });
  });

  it('activeItem replaces selectedItem with the payload array', () => {
    const next = reducer(initial, activeItem(['analytics']));
    expect(next.selectedItem).toEqual(['analytics']);
  });

  it('openDrawer sets the drawer flag', () => {
    const next = reducer(initial, openDrawer(true));
    expect(next.drawerOpen).toBe(true);
    const closed = reducer(next, openDrawer(false));
    expect(closed.drawerOpen).toBe(false);
  });
});
