import { test, expect } from '@playwright/test';

// Regression: /resetPassword/:passwordResetLink with a garbage token.
// AuthResetPassword runs VERIFY_PASSWORD_RESET_LINK on mount; on UNAUTHORIZED
// it shows the snackbar "Invalid Password Reset Link" and after a 3s delay
// navigates to /signin.

test.describe('reset password invalid token', () => {
  test.describe.configure({ retries: 2 });

  test('garbage token shows error and bounces back to /signin', async ({ page }) => {
    await page.goto('/resetPassword/this-is-not-a-real-token');

    // The reset form mounts, but the submit button is disabled (linkValid=false).
    await expect(page.getByText(/Enter your new password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /reset password/i })).toBeDisabled();

    // Snackbar with the explicit error text appears, then we get redirected.
    await expect(page.getByText(/Invalid Password Reset Link|Something went wrong/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });
});
