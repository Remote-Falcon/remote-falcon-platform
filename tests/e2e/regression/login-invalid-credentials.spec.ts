import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { buildTestUser, signUp } from './helpers';

// Regression: bad credentials at /signin. JWTContext.login() maps the
// API error codes to snackbar text:
//   UNAUTHORIZED        -> "Invalid Credentials"
//   SHOW_NOT_FOUND      -> "Show could not be found!"
// Either is acceptable for "nonexistent email" since the backend's exact
// error code is implementation-defined; we assert at least one of them.

test.describe('login invalid credentials', () => {
  test.describe.configure({ retries: 2 });

  test('wrong password for an existing account shows Invalid Credentials', async ({ page }) => {
    const user = buildTestUser();
    await signUp(page, user);

    await page.goto('/signin');
    await page.locator('#outlined-adornment-email-login').fill(user.email);
    await page.locator('#outlined-adornment-password-login').fill('Wrong123!Password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/Invalid Credentials/i)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/signin/);
  });

  test('nonexistent email surfaces an error snackbar', async ({ page }) => {
    await page.goto('/signin');
    await page
      .locator('#outlined-adornment-email-login')
      .fill(`ghost-${faker.string.alphanumeric(10)}@example.com`);
    await page.locator('#outlined-adornment-password-login').fill('Whatever123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(
      page.getByText(/Invalid Credentials|Show could not be found|Something went wrong/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/signin/);
  });
});
