import { expect, test } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';
import {
  flipShowMode,
  restoreShowMode,
  waitForDashboardData,
} from './utils/state-helpers';

// Shots 3–8: dashboard cards on /control-panel/dashboard.
//
// All require auth. We log in once per spec (Playwright runs each test in
// a fresh context anyway under the default isolation, so each `test()`
// below performs the signIn step). The mode-flip variant (shot 5) does its
// work last so the cheaper, mode-agnostic captures aren't blocked by the
// Mongo write + page reload cycle.
//
// Per Appendix B.3 the live "active" tile is the SAME DOM element
// (`dashboard-active-tile`) regardless of JUKEBOX vs VOTING; we capture
// it twice under different filenames after flipping the show mode.

test.describe('docs-screenshots: dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
    await signIn(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    // signIn doesn't await the post-submit redirect; without this wait the
    // next goto() races the JWT context update and the auth guard bounces
    // us back to the landing page.
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
    await page.goto('/control-panel/dashboard');
    await waitForDashboardData(page);
  });

  // Cheap, mode-agnostic shots first.

  test('dashboard-show-health', async ({ page }, testInfo) => {
    const card = page.locator('[data-testid="dashboard-show-health"]');
    await takeScreenshot(page, testInfo, card, 'dashboard-show-health', {
      alt: 'Show Health card on the Dashboard',
      state: 'default',
    });
  });

  test('dashboard-now-playing', async ({ page }, testInfo) => {
    const card = page.locator('[data-testid="dashboard-now-playing"]');
    await takeScreenshot(page, testInfo, card, 'dashboard-now-playing', {
      alt: 'Now Playing card on the Dashboard with PSA and Leader queue chips',
      state: 'default',
    });
  });

  test('dashboard-psa-quick-play', async ({ page }, testInfo) => {
    const card = page.locator('[data-testid="dashboard-psa-quick-play"]');
    await takeScreenshot(page, testInfo, card, 'dashboard-psa-quick-play', {
      alt: 'PSA quick-play card on the Dashboard',
      state: 'default',
    });
  });

  test('dashboard-checklist', async ({ page }, testInfo) => {
    const card = page.locator('[data-testid="dashboard-checklist"]');
    await takeScreenshot(page, testInfo, card, 'dashboard-checklist', {
      alt: 'Pre-show checklist on the Dashboard',
      state: 'default',
    });
  });

  test('dashboard-viewers-now', async ({ page }, testInfo) => {
    const tile = page.locator('[data-testid="dashboard-viewers-now"]');
    await takeScreenshot(page, testInfo, tile, 'dashboard-viewers-now', {
      alt: 'Viewers right now tile on the Dashboard',
      state: 'default',
    });
  });

  test('dashboard-active-jukebox', async ({ page }, testInfo) => {
    // Seed default is JUKEBOX — no mode flip required.
    const tile = page.locator('[data-testid="dashboard-active-tile"]');
    await takeScreenshot(page, testInfo, tile, 'dashboard-active-jukebox', {
      alt: 'Active tile on the Dashboard in jukebox mode',
      state: 'jukebox',
    });
  });

  // Mode-flip variant last. Try/finally guarantees the fixture is left in
  // JUKEBOX even if the screenshot call throws — otherwise the next docs
  // run starts from VOTING and shot 4 would be wrong.
  test('dashboard-active-voting', async ({ page }, testInfo) => {
    try {
      await flipShowMode('VOTING');
      // The dashboard reads viewerControlMode on mount via the show query;
      // reload to pick up the new mode. waitForDashboardData re-anchors
      // the load-ready signal.
      await page.reload();
      await waitForDashboardData(page);

      const tile = page.locator('[data-testid="dashboard-active-tile"]');
      await takeScreenshot(page, testInfo, tile, 'dashboard-active-voting', {
        alt: 'Active tile on the Dashboard in voting mode',
        state: 'voting',
      });
    } finally {
      await restoreShowMode();
    }
  });
});
