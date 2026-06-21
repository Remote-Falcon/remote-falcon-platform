import { expect, test } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Shot 15: the QR Code generator page (#93).
//
//   15. qr-code — /control-panel/qr-code, full-page. The page is fully
//       client-side: it renders the show's public URL into a styled code
//       via qr-code-styling. We wait for the rendered <canvas> inside
//       `qr-code-root` (not just the root) so the capture never catches
//       the "Your show URL isn't available yet" empty state before the
//       show hydrates. Default seed style — black-on-white, no preset —
//       so the doc shot shows the neutral starting point.
//
// Full-page capture using the `qr-code-root` testid per SELECTORS.md row 15.
// Requires auth.

test.describe('docs-screenshots: qr code', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
    await signIn(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    // signIn doesn't await the post-submit redirect; without this wait the
    // next goto() races the JWT context update and the auth guard bounces
    // us back to the landing page.
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
  });

  test('qr-code', async ({ page }, testInfo) => {
    await page.goto('/control-panel/qr-code');
    await page
      .locator('[data-testid="qr-code-root"]')
      .waitFor({ state: 'visible' });
    // The live preview is a <canvas> minted by qr-code-styling once the
    // show's public URL resolves. Waiting for it guarantees we capture a
    // rendered code rather than the pre-hydration empty state.
    await page
      .locator('[data-testid="qr-code-root"] canvas')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
    await takeScreenshot(page, testInfo, 'fullPage', 'qr-code', {
      alt: 'QR Code generator page with a live preview and style controls',
      state: 'default',
    });
  });
});
