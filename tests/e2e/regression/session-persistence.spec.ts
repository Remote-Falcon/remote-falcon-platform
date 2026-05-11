import { test, expect } from '@playwright/test';
import { signUpAndSignIn } from './helpers';

// Regression: JWT-backed session survives a full-page reload. JWTContext
// stashes the token in localStorage at login and rehydrates on mount.

test.describe('session persistence', () => {
  test.describe.configure({ retries: 2 });

  test('reloading the dashboard keeps the user signed in', async ({ page }) => {
    await signUpAndSignIn(page);

    // Hard reload — should not bounce to /signin.
    await page.reload();

    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/Tonight's show|Now playing/i, {
      timeout: 15_000,
    });
  });
});
