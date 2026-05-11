import { expect, type Page } from '@playwright/test';
import { faker } from '@faker-js/faker';

export interface TestUser {
  email: string;
  password: string;
  showName: string;
  firstName: string;
  lastName: string;
}

export const buildTestUser = (): TestUser => ({
  email: faker.internet.email().toLowerCase(),
  password: `Aa1!${faker.string.alphanumeric(12)}`,
  // showName Yup validator only allows letters/numbers/spaces.
  showName: `Reg${faker.string.alphanumeric({ length: 8, casing: 'mixed' })}Show`,
  firstName: faker.person.firstName().replace(/[^A-Za-z]/g, '') || 'Test',
  lastName: faker.person.lastName().replace(/[^A-Za-z]/g, '') || 'User',
});

/**
 * Sign up a fresh user via the /signup form. The control-panel container in
 * dev-up runs with AUTO_VALIDATE_EMAIL=true so the resulting account is
 * usable for login immediately. JWTContext.register() shows a snackbar then
 * waits ~3s before navigating to /signin.
 */
export const signUp = async (page: Page, user: TestUser) => {
  await page.goto('/signup');
  await expect(page.locator('#signup-submit')).toBeVisible();
  await page.locator('#signup-first-name').fill(user.firstName);
  await page.locator('#signup-last-name').fill(user.lastName);
  await page.locator('#signup-show-name').fill(user.showName);
  await page.locator('#signup-email').fill(user.email);
  await page.locator('#signup-password').fill(user.password);
  await page.locator('#signup-submit').click();
  await expect(page).toHaveURL(/\/signin/, { timeout: 15_000 });
};

/**
 * Fill the /signin form and click Sign In. Caller decides what to assert
 * after — successful logins land on /control-panel/*; failures stay on
 * /signin and surface a snackbar.
 */
export const signIn = async (page: Page, email: string, password: string) => {
  await page.goto('/signin');
  await page.locator('#outlined-adornment-email-login').fill(email);
  await page.locator('#outlined-adornment-password-login').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
};

/**
 * End-to-end "create user + log them in" used by specs that need an
 * authenticated session. Returns the user so the spec can assert against
 * the show name, email, etc.
 */
export const signUpAndSignIn = async (page: Page): Promise<TestUser> => {
  const user = buildTestUser();
  await signUp(page, user);
  await signIn(page, user.email, user.password);
  await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
  await expect(page.locator('body')).toContainText(/Tonight's show|Now playing/i, {
    timeout: 15_000,
  });
  return user;
};
