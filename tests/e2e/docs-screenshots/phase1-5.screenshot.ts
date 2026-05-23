import { expect, test } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Shots 11–14: pages added to the docs IA in the Phase 1.5 restructure.
//
//   11. analytics       — /control-panel/analytics/overview, full-page
//   12. image-hosting   — /control-panel/image-hosting, full-page
//   13. shows-map       — /control-panel/shows-map, full-page (needs
//                          preferences.showOnMap=true + lat/lng so the
//                          pin renders instead of the opt-in CTA)
//   14. viewer-page     — /control-panel/viewer-page, full-page (the
//                          Monaco editor + preview pane + tabs strip)
//
// All four are full-page captures using `*-root` testids per SELECTORS.md
// rows 11–14. All require auth.

test.describe('docs-screenshots: phase 1.5 pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
    await signIn(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    // signIn doesn't await the post-submit redirect; without this wait the
    // next goto() races the JWT context update and the auth guard bounces
    // us back to the landing page.
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
  });

  test('analytics', async ({ page }, testInfo) => {
    await page.goto('/control-panel/analytics/overview');
    await page
      .locator('[data-testid="analytics-root"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'analytics', {
      alt: 'Analytics Overview tab in the control panel',
      state: 'default',
    });
  });

  test('image-hosting', async ({ page }, testInfo) => {
    await page.goto('/control-panel/image-hosting');
    await page
      .locator('[data-testid="image-hosting-root"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'image-hosting', {
      alt: 'Image Hosting page in the control panel',
      state: 'default',
    });
  });

  test('shows-map', async ({ page }, testInfo) => {
    await page.goto('/control-panel/shows-map');
    await page
      .locator('[data-testid="shows-map-root"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'shows-map', {
      alt: 'Shows Map page with the fixture show pinned',
      state: 'default',
    });
  });

  test('viewer-page', async ({ page }, testInfo) => {
    await page.goto('/control-panel/viewer-page');
    await page
      .locator('[data-testid="viewer-page-root"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'viewer-page', {
      alt: 'Viewer Page HTML editor with live preview',
      state: 'default',
    });
  });
});
