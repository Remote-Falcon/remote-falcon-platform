import { expect, test, type Page } from '@playwright/test';

import { signIn } from '../regression/helpers';
import { FIXTURE_EMAIL, FIXTURE_PASSWORD } from './utils/fixtures';
import { setupTheme, takeScreenshot } from './utils/screenshot-helper';

// Sequence metadata lookup (PRD-remote-falcon-003): the per-row popover and
// the bulk review dialog. Both shots stub the iTunes Search API at the
// network layer so results (and album art) are deterministic — a live call
// would make the PNGs churn with Apple's ranking. The fixture show seeds
// 7 metadata-missing rows: 4 songs with artists but no art (the stub
// matches them) and 3 PSAs (no match, exercising the dimmed-row state).

// 8x8 solid-color PNGs served as stubbed album art. artworkUrl100 in the
// stubbed results points at itunes.apple.com/stub-art/<color>/…, so one
// route glob covers both the JSON API and the images (including the
// 600x600bb rewrite the UI applies for HD art).
const STUB_ART: Record<string, string> = {
  red: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPYpGSCFTEMLQkA6b9CAQvEvXoAAAAASUVORK5CYII=',
  green: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOQjlPAihiGlgQA8VomQRG88skAAAAASUVORK5CYII=',
  blue: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMQTT2AFTEMLQkAgcpOgcdALtkAAAAASUVORK5CYII=',
  gold: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM42sWBFTEMLQkAsPdVwWii6YUAAAAASUVORK5CYII=',
};

const art = (color: string) => `https://itunes.apple.com/stub-art/${color}/100x100bb.jpg`;

const itunesResult = (title: string, artist: string, album: string, color: string) => ({
  trackName: title,
  artistName: artist,
  collectionName: album,
  artworkUrl100: art(color),
});

// Term → results. Bulk queries append the row's known artist (art-only
// disambiguation), so matchers use substrings of the cleaned title.
const STUB_RESULTS: Array<{ match: string; results: unknown[] }> = [
  {
    match: 'wizards in winter',
    results: [
      itunesResult('Wizards in Winter', 'Trans-Siberian Orchestra', 'The Lost Christmas Eve', 'red'),
      itunesResult('Wizards in Winter (Instrumental)', 'Trans-Siberian Orchestra', 'The Essential', 'blue'),
      itunesResult('Wizards In Winter (Live)', 'Trans-Siberian Orchestra', 'Live in Concert', 'green'),
    ],
  },
  { match: 'carol of the bells', results: [itunesResult('Carol of the Bells', 'Lindsey Stirling', 'Warmer in the Winter', 'blue')] },
  { match: 'linus and lucy', results: [itunesResult('Linus and Lucy', 'Vince Guaraldi Trio', 'A Charlie Brown Christmas', 'green')] },
  { match: 'feliz navidad', results: [itunesResult('Feliz Navidad', 'José Feliciano', 'Feliz Navidad', 'gold')] },
];

const stubITunes = async (page: Page) => {
  await page.route('**/itunes.apple.com/**', async (route) => {
    const url = route.request().url();
    const artMatch = url.match(/stub-art\/(\w+)\//);
    if (artMatch) {
      await route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(STUB_ART[artMatch[1]] ?? STUB_ART.red, 'base64'),
      });
      return;
    }
    const term = decodeURIComponent(new URL(url).searchParams.get('term') || '').toLowerCase();
    const hit = STUB_RESULTS.find((s) => term.includes(s.match));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ resultCount: hit?.results.length ?? 0, results: hit?.results ?? [] }),
    });
  });
};

test.describe('docs-screenshots: metadata lookup', () => {
  test.beforeEach(async ({ page }) => {
    await setupTheme(page);
    await stubITunes(page);
    await signIn(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });
    await page.goto('/control-panel/sequences/list');
    await page.locator('[data-testid="sequences-list-root"]').waitFor({ state: 'visible' });
  });

  test('sequence-metadata-lookup-popover', async ({ page }, testInfo) => {
    // First row with the lookup icon is wizards-in-winter (fixture order);
    // its auto-search hits the 3-result stub so the list looks real.
    await page.locator('[data-testid="sequence-metadata-lookup-button"]').first().click();
    const popover = page.locator('[data-testid="sequence-metadata-lookup-popover"]');
    await popover.waitFor({ state: 'visible' });
    await popover.getByText('The Lost Christmas Eve').waitFor({ state: 'visible', timeout: 15_000 });
    await takeScreenshot(page, testInfo, popover, 'sequence-metadata-lookup-popover', {
      alt: 'Metadata lookup popover showing iTunes results with album art for a sequence',
      state: 'default',
    });
  });

  test('bulk-metadata-lookup-dialog', async ({ page }, testInfo) => {
    // The rate-limited pass over the 7 fixture targets takes ~21s by
    // contract (one lookup per 3.5s); budget generously past it.
    test.setTimeout(180_000);
    await page.getByRole('button', { name: 'More sequence actions' }).click();
    await page.getByRole('menuitem', { name: /Look up missing metadata/ }).click();
    // Confirm interstitial (shared ConfirmDialog) → start the pass.
    await page.getByRole('button', { name: 'Start lookup' }).click();
    const dialog = page.locator('[data-testid="bulk-metadata-lookup-dialog"]');
    await dialog.waitFor({ state: 'visible' });
    // Review phase renders once the pass completes; the matched counter in
    // the summary line is the reliable arrival signal.
    await dialog.getByText(/Found matches for 4 of 7/).waitFor({ state: 'visible', timeout: 120_000 });
    await takeScreenshot(page, testInfo, dialog, 'bulk-metadata-lookup-dialog', {
      alt: 'Bulk metadata lookup review table with matched songs checked and no-match PSA rows dimmed',
      state: 'default',
    });
  });
});
