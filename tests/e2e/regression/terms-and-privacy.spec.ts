import { test, expect } from '@playwright/test';

// Regression: legal pages render at their public URLs. Routes come from
// LoginRoutes.jsx (/terms-and-conditions, /privacy-policy, /owners).
//
// NB: TermsAndConditions.jsx and PrivacyPolicy.jsx don't use a real <h1>;
// they use a <strong> tag for the title. We assert that visible heading
// text rather than a role=heading lookup.

test.describe('legal & ownership pages', () => {
  test.describe.configure({ retries: 2 });

  test('/terms-and-conditions renders', async ({ page }) => {
    await page.goto('/terms-and-conditions');
    await expect(page.getByText('Terms & Conditions').first()).toBeVisible();
  });

  test('/privacy-policy renders', async ({ page }) => {
    await page.goto('/privacy-policy');
    await expect(page.getByText('Privacy Policy').first()).toBeVisible();
  });

  test('/owners renders', async ({ page }) => {
    const response = await page.goto('/owners');
    expect(response?.status()).toBeLessThan(500);
    // Page is rendered by Ownership.jsx — assert the document body is non-empty.
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
