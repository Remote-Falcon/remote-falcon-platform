import { MongoClient } from 'mongodb';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { FIXTURE_EMAIL } from './fixtures';

// Mongo-side state helpers used by the docs-screenshots specs.
//
// The docs tier writes against a dedicated DB (`remote-falcon-docs`, per
// PRD §5.3 / Q3) so it can carry richer fixture state without interfering
// with smoke/regression. Flipping show fields directly is fine — Q2's
// dashboardLiveStats spike confirmed every tile reads from the embedded
// show document, so a Mongo `$set` is reflected on the next page load
// with no service restart.

const MONGO_URI =
  process.env.MONGO_URI ?? 'mongodb://localhost:27017/remote-falcon-docs';

// docs-screenshots tier targets a different DB than smoke/regression
// (see PRD §5.3). Honor an explicit override but default to the docs DB.
const DB_NAME = process.env.MONGO_DATABASE ?? 'remote-falcon-docs';

const withClient = async <T>(fn: (client: MongoClient) => Promise<T>): Promise<T> => {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
};

export type ViewerControlMode = 'JUKEBOX' | 'VOTING';

/**
 * Flip the docs-demo show into a specific viewerControlMode by direct
 * Mongo write. Reflected on the next dashboard page load (no service
 * restart needed — DashboardService reads the field straight off the show
 * document, per the PRD Q2 spike).
 *
 * The fixture user's email is the lookup key; the seed-and-setup slice
 * guarantees there's exactly one show with this email in the docs DB.
 */
export const flipShowMode = async (mode: ViewerControlMode): Promise<void> => {
  await withClient(async (client) => {
    const res = await client
      .db(DB_NAME)
      .collection('show')
      .updateOne(
        { email: FIXTURE_EMAIL },
        { $set: { 'preferences.viewerControlMode': mode } },
      );
    if (res.matchedCount === 0) {
      throw new Error(
        `flipShowMode: no show found for fixture email=${FIXTURE_EMAIL} in db=${DB_NAME}. ` +
          'Did global-setup run?',
      );
    }
  });
};

/**
 * Restore the show to its default mode (JUKEBOX). The seed sets this on
 * setup; specs that flip into VOTING for a single shot should call this
 * in a `finally` so a failing capture doesn't leave the fixture in the
 * wrong state for subsequent tests.
 */
export const restoreShowMode = (): Promise<void> => flipShowMode('JUKEBOX');

/**
 * Wait for the dashboard's live-stats data to be ready before capturing.
 *
 * The Dashboard page renders a few cards (Show Health, Now Playing, the
 * pre-show checklist, the LiveStatsRow tiles) that hydrate from a polled
 * `dashboardLiveStats` query. We use `dashboard-show-health` becoming
 * visible as the heuristic — by the time the health card renders, the
 * underlying query has resolved and the rest of the cards have data.
 *
 * Hardcoded testid (per Appendix B.3). If the testid moves, both this
 * helper and the dashboard spec need to track the change together.
 */
export const waitForDashboardData = async (page: Page): Promise<void> => {
  const healthCard = page.locator('[data-testid="dashboard-show-health"]');
  await expect(healthCard).toBeVisible({ timeout: 20_000 });
  // Small settle for downstream Apollo refetches; the screenshot helper
  // adds its own animation delay on top.
  await page.waitForLoadState('networkidle').catch(() => {
    // networkidle can be flaky on pages with long-poll websockets; fall
    // through if it times out — the visibility check above is the
    // load-completion signal that matters.
  });
};
