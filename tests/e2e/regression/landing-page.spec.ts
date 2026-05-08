import { test, expect } from '@playwright/test';

// Regression: landing page renders and its primary CTAs route to /signup
// and /signin. Selectors:
//   - #appbar-signup / #appbar-signin in apps/ui/src/ui-component/extended/AppBar.jsx
//   - the hero CTA is a <Button component={RouterLink} to="/signup">Create your show — free</Button>
//     in apps/ui/src/views/pages/landing/Header.jsx (no id; matched by accessible name).

test.describe('landing page', () => {
  test.describe.configure({ retries: 2 });

  test('landing renders with title and AppBar CTAs', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Remote Falcon/i);
    await expect(page.locator('#appbar-signin')).toBeVisible();
    await expect(page.locator('#appbar-signup')).toBeVisible();
  });

  test('hero CTA navigates to /signup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /create your show/i }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.locator('#signup-submit')).toBeVisible();
  });

  test('AppBar Sign In CTA navigates to /signin', async ({ page }) => {
    await page.goto('/');
    await page.locator('#appbar-signin').first().click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.locator('#outlined-adornment-email-login')).toBeVisible();
  });

  test('AppBar Sign Up CTA navigates to /signup', async ({ page }) => {
    await page.goto('/');
    await page.locator('#appbar-signup').first().click();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
