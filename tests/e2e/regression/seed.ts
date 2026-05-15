import { MongoClient, type Document } from 'mongodb';

// Per-test data seeding. The global-setup wipes the `show` collection and
// loads `fixtures/seed-shows/*.json` once before all tests; that's the
// baseline. Specs that need richer state (sequences, requests, stats,
// pages, etc.) call these helpers AFTER signing up their fresh user.
//
// Two patterns:
//   • seedShowByEmail(email, $set patches) — find the show the test just
//     created (signUpAndSignIn picks a faker email) and overlay rich state.
//   • insertViewerShow(doc) — drop a standalone document straight in for
//     anonymous viewer-page tests; no signup required.
//
// Both connect, mutate, and disconnect per-call. That's fine for E2E
// volumes (one or two writes per test).
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/remote-falcon';
const DB_NAME = process.env.MONGO_DATABASE ?? 'remote-falcon';

const withClient = async <T>(fn: (client: MongoClient) => Promise<T>): Promise<T> => {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
};

export const seedShowByEmail = async (email: string, patches: Document): Promise<void> => {
  await withClient(async (client) => {
    const res = await client
      .db(DB_NAME)
      .collection('show')
      .updateOne({ email }, { $set: patches });
    if (res.matchedCount === 0) {
      throw new Error(`seedShowByEmail: no show found for email=${email}`);
    }
  });
};

export const insertViewerShow = async (doc: Document): Promise<void> => {
  await withClient(async (client) => {
    await client.db(DB_NAME).collection('show').insertOne(doc);
  });
};

export const deleteShowBySubdomain = async (subdomain: string): Promise<void> => {
  await withClient(async (client) => {
    await client.db(DB_NAME).collection('show').deleteOne({ showSubdomain: subdomain });
  });
};

// Convenience builders for typical seed shapes.

export const buildSequence = (overrides: Document = {}): Document => ({
  name: 'Test Sequence',
  displayName: 'Test Sequence',
  duration: 180,
  visible: true,
  index: 0,
  order: 0,
  imageUrl: '',
  active: true,
  visibilityCount: 0,
  type: 'SEQUENCE',
  group: null,
  category: null,
  artist: 'Test Artist',
  ...overrides,
});

export const buildRequest = (overrides: Document = {}): Document => ({
  sequence: {
    name: 'Test Sequence',
    displayName: 'Test Sequence',
    artist: 'Test Artist',
    imageUrl: '',
    index: 0,
  },
  position: 1,
  ownerRequested: false,
  ...overrides,
});

// Minimal jukebox-mode viewer page. Renders show name + a placeholder where
// the React parser injects each visible sequence as a clickable row
// (data-key attribute = sequence.name → click triggers addSequenceToQueue).
//
// Real production templates are 200+ lines with full themes; this is a
// stripped-down stand-in that exercises the same render path.
export const minimalJukeboxPage = (showName: string): Document => ({
  name: 'test-page',
  active: true,
  html: `
<div class="rf-viewer">
  <h1 class="show-name">${showName}</h1>
  <div class="now-playing-block">Now playing: <span>{NOW_PLAYING}</span></div>
  <div class="next-block">Up next: <span>{NEXT_PLAYLIST}</span></div>
  <div {jukebox-dynamic-container}="">
    <h2>Pick a song</h2>
    <ul class="playlists">{PLAYLISTS}</ul>
  </div>
  <div class="queue-block">
    <h3>Queue ({QUEUE_SIZE})</h3>
    <div class="jukebox-queue">{JUKEBOX_QUEUE}</div>
  </div>
</div>`,
});
