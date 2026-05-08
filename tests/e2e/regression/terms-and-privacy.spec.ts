import { test, expect } from '@playwright/test';

// Regression: legal pages render at their public URLs. Routes come from
// LoginRoutes.jsx (/terms-and-conditions, /privacy-policy, /owners).
//
// TermsAndConditions.jsx and PrivacyPolicy.jsx render a body-level
// <title> tag (which is hidden) plus a <strong> heading and prose. We
// target the <strong> directly so we never resolve to the hidden title
// or to body text containing "Terms and Conditions" further down the page.

test.describe('legal & ownership pages', () => {
  test.describe.configure({ retries: 2 });

  test('/terms-and-conditions renders', async ({ page }) => {
    await page.goto('/terms-and-conditions');
    await expect(page.locator('strong', { hasText: 'Terms & Conditions' }).first()).toBeVisible();
  });

  test('/privacy-policy renders', async ({ page }) => {
    await page.goto('/privacy-policy');
    await expect(page.locator('strong', { hasText: 'Privacy Policy' }).first()).toBeVisible();
  });

  test('/owners renders', async ({ page }) => {
    const response = await page.goto('/owners');
    expect(response?.status()).toBeLessThan(500);
    // Page is rendered by Ownership.jsx — assert the document body is non-empty.
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
