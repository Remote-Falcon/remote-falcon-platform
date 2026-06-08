import { expect, test } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Shots 9–10: sequences routes.
// Both authenticated, both full-page. The fixture show is seeded with
// 8–12 sequences and ≥3 sequence groups per PRD Appendix A.3.

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
