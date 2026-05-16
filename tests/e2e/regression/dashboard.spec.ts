import { test, expect } from '@playwright/test';

import { signUpAndSignIn } from './helpers';
import { buildRequest, buildSequence, seedShowByEmail } from './seed';

// Regression: the modernized Dashboard (`/control-panel/dashboard`).
//
// Dashboard is the owner's primary screen *during* a show. The v2 rebuild
// landed on this branch — we want a guardrail that catches regressions
// in:
//   • PageHead (eyebrow with show name + control mode, title, description
//     reflecting viewerControlEnabled, "View public page" action button)
//   • LiveStatsRow tiles (Viewers right now / Songs queued / Requests
//     today / Active sequences) — at least the show-document-derived ones
//   • NowPlayingCard (rendering the seeded playingNow text + queue rows
//     from `requests[]`)
//   • Section headers ("Right now", "Now playing", "Pre-show readiness")
//
// Pattern: sign up a fresh user → seed rich data onto their show via the
// mongo helper → reload → assert. This is preferred over a pre-seeded
// shared fixture because tests stay isolated and the user matches the
// fresh-signup baseline that existing specs already exercise.
test.describe('dashboard (live operational view)', () => {
  test('renders PageHead, stat tiles, section headers, and now-playing queue', async ({ page }) => {
    const user = await signUpAndSignIn(page);

    // Seed: 3 active sequences (one inactive — should be excluded from
    // "Active sequences" count), 2 queued requests, an explicit playingNow.
    const sequences = [
      buildSequence({ name: 'Sequence A', displayName: 'Sequence A', index: 0, order: 0, active: true }),
      buildSequence({ name: 'Sequence B', displayName: 'Sequence B', index: 1, order: 1, active: true }),
      buildSequence({ name: 'Sequence C', displayName: 'Sequence C', index: 2, order: 2, active: true }),
      buildSequence({ name: 'Inactive Seq', displayName: 'Inactive Seq', index: 3, order: 3, active: false }),
    ];
    const requests = [
      buildRequest({ sequence: { name: 'Sequence A', displayName: 'Sequence A', imageUrl: '', artist: 'A', index: 0 }, position: 1 }),
      buildRequest({ sequence: { name: 'Sequence B', displayName: 'Sequence B', imageUrl: '', artist: 'B', index: 1 }, position: 2 }),
    ];
    await seedShowByEmail(user.email, {
      sequences,
      requests,
      playingNow: 'Sequence A',
      playingNext: 'Sequence B',
      'preferences.viewerControlMode': 'JUKEBOX',
      'preferences.viewerControlEnabled': true,
    });

    // Reload so the Apollo cache + redux show store re-hydrate from mongo.
    // Single navigation with networkidle wait — avoids the goto+reload race
    // where Playwright aborts an in-flight `getShow` GraphQL request,
    // Apollo's onError handler calls logout(), and the reload lands on the
    // marketing landing page. Same flake fixed in sequences-editor.spec.
    await page.goto('/control-panel/dashboard', { waitUntil: 'networkidle' });

    // PageHead: title is always "Tonight's show"; eyebrow includes the
    // show name and the control mode.
    await expect(page.locator('body')).toContainText("Tonight's show");
    await expect(page.locator('body')).toContainText(new RegExp(`Show.*${user.showName}.*Jukebox Mode`, 'i'));

    // Live state is enabled in the seed, so description reads "Live · ..."
    await expect(page.locator('body')).toContainText(/Live ·/);

    // Public-page action button.
    await expect(page.getByRole('button', { name: /view public page/i })).toBeVisible();

    // Section headers — these are SectionHeader components.
    for (const label of ['Right now', 'Now playing', 'Pre-show readiness']) {
      await expect(page.locator('body')).toContainText(label);
    }

    // LiveStatsRow tiles. "Active sequences" is purely show-document-
    // derived (3 active out of 4) so it's deterministic regardless of
    // the live-stats endpoint's behavior. "Songs queued" derives from
    // show.requests.length (jukebox mode) — also deterministic.
    const activeSequencesTile = page.locator('text=Active sequences').locator('xpath=ancestor::*[contains(@class, "MuiPaper-root")][1]');
    await expect(activeSequencesTile).toContainText('3');
    await expect(activeSequencesTile).toContainText('4 total');

    const queuedTile = page.locator('text=Songs queued').locator('xpath=ancestor::*[contains(@class, "MuiPaper-root")][1]');
    await expect(queuedTile).toContainText('2');

    // NowPlayingCard queue list — the rows are derived from show.requests
    // directly (not from the dashboardLiveStats poll), so they appear on
    // the first render. Queue label includes the count.
    await expect(page.locator('body')).toContainText(/Queue \(2\)/);
    await expect(page.locator('body')).toContainText('Sequence A');
    await expect(page.locator('body')).toContainText('Sequence B');
    // (We intentionally do NOT assert the playingNow / playingNext hero
    //  text — that's sourced from useDashboardLiveStats which polls every
    //  5s, so it's racey. Show-document-derived fields are deterministic.)
  });

  test('pause-state description and reset-votes visibility differ by control mode', async ({ page }) => {
    const user = await signUpAndSignIn(page);

    // Voting mode + paused — exercises the alternate UI branch.
    await seedShowByEmail(user.email, {
      'preferences.viewerControlMode': 'VOTING',
      'preferences.viewerControlEnabled': false,
    });

    // Single navigation with networkidle wait — avoids the goto+reload race
    // where Playwright aborts an in-flight `getShow` GraphQL request,
    // Apollo's onError handler calls logout(), and the reload lands on the
    // marketing landing page. Same flake fixed in sequences-editor.spec.
    await page.goto('/control-panel/dashboard', { waitUntil: 'networkidle' });

    await expect(page.locator('body')).toContainText(/Voting Mode/i);
    await expect(page.locator('body')).toContainText(/Standby ·/);
    // "Reset votes" button only renders in VOTING mode.
    await expect(page.getByRole('button', { name: /reset votes/i })).toBeVisible();
  });
});
