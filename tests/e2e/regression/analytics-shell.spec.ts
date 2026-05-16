import { test, expect } from '@playwright/test';

import { signUpAndSignIn } from './helpers';

// Regression: the modernized Analytics shell.
//
// The Analytics page is a tabbed shell with a sticky DateRangePicker in the
// PageHead actions slot, then a SubNav (Overview / Audience /
// Sequences (Jukebox) / Sequences (Voting)), then `<Outlet />` for the
// active sub-tab. This spec asserts the structural invariants — picker
// present, sub-nav reachability, preset persistence across sub-tabs —
// without depending on populated stats (the seed fixture has zero
// sequences so sub-tabs render empty states).
//
// Preset state comes from useAnalyticsFilters (dateRange.jsx). Default is
// `last-7` (label "Last 7 nights"); the URL search param is `range`.
test.describe('analytics shell', () => {
  test('renders DateRangePicker and reaches all four sub-tabs', async ({ page }) => {
    await signUpAndSignIn(page);

    await page.goto('/control-panel/analytics');
    await expect(page).toHaveURL(/\/control-panel\/analytics\/overview/, { timeout: 10_000 });

    // PageHead title — narrowed to a heading specifically named "Analytics"
    // because the Overview tab also renders h2 stat tiles ("0", etc.) and
    // a plain `h1, h2` locator hits strict-mode violations.
    await expect(page.getByRole('heading', { name: /^Analytics$/i })).toBeVisible();

    // The DateRangePicker chip-button labels with the current preset; default
    // = "Last 7 nights".
    const picker = page.getByRole('button', { name: /last 7 nights/i });
    await expect(picker).toBeVisible();

    // SubNav navigation. Tab labels + URL path segments.
    const tabs: Array<[RegExp, RegExp]> = [
      [/^audience$/i, /\/control-panel\/analytics\/audience/],
      [/^sequences \(jukebox\)$/i, /\/control-panel\/analytics\/sequences-jukebox/],
      [/^sequences \(voting\)$/i, /\/control-panel\/analytics\/sequences-voting/],
      [/^overview$/i, /\/control-panel\/analytics\/overview/]
    ];
    for (const [label, urlPattern] of tabs) {
      await page.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(urlPattern, { timeout: 10_000 });
      await expect(picker).toBeVisible();
    }
  });

  test('changing the preset persists across sub-tabs (URL+localStorage)', async ({ page }) => {
    await signUpAndSignIn(page);
    await page.goto('/control-panel/analytics/overview');

    // Open the preset menu and pick a non-default. "Last 30 nights" is always
    // available regardless of season config.
    await page.getByRole('button', { name: /last 7 nights/i }).click();
    await page.getByRole('menuitem', { name: /^last 30 nights$/i }).click();

    const picker = page.getByRole('button', { name: /last 30 nights/i });
    await expect(picker).toBeVisible();
    await expect(page).toHaveURL(/[?&]range=last-30/);

    // Hop to another sub-tab — picker label survives.
    await page.getByRole('link', { name: /^sequences \(jukebox\)$/i }).click();
    await expect(page).toHaveURL(/\/control-panel\/analytics\/sequences-jukebox/);
    await expect(page.getByRole('button', { name: /last 30 nights/i })).toBeVisible();
  });
});
