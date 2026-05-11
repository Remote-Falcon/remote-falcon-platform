import { test, expect } from '@playwright/test';

// Regression: AuthGuard redirects unauthenticated users away from
// /control-panel/* routes. AuthGuard.jsx (apps/ui/src/utils/route-guard/AuthGuard.jsx)
// calls navigate('/', { replace: true }) when isLoggedIn is false — so the
// landing page is the actual destination, not /signin.

const protectedRoutes = [
  '/control-panel',
  '/control-panel/dashboard',
  '/control-panel/sequences',
  '/control-panel/account-settings',
  '/control-panel/viewer-page',
  '/control-panel/remote-falcon-settings',
];

test.describe('unauthenticated route protection', () => {
  test.describe.configure({ retries: 2 });

  for (const route of protectedRoutes) {
    test(`anonymous visit to ${route} is redirected to landing`, async ({ page, context }) => {
      // Make sure no token leaks in from a previous test in the same worker.
      await context.clearCookies();
      await page.goto('/');
      await page.evaluate(() => window.localStorage.clear());

      await page.goto(route);

      // AuthGuard pushes us to "/", so the landing page renders. We tolerate
      // either "/" or "/signin" in case the redirect target changes; what we
      // really care about is that the dashboard widgets are NOT visible.
      await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/(signin)?$/, {
        timeout: 10_000,
      });
      await expect(page.locator('body')).not.toContainText(/Tonight's show/i);
    });
  }
});
