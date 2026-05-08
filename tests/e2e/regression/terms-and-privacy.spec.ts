import { test, expect } from '@playwright/test';

// Regression: legal pages render at their public URLs. Routes come from
// LoginRoutes.jsx (/terms-and-conditions, /privacy-policy, /owners).
// Both pages render an <h1> via MiscPageShell — assert the heading rather
// than getByText().first(), which can resolve to the document <title> in
// the head (hidden) before the visible heading.

test.describe('legal & ownership pages', () => {
  test.describe.configure({ retries: 2 });

  test('/terms-and-conditions renders', async ({ page }) => {
    await page.goto('/terms-and-conditions');
    await expect(page.getByRole('heading', { name: 'Terms & Conditions' })).toBeVisible();
  });

  test('/privacy-policy renders', async ({ page }) => {
    await page.goto('/privacy-policy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  });

  test('/owners renders', async ({ page }) => {
    const response = await page.goto('/owners');
    expect(response?.status()).toBeLessThan(500);
    // Page is rendered by Ownership.jsx — assert the document body is non-empty.
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
