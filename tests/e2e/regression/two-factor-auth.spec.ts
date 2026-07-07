import { test, expect, type Page } from '@playwright/test';
import { signIn, signUpAndSignIn } from './helpers';
import { totpCode } from './totp';

// Regression: the full opt-in TOTP 2FA lifecycle (PRD 2FA-TOTP).
//
//   enroll (QR secret -> confirm code -> one-time recovery codes)
//     -> sign out -> sign in requires the code step -> TOTP verifies
//     -> sign in again via a recovery code (single-use)
//     -> disable with password re-auth -> sign in is single-step again
//
// Requires MFA_SECRET_KEY on the control-panel container — the dev compose
// (ops/docker-compose.dev.yml) sets a dev default, so dev-up and the CI e2e
// gate both have it.
//
// The TOTP codes come from regression/totp.ts, standing in for the user's
// authenticator app. Sign-in codes are generated 30s in the future: the
// server records each accepted code's time step (replay protection), and
// the next step's code is still inside its ±1-step acceptance window.

// Sign out by clearing the persisted session, mirroring what
// JWTContext.logout leaves behind. The UI logout path is already covered
// by logout.spec.ts; going through the menu here would just add flake
// surface to an already-long lifecycle spec.
const clearSession = async (page: Page) => {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/signin');
  await expect(page.locator('#outlined-adornment-email-login')).toBeVisible();
};

test.describe('two-factor authentication', () => {
  test.describe.configure({ retries: 2 });

  test('enroll, sign in with code, recover, and disable', async ({ page }) => {
    const user = await signUpAndSignIn(page);

    // --- Enroll ---
    await page.goto('/control-panel/account-settings/two-factor');
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /set up two-factor authentication/i }).click();
    await expect(page.getByText('Manual entry secret:')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('mfa-qr')).toBeVisible();

    const secret = (await page.locator('span.ph-no-capture').innerText()).trim();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    await page.getByLabel('6-Digit Code').fill(totpCode(secret));
    await page.getByRole('button', { name: /verify & enable/i }).click();

    // Recovery codes are shown exactly once — capture them for the
    // recovery sign-in below.
    await expect(page.getByText(/save these codes now/i)).toBeVisible({ timeout: 15_000 });
    const recoveryCodes = (await page.locator('div.ph-no-capture > div').allInnerTexts())
      .map((code) => code.trim())
      .filter((code) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code));
    expect(recoveryCodes).toHaveLength(10);
    await expect(page.getByText('Enabled', { exact: true })).toBeVisible();

    // --- Sign in now requires the code step ---
    await clearSession(page);
    await signIn(page, user.email, user.password);
    await expect(page.locator('#outlined-adornment-mfa-code')).toBeVisible({ timeout: 15_000 });
    // Password alone must NOT have produced a session.
    expect(page.url()).not.toContain('/control-panel');

    // +30s: the enrollment code's step is consumed (replay protection).
    await page.locator('#outlined-adornment-mfa-code').fill(totpCode(secret, Date.now() + 30_000));
    await page.getByRole('button', { name: /^verify$/i }).click();
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });

    // --- Sign in with a recovery code ---
    await clearSession(page);
    await signIn(page, user.email, user.password);
    await expect(page.locator('#outlined-adornment-mfa-code')).toBeVisible({ timeout: 15_000 });
    await page.getByText(/use a recovery code instead/i).click();
    await page.locator('#outlined-adornment-mfa-code').fill(recoveryCodes[0]);
    await page.getByRole('button', { name: /^verify$/i }).click();
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });

    // --- Disable (password re-auth) ---
    await page.goto('/control-panel/account-settings/two-factor');
    await expect(page.getByText('Enabled', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^disable$/i }).click();
    // MUI Modal (not Dialog) — no dialog role, and the page behind it has
    // its own "Disable" button, so scope everything to the modal root.
    const modal = page.locator('.MuiModal-root');
    await expect(modal.getByText('Disable Two-Factor Authentication')).toBeVisible();
    await modal.getByLabel('Current Password').fill(user.password);
    await modal.getByRole('button', { name: /^disable$/i }).click();
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible({ timeout: 15_000 });

    // --- Sign in is single-step again ---
    await clearSession(page);
    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
  });
});
