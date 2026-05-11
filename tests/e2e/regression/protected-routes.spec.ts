import { test, expect } from '@playwright/test';
import { signUpAndSignIn } from './helpers';

// Regression: signed-in user can navigate to each top-level control-panel
// sub-route without being kicked out. We don't assert on exact widget text
// per page (those views are highly dynamic and depend on backend data the
// fresh signup doesn't have); instead we assert:
//   1. The URL stays on the requested route (no AuthGuard bounce).
//   2. The MainLayout chrome is still mounted (the profile chip).
//
// Routes come from apps/ui/src/routes/MainRoutes.jsx. /control-panel/admin
// is excluded — it's gated to admin-role accounts, and a fresh USER account
// will be redirected away.

const subRoutes = [
  '/control-panel/dashboard',
  '/control-panel/sequences',
  '/control-panel/viewer-page',
  '/control-panel/remote-falcon-settings',
  '/control-panel/account-settings',
  '/control-panel/image-hosting',
];

test.describe('protected control-panel routes (authenticated)', () => {
  test.describe.configure({ retries: 2 });

  test('each known sub-route loads for a signed-in user', async ({ page }) => {
    await signUpAndSignIn(page);

    for (const route of subRoutes) {
      // domcontentloaded (not the default "load") — image-hosting and a few
      // other routes pull heavy subresources that don't reliably finish in
      // firefox/webkit within the 30s test timeout.
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(route.replace(/\//g, '\\/')), {
        timeout: 15_000,
      });
      // Profile menu trigger (v2 IconButton) is rendered by MainLayout and
      // is the simplest "we are still in the authenticated layout" signal.
      await expect(page.locator('button[aria-label="Open account menu"]')).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});
