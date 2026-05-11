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

    // v2 ProfileSection is now an IconButton with aria-label="Open account
    // menu". Click it, then "Sign out" in the popped Menu.
    //
    // force: true skips Playwright's "stable" actionability gate. The
    // IconButton wraps an Avatar that loads its gravatar from a remote CDN,
    // which can shift the bounding box and trip the gate at 30s.
    const trigger = page.locator('button[aria-label="Open account menu"]');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click({ force: true });
    await expect(page.getByText('Sign out', { exact: true })).toBeVisible();
    await page.getByText('Sign out', { exact: true }).click();

    // After logout the AuthGuard kicks any further /control-panel access back
    // to "/". Land page is either "/" or "/signin" depending on routing.
    await expect(page).toHaveURL(/\/(signin)?$/, { timeout: 15_000 });

    // Confirm we're really logged out: visiting a protected route does NOT
    // render the dashboard widgets.
    await page.goto('/control-panel/dashboard');
    await expect(page).toHaveURL(/\/(signin)?$/, { timeout: 10_000 });
  });
});
