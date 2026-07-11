import { expect, test } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';
import { msLeftInPeriod, totpCode } from './utils/totp';

// Shots 16-18: the Two-Factor Auth tab (added with the 2FA release).
//
// One test drives the whole enrollment lifecycle so the three shots come
// from a single coherent flow:
//   16. two-factor-auth           — tab in its pre-setup state
//   17. two-factor-setup          — QR code + manual secret + code field
//   18. two-factor-recovery-codes — post-enable recovery codes section
//
// The spec then DISABLES 2FA again via the re-auth modal. That cleanup is
// load-bearing: the fixture user is shared across the light and dark
// projects (and with every other spec's signIn), so leaving MFA enabled
// would break the dark-theme pass and any subsequent run.
test.describe('docs-screenshots: two-factor auth', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
    await signIn(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
  });

  test('two-factor lifecycle', async ({ page }, testInfo) => {
    await page.goto('/control-panel/account-settings/two-factor');
    await page.locator('[data-testid="two-factor-root"]').waitFor({ state: 'visible' });

    // Shot 16 — pre-setup state with the Disabled chip and setup button.
    const setupButton = page.getByRole('button', { name: 'Set Up Two-Factor Authentication' });
    await expect(setupButton).toBeVisible();
    await takeScreenshot(page, testInfo, 'fullPage', 'two-factor-auth', {
      alt: 'Two-Factor Auth tab before setup, showing the Disabled status and setup button',
      state: 'default',
    });

    // Shot 17 — enrollment step with QR code and manual entry secret.
    await setupButton.click();
    await page
      .locator('[data-testid="mfa-qr"] svg, [data-testid="mfa-qr"] canvas')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
    await takeScreenshot(page, testInfo, 'fullPage', 'two-factor-setup', {
      alt: 'Two-factor setup step with the QR code, manual entry secret, and 6-digit code field',
      state: 'enrollment',
    });

    // Complete enrollment with a computed TOTP code. The manual-entry secret
    // is the only ph-no-capture span on the page at this point. Waiting out
    // short period tails keeps the code valid through the server round-trip.
    const secret = (await page.locator('span.ph-no-capture').innerText()).trim();
    if (msLeftInPeriod() < 5_000) {
      await page.waitForTimeout(msLeftInPeriod() + 250);
    }
    await page.getByLabel('6-Digit Code').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Verify & Enable' }).click();

    // Shot 18 — recovery codes, shown exactly once after enabling. Let the
    // success toast clear first so it doesn't photobomb the capture.
    await page.getByText('Recovery Codes', { exact: true }).waitFor({ timeout: 20_000 });
    await page
      .getByText('Two-Factor Authentication Enabled')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {
        // Toast already gone (or never shown) — fine either way.
      });
    await takeScreenshot(page, testInfo, 'fullPage', 'two-factor-recovery-codes', {
      alt: 'Recovery codes shown once after enabling two-factor authentication',
      state: 'enabled',
    });

    // Cleanup — disable 2FA through the re-auth modal (password path) and
    // assert the chip flips back so a half-done cleanup fails loudly here
    // instead of poisoning the next project run.
    await page.getByRole('button', { name: 'Disable', exact: true }).click();
    const disableModal = page.locator('[aria-labelledby="disable-mfa-modal-title"]');
    await disableModal.waitFor({ state: 'visible' });
    await disableModal.getByLabel('Current Password').fill(FIXTURE_PASSWORD);
    await disableModal.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(page.locator('[data-testid="two-factor-root"]').getByText('Disabled', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });
});
