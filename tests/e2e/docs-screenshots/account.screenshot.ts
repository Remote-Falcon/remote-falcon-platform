import { expect, test } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Shot 2: account-profile
// Authenticated, full-page capture on /control-panel/account-settings/profile.
// The fixture user (seeded in global-setup per the seed-and-setup slice)
// has a realistic first/last name + show name + subdomain so the rendered
// page is representative without further per-spec seeding.
test.describe('docs-screenshots: account settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
    await signIn(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    // signIn fills + clicks but doesn't await the post-submit redirect; without
    // this wait the next goto() races the JWT context update and the auth
    // guard bounces us back to the landing page.
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
  });

  test('account-profile', async ({ page }, testInfo) => {
    await page.goto('/control-panel/account-settings/profile');
    await page
      .locator('[data-testid="account-profile-root"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'account-profile', {
      alt: 'Account profile page with the fixture user details populated',
      state: 'default',
    });
  });
});
