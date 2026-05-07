import { test, expect } from '@playwright/test';

// Regression: landing page renders and its primary CTAs route to /signup
// and /signin. Selectors come from apps/ui/src/views/pages/landing/KeyFeature.jsx
// (#keyfeature-signup, #keyfeature-signin) and apps/ui/src/ui-component/extended/AppBar.jsx
// (#appbar-signup, #appbar-signin).

test.describe('landing page', () => {
  test.describe.configure({ retries: 2 });

  test('landing renders with title and key feature CTAs', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Remote Falcon/i);
    await expect(page.locator('#keyfeature-signup')).toBeVisible();
    await expect(page.locator('#keyfeature-signin')).toBeVisible();
  });

  test('keyfeature Sign Up CTA navigates to /signup', async ({ page }) => {
    await page.goto('/');
    await page.locator('#keyfeature-signup').click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.locator('#signup-submit')).toBeVisible();
  });

  test('keyfeature Sign In CTA navigates to /signin', async ({ page }) => {
    await page.goto('/');
    await page.locator('#keyfeature-signin').click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.locator('#outlined-adornment-email-login')).toBeVisible();
  });

  test('app bar Sign Up CTA navigates to /signup', async ({ page }) => {
    await page.goto('/');
    await page.locator('#appbar-signup').first().click();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
