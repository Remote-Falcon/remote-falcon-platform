import { expect, test } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Sequences routes: list, groups, categories, special roles.
// All authenticated, all full-page. The fixture show is seeded with
// 8–12 sequences, ≥3 sequence groups, and 6 first-class categories
// (matching the sequences' category strings) per PRD Appendix A.3.

test.describe('docs-screenshots: sequences', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
    await signIn(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    // signIn doesn't await the post-submit redirect; without this wait the
    // next goto() races the JWT context update and the auth guard bounces
    // us back to the landing page.
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
  });

  test('sequences-list', async ({ page }, testInfo) => {
    await page.goto('/control-panel/sequences/list');
    await page
      .locator('[data-testid="sequences-list-root"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'sequences-list', {
      alt: 'Sequences list page with the fixture show sequences populated',
      state: 'default',
    });
  });

  // The sort banner only exists while a column sort is active, and the
  // sort is client-side view state — no seed dependency, but the list has
  // to be hydrated before the header click registers against real rows.
  test('sequences-sort-preview', async ({ page }, testInfo) => {
    await page.goto('/control-panel/sequences/list');
    await page
      .locator('[data-testid="sequences-list-root"]')
      .waitFor({ state: 'visible' });
    await page
      .locator('[data-testid="sequences-sort-header-displayName"]')
      .click();
    // Banner renders on the same tick as the re-sort; waiting on it (rather
    // than the rows) is what proves the preview state actually engaged.
    await page
      .locator('[data-testid="sequences-sort-banner"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'sequences-sort-preview', {
      alt: 'Sequences list sorted by Display name with the preview banner offering to save the sort as the viewer page order',
      state: 'sort-active',
    });
  });

  test('sequences-groups', async ({ page }, testInfo) => {
    await page.goto('/control-panel/sequences/groups');
    await page
      .locator('[data-testid="sequences-groups-root"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'sequences-groups', {
      alt: 'Sequence groups page with the fixture show groups populated',
      state: 'default',
    });
  });

  test('sequences-categories', async ({ page }, testInfo) => {
    await page.goto('/control-panel/sequences/categories');
    await page
      .locator('[data-testid="sequences-categories-root"]')
      .waitFor({ state: 'visible' });
    // Rows hydrate from the show query's categories[]. Wait for a seeded
    // category name so we never capture the empty "no categories yet" state.
    await page
      .locator('[data-testid="sequences-categories-root"]')
      .getByText('Traditional', { exact: true })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await takeScreenshot(page, testInfo, 'fullPage', 'sequences-categories', {
      alt: 'Categories tab with request limits, no-back-to-back toggles, and drag-to-reorder rows',
      state: 'default',
    });
  });

  test('sequences-special-roles', async ({ page }, testInfo) => {
    await page.goto('/control-panel/sequences/special-roles');
    await page
      .locator('[data-testid="special-roles-tab"]')
      .waitFor({ state: 'visible' });
    // Wait for the PSA table to hydrate from the show query so the rows
    // (and the Leaders pickers below) are populated before we capture.
    await page
      .locator('[data-testid="psa-table"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'sequences-special-roles', {
      alt: 'Special Roles tab showing the PSAs list and Leader sequence pickers',
      state: 'default',
    });
  });
});
