import { expect, test } from '@playwright/test';

import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Shots for the public Show Map at /map (Public Show Map release).
//
//   public-map          — /map, full-page. The unauthenticated map anyone
//                          can browse: clustered pins for every show that
//                          opted into showOnMapPublic, the community-size
//                          header, and the search box. No auth.
//   public-map-details  — same page after selecting a show from the search
//                          box, which opens the details card (Visit Show
//                          Page / Get Directions).
//
// The route is public, so there's no signIn — just setupTheme + goto. The
// pins come from the docs seed: the demo show (showOnMapPublic=true) plus
// the scattered public-map-pins.json fixtures, so the map renders real pins,
// a low-zoom cluster, and plural community-size counts instead of one lonely
// dot. Anchored on `public-map-root`; the map itself is `shows-maplibre`.

test.describe('docs-screenshots: public map', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
  });

  test('public-map', async ({ page }, testInfo) => {
    await page.goto('/map');
    await page
      .locator('[data-testid="public-map-root"]')
      .waitFor({ state: 'visible' });
    // Wait for the MapLibre container (not the list fallback) so we assert
    // the map path rendered, then let the basemap tiles and fitBounds settle.
    await page
      .locator('[data-testid="shows-maplibre"]')
      .waitFor({ state: 'visible' });
    await takeScreenshot(page, testInfo, 'fullPage', 'public-map', {
      alt: 'Public Show Map with clustered pins, search, and the community-size header',
      state: 'default',
      waitBeforeMs: 3000,
    });

    // Open the details card deterministically via the search box (clicking a
    // canvas pin is unreliable headless). Selecting an option flies to the
    // show and opens the card. Target the combobox role specifically — once
    // the dropdown opens, the listbox shares the "Search shows" accessible
    // name, so getByLabel would match two elements.
    const search = page.getByRole('combobox', { name: 'Search shows' });
    await search.click();
    await search.fill('Harbor');
    await page
      .getByRole('option', { name: 'Harbor Lights Spectacular' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await takeScreenshot(page, testInfo, 'fullPage', 'public-map-details', {
      alt: 'Public Show Map details card with Visit Show Page and Get Directions actions',
      state: 'details-open',
      waitBeforeMs: 2500,
    });
  });
});
