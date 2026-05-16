import { test, expect, devices } from '@playwright/test';

import { buildSequence, deleteShowBySubdomain, insertViewerShow, minimalJukeboxPage } from './seed';

// Regression: the public viewer page (`externalViewer/index.jsx`).
//
// This is the *audience-facing* surface — fans on their phones during a
// show — so testing it matters more than testing any owner screen. The
// page is anonymous (no auth), routed by subdomain (`getSubdomain()`
// reads `window.location.hostname` and looks for parts > HOSTNAME_PARTS),
// and renders a show-owner-authored HTML template with placeholder tags
// (`{PLAYLISTS}`, `{NOW_PLAYING}`, etc.) that the React parser replaces
// with live data.
//
// What we assert:
//   1. Subdomain routing works — visiting `<sub>.localhost:8080` triggers
//      ViewerGuard to redirect to `/remote-falcon`.
//   2. The show is fetched and rendered (show name appears in the parsed
//      page HTML).
//   3. Each visible sequence appears in the `{PLAYLISTS}` replacement.
//   4. The page renders correctly at a mobile viewport (where >90% of
//      viewer-page traffic lives).
//
// What we do NOT assert (deferred):
//   - The actual click → addSequenceToQueue → mutation round-trip. That
//     requires the viewer-mutations service to be wired up against the
//     same mongo instance, plus careful handling of location-check (the
//     fixture sets LocationCheckMethod=GEO with allowedRadius=99999 so
//     any browser geolocation is acceptable; in CI we'd need to grant
//     geolocation permission too).

const VIEWPORT = devices['iPhone 12'].viewport!;

const buildShow = (subdomain: string) => {
  const showName = `Viewer Test ${subdomain.slice(-6)}`;
  return {
    // No explicit _id — let Mongo generate an ObjectId. The viewer service
    // reads the show via Quarkus PanacheMongoEntity, whose _id is typed as
    // ObjectId; setting _id to a string here causes a silent deserialization
    // failure inside the resolver (swallowed by CustomGraphQLExceptionResolver,
    // returned to the UI as "System error"). The `finally` block deletes by
    // showSubdomain, so the _id isn't referenced after creation.
    showToken: `viewer-test-token-${subdomain}`,
    email: `${subdomain}@viewer.fixture`,
    password: '$2a$10$NotARealHashJustHereSoTheFieldExists0000000000000000',
    showName,
    showSubdomain: subdomain,
    emailVerified: true,
    showRole: 'USER',
    // BSON Date objects, not strings. The viewer's Quarkus Show entity
    // types these as LocalDateTime; strings here fail the POJO codec
    // deserialization inside the resolver (swallowed by
    // CustomGraphQLExceptionResolver, surfaces as "System error" to the UI).
    createdDate: new Date('2026-01-01T00:00:00Z'),
    expireDate: new Date('2099-01-01T00:00:00Z'),
    preferences: {
      viewerControlEnabled: true,
      viewerPageViewOnly: false,
      viewerControlMode: 'JUKEBOX',
      // GEO + huge radius = effectively disabled. We don't grant
      // geolocation perms in the test, so the mutation paths that
      // actually depend on coords would still gate, but the page-render
      // path under test here doesn't.
      locationCheckMethod: 'GEO',
      showLatitude: 0,
      showLongitude: 0,
      allowedRadius: 99999,
      jukeboxDepth: 0,
      jukeboxRequestLimit: 0,
      locationCode: 0,
      hideSequenceCount: 0,
      makeItSnow: false,
      managePsa: false,
      sequencesPlayed: 0,
      pageTitle: showName,
      pageIconUrl: null,
      psaEnabled: false,
      psaFrequency: 0,
      checkIfVoted: false,
      checkIfRequested: false,
      resetVotes: false,
      blockedViewerIps: [],
    },
    sequences: [
      buildSequence({ name: 'Carol of the Bells', displayName: 'Carol of the Bells', index: 0, order: 0, artist: 'TSO' }),
      buildSequence({ name: 'Wizards in Winter', displayName: 'Wizards in Winter', index: 1, order: 1, artist: 'TSO' }),
      buildSequence({ name: 'Christmas Eve Sarajevo', displayName: 'Christmas Eve / Sarajevo', index: 2, order: 2, artist: 'TSO' }),
    ],
    sequenceGroups: [],
    psaSequences: [],
    pages: [minimalJukeboxPage(showName)],
    stats: { page: [], jukebox: [], voting: [], votingWin: [] },
    requests: [],
    votes: [],
    activeViewers: [],
    playingNow: '',
    playingNext: '',
    playingNextFromSchedule: '',
    showNotifications: [],
    _class: 'com.remotefalcon.library.documents.Show',
  };
};

test.describe('viewer page (public, mobile)', () => {
  test.use({ viewport: VIEWPORT });

  test('subdomain routing + page render + sequence list', async ({ page }) => {
    // Subdomain must be unique-per-run so concurrent / retried runs don't
    // collide. Sub-domain rules: a-z0-9, must start with a letter.
    const subdomain = `viewer${Date.now().toString(36)}`.toLowerCase();
    const show = buildShow(subdomain);
    await insertViewerShow(show);

    try {
      // `*.localhost` resolves to 127.0.0.1 on macOS/Linux per the
      // reserved-TLD spec; nginx's default_server accepts any Host.
      const url = `http://${subdomain}.localhost:8080/`;
      await page.goto(url);

      // ViewerGuard redirects to /remote-falcon when isExternalViewer().
      await expect(page).toHaveURL(new RegExp(`${subdomain}\\.localhost:8080/remote-falcon`), {
        timeout: 15_000,
      });

      // The minimalJukeboxPage HTML renders the show name in <h1>.
      await expect(page.locator('h1.show-name')).toHaveText(show.showName, {
        timeout: 15_000,
      });

      // The `{PLAYLISTS}` placeholder is replaced with one React-rendered
      // row per visible sequence. Each row renders the displayName text
      // somewhere inside .playlists.
      const list = page.locator('ul.playlists');
      await expect(list).toBeVisible();
      for (const seq of show.sequences) {
        await expect(list).toContainText(seq.displayName, { timeout: 10_000 });
      }
    } finally {
      await deleteShowBySubdomain(subdomain);
    }
  });
});
