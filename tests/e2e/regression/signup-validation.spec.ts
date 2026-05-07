import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { buildTestUser, signUp } from './helpers';

// Regression: client-side Yup validation on /signup, plus server-side
// duplicate-account rejection.
//
// Yup schema (apps/ui/src/views/pages/authentication/auth-forms/AuthRegister.jsx):
//   - showName: matches /^[A-Za-z0-9 ]+$/, required ("Show Name is required")
//              + "Letters and Numbers only" if non-alphanumeric
//   - email: valid email, required ("Email is required" / "Must be a valid email")
//   - password: required ("Password is required")
// Errors are rendered into id="signup-{field}-error" FormHelperText elements
// only AFTER the field is touched. Submitting an empty form touches every
// field, so all three error helpers should surface.
//
// JWTContext.register() shows snackbar "That email or show name already exists"
// when the API returns SHOW_EXISTS.

test.describe('signup form validation', () => {
  test.describe.configure({ retries: 2 });

  test('empty submit surfaces required-field errors', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('#signup-submit')).toBeVisible();
    await page.locator('#signup-submit').click();

    await expect(page.locator('#signup-show-name-error')).toHaveText(/Show Name is required/i);
    await expect(page.locator('#signup-email-error')).toHaveText(/Email is required/i);
    await expect(page.locator('#signup-password-error')).toHaveText(/Password is required/i);
    // Still on /signup — no navigation.
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('show name with special characters is rejected', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('#signup-show-name').fill('Bad@Name!');
    // Blur to trigger Yup. Tab away by focusing the next field.
    await page.locator('#signup-email').focus();
    await expect(page.locator('#signup-show-name-error')).toHaveText(
      /Letters and Numbers only/i,
    );
  });

  test('invalid email format is rejected', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('#signup-email').fill('not-an-email');
    await page.locator('#signup-password').focus();
    await expect(page.locator('#signup-email-error')).toHaveText(/Must be a valid email/i);
  });

  test('duplicate email shows backend error after second signup', async ({ page }) => {
    // Seed a user via the same flow, then try to register again with the
    // same email. The control-panel returns SHOW_EXISTS and JWTContext
    // surfaces the snackbar text below.
    const user = buildTestUser();
    await signUp(page, user);

    // Try again with the same email but a different show name.
    const dup = { ...user, showName: `Dup${faker.string.alphanumeric(8)}Show` };
    await page.goto('/signup');
    await page.locator('#signup-first-name').fill(dup.firstName);
    await page.locator('#signup-last-name').fill(dup.lastName);
    await page.locator('#signup-show-name').fill(dup.showName);
    await page.locator('#signup-email').fill(dup.email);
    await page.locator('#signup-password').fill(dup.password);
    await page.locator('#signup-submit').click();

    await expect(page.getByText(/That email or show name already exists/i)).toBeVisible({
      timeout: 15_000,
    });
    // We do NOT get redirected to /signin on duplicate.
    await expect(page).toHaveURL(/\/signup$/);
  });
});
