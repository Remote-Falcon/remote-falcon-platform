import { describe, it, expect } from 'vitest';

import menuItems from '../index';
import controlPanelGroups from '../controlPanel';

// The sidebar config is the contract MenuList renders against. NavGroup
// renders by `type === 'group'`; NavItem keys off `url` + `id`. A missing
// or renamed group blanks an entire chunk of the sidebar silently. These
// tests pin shape and the IDs that the route table also keys off.

describe('menu-items', () => {
  it('default export wraps the controlPanel groups under items', () => {
    expect(menuItems).toHaveProperty('items');
    expect(Array.isArray(menuItems.items)).toBe(true);
    expect(menuItems.items.length).toBe(controlPanelGroups.length);
  });

  it('every top-level group is type=group with id, title, children', () => {
    for (const g of controlPanelGroups) {
      expect(g.type).toBe('group');
      expect(typeof g.id).toBe('string');
      expect(g.title).toBeDefined();
      expect(Array.isArray(g.children)).toBe(true);
      expect(g.children.length).toBeGreaterThan(0);
    }
  });

  it('exposes the documented sidebar groups (show / account / community / admin)', () => {
    const ids = controlPanelGroups.map((g) => g.id);
    expect(ids).toContain('control-panel-show');
    expect(ids).toContain('control-panel-account');
    expect(ids).toContain('control-panel-community');
    expect(ids).toContain('control-panel-admin');
  });

  it('every leaf item has the required NavItem fields (id, type, icon)', () => {
    const leaves = controlPanelGroups.flatMap((g) => g.children);
    for (const leaf of leaves) {
      expect(typeof leaf.id).toBe('string');
      expect(leaf.type).toBe('item');
      // icon is a Tabler component reference, must be defined.
      expect(leaf.icon).toBeDefined();
      // url is either an internal route (/...), an external https link
      // (Docs/Discord/Facebook), or omitted entirely when the renderer
      // injects it at runtime (report-bug). Reject any other shape.
      if (leaf.url !== undefined) {
        expect(typeof leaf.url).toBe('string');
        expect(/^(\/|https?:)/.test(leaf.url)).toBe(true);
      } else {
        expect(leaf.external).toBe(true);
      }
    }
  });

  it('external links (https://) are flagged external + target', () => {
    const externals = controlPanelGroups
      .flatMap((g) => g.children)
      .filter((i) => typeof i.url === 'string' && i.url.startsWith('https://'));
    expect(externals.length).toBeGreaterThan(0);
    for (const item of externals) {
      expect(item.external).toBe(true);
      expect(item.target).toBe(true);
    }
  });

  it('the dashboard item is keyed `dashboard` and routes to /control-panel/dashboard', () => {
    const all = controlPanelGroups.flatMap((g) => g.children);
    const dashboard = all.find((i) => i.id === 'dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard.url).toBe('/control-panel/dashboard');
  });
});
