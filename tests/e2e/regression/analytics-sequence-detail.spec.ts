import { test, expect } from '@playwright/test';

import { signUpAndSignIn } from './helpers';

// Regression: the analytics SequenceDetail drill-down page.
//
// Route lives OUTSIDE the Analytics shell (MainRoutes.jsx) so it renders its
// own back link and date-range picker rather than inheriting from the SubNav
// shell. The page is bookmarkable per the PRD — owners share these URLs in
// Facebook groups — so deep-link rendering is the canonical entry path.
//
// What we assert:
//   1. Deep-link to a sequence the show doesn't have → empty state + back
//      link + DateRangePicker still present (we just added the picker).
//   2. The back link routes to the Sequences sub-tab.
//   3. The DateRangePicker on this page changes the URL `range=` param.
//
// What we can NOT assert with the current seed fixture:
//   - ApexLineChart renders (needs `stats.jukeboxByDate` or `votingByDate`
//     populated with the target sequence name). Defer until the fixture is
//     extended with a multi-day stats series.
test.describe('analytics sequence detail (deep-link)', () => {
  test('deep-link to an unknown sequence renders empty state + back link + picker', async ({ page }) => {
    await signUpAndSignIn(page);

    // Pick any URL-safe sequence name. The page decodes the param and falls
    // back to the raw name as displayName when no matching sequence is in
    // show.sequences[].
    const name = 'Test%20Sequence';
    await page.goto(`/control-panel/analytics/sequence/${name}`);

    // Back link is present and reads as expected.
    const backLink = page.getByRole('link', { name: /back to sequences/i });
    await expect(backLink).toBeVisible();

    // DateRangePicker (the regression we just fixed — it didn't render here
    // before). Default preset = "Last 7 nights".
    await expect(page.getByRole('button', { name: /last 7 nights/i })).toBeVisible();

    // Empty state — fixture has no sequence stats so the page falls into the
    // "no activity in this range" branch (SequenceDetail.jsx:196).
    await expect(page.locator('body')).toContainText(/no .* activity for "Test Sequence" in this range/i);
  });

  test('back link returns to the sequences sub-tab', async ({ page }) => {
    await signUpAndSignIn(page);

    await page.goto('/control-panel/analytics/sequence/Anything');
    await page.getByRole('link', { name: /back to sequences/i }).click();
    await expect(page).toHaveURL(/\/control-panel\/analytics\/sequences/, { timeout: 10_000 });
  });

  test('changing the picker on detail page updates the URL', async ({ page }) => {
    await signUpAndSignIn(page);

    await page.goto('/control-panel/analytics/sequence/Anything');

    await page.getByRole('button', { name: /last 7 nights/i }).click();
    await page.getByRole('menuitem', { name: /^last 30 nights$/i }).click();

    await expect(page.getByRole('button', { name: /last 30 nights/i })).toBeVisible();
    await expect(page).toHaveURL(/[?&]range=last-30/);
  });
});
