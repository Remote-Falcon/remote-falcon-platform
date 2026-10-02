import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

import { pageLimitMessage } from '../pageLimit';
import PageTabsBar from '../PageTabsBar';

// #191: Duplicate adds a page, so it must honor the same five-page cap as
// the "New page" buttons. At the cap the menu item is disabled and explains
// why inline (disabled MenuItems never open a hover Tooltip).
describe('PageTabsBar: Duplicate respects the page limit', () => {
  const makePages = (n) =>
    Array.from({ length: n }, (_, i) => ({ name: `Page ${i + 1}`, html: '<p/>', active: i === 0 }));

  const renderBar = (pageCount, props = {}) => {
    const handlers = {
      onSelect: vi.fn(),
      onRename: vi.fn(),
      onDuplicate: vi.fn(),
      onSetLive: vi.fn(),
      onDelete: vi.fn(),
      onCreate: vi.fn()
    };
    render(
      <PageTabsBar
        pages={makePages(pageCount)}
        activeIndex={0}
        dirtyMap={{}}
        maxPages={5}
        {...handlers}
        {...props}
      />
    );
    return handlers;
  };

  const openMenuFor = (name) => {
    fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    return screen.getByRole('menu');
  };

  it('enables Duplicate below the cap (4 pages) and calls onDuplicate', () => {
    const { onDuplicate } = renderBar(4);
    const menu = openMenuFor('Page 2');
    const item = within(menu).getByRole('menuitem', { name: /Duplicate/ });
    expect(item.getAttribute('aria-disabled')).not.toBe('true');
    expect(within(menu).queryByText(/Delete one to duplicate/)).toBeNull();
    fireEvent.click(item);
    expect(onDuplicate).toHaveBeenCalledWith('Page 2');
  });

  it('disables Duplicate at the cap (5 pages) with an explanation', () => {
    // Not asserting on a click here: MUI blocks clicks on disabled items via
    // CSS pointer-events, which jsdom ignores. The host's handleDuplicate
    // guard and the server check back this up.
    renderBar(5);
    const menu = openMenuFor('Page 2');
    const item = within(menu).getByRole('menuitem', { name: /Duplicate/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.className).toMatch(/Mui-disabled/);
    expect(within(item).getByText('You have 5 pages. Delete one to duplicate.')).toBeTruthy();
  });

  it('keeps Duplicate enabled at the cap when canExceedMax (local env override)', () => {
    renderBar(5, { canExceedMax: true });
    const menu = openMenuFor('Page 2');
    const item = within(menu).getByRole('menuitem', { name: /Duplicate/ });
    expect(item.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('spells out the limit for shows already over the cap', () => {
    expect(pageLimitMessage(7, 5)).toBe('You have 7 pages; the limit is 5. Delete pages to duplicate.');
    renderBar(7);
    const menu = openMenuFor('Page 2');
    const item = within(menu).getByRole('menuitem', { name: /Duplicate/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });
});
