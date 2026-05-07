import { test, expect } from '@playwright/test';
import { signUpAndSignIn } from './helpers';

// Regression: signed-in user can log out via the ProfileSection avatar menu
// in the MainLayout header. Logout calls JWTContext.logout() which clears the
// token and AuthGuard then redirects unauthenticated users.
//
// AuthGuard.jsx redirects to "/" (NOT /signin), so we assert URL is "/" or
// "/signin" — whichever the implementation routes through is acceptable.

test.describe('logout', () => {
  test.describe.configure({ retries: 2 });

  test('clicking Logout in the profile menu signs the user out', async ({ page }) => {
    await signUpAndSignIn(page);

    // The profile chip in the header is the only element with
    // aria-haspopup="true" + aria-controls toggling on this layout.
    // Clicking it opens the Popper menu containing the Logout item.
    await page.locator('[aria-haspopup="true"]').first().click();
    await expect(page.getByText('Logout', { exact: true })).toBeVisible();
    await page.getByText('Logout', { exact: true }).click();

    // After logout the AuthGuard kicks any further /control-panel access back
    // to "/". Land page is either "/" or "/signin" depending on routing.
    await expect(page).toHaveURL(/\/(signin)?$/, { timeout: 15_000 });

    // Confirm we're really logged out: visiting a protected route does NOT
    // render the dashboard widgets.
    await page.goto('/control-panel/dashboard');
    await expect(page).toHaveURL(/\/(signin)?$/, { timeout: 10_000 });
  });
});
