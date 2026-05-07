import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { buildTestUser, signUp } from './helpers';

// Regression: /forgot password flow.
//
// The Login.jsx route is /forgot (not /forgot-password). JWTContext.sendResetPassword
// shows snackbars:
//   success         -> "Forgot password email sent to {email}"
//   UNAUTHORIZED    -> generic error (showAlertOld({ alert: 'error' }))
//   EMAIL_CANNOT_BE_SENT -> "Unable to send password reset email"
//
// Note: the UI does NOT use a generic "if an account exists..." pattern —
// it leaks via separate error vs. success snackbars. We assert the actual
// observable behaviour rather than a hardened-against-enumeration response.

test.describe('forgot password', () => {
  test.describe.configure({ retries: 2 });

  test('/forgot route renders the email form', async ({ page }) => {
    await page.goto('/forgot');
    await expect(page.getByText(/Forgot your password\?/i)).toBeVisible();
    await expect(page.locator('#outlined-adornment-email-forgot')).toBeVisible();
  });

  test('client-side validation: empty email blocks submit', async ({ page }) => {
    await page.goto('/forgot');
    await page.getByRole('button', { name: /send mail/i }).click();
    await expect(page.locator('#standard-weight-helper-text-email-forgot')).toHaveText(
      /Email is required/i,
    );
  });

  test('client-side validation: invalid email format', async ({ page }) => {
    await page.goto('/forgot');
    await page.locator('#outlined-adornment-email-forgot').fill('nope');
    await page.getByRole('button', { name: /send mail/i }).click();
    await expect(page.locator('#standard-weight-helper-text-email-forgot')).toHaveText(
      /Must be a valid email/i,
    );
  });

  test('known email triggers success snackbar', async ({ page }) => {
    const user = buildTestUser();
    await signUp(page, user);

    await page.goto('/forgot');
    await page.locator('#outlined-adornment-email-forgot').fill(user.email);
    await page.getByRole('button', { name: /send mail/i }).click();

    await expect(
      page.getByText(new RegExp(`Forgot password email sent to ${user.email}`, 'i')),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('unknown email surfaces an error snackbar (no silent success)', async ({ page }) => {
    await page.goto('/forgot');
    await page
      .locator('#outlined-adornment-email-forgot')
      .fill(`ghost-${faker.string.alphanumeric(10)}@example.com`);
    await page.getByRole('button', { name: /send mail/i }).click();

    // Either the explicit "unable to send" error or the generic alert; both
    // are valid distinguishable-from-success outcomes.
    await expect(
      page.getByText(/Unable to send password reset email|Something went wrong/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
