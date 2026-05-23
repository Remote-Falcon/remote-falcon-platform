import { test } from '@playwright/test';

import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Shot 1: signup-form
// Public route — no auth, no seed dependency. Captures the signup form
// card on /signup as an element shot (per PRD Appendix A.1).
test.describe('docs-screenshots: signup', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
  });

  test('signup-form', async ({ page }, testInfo) => {
    await page.goto('/signup');
    const form = page.locator('[data-testid="signup-form"]');
    await form.waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, form, 'signup-form', {
      alt: 'Sign up form on the public /signup page',
      state: 'default',
    });
  });
});
