import { MongoClient } from 'mongodb';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DOCS_DB_NAME = 'remote-falcon-docs';
// The control-panel Spring Boot app is served under context path
// /remote-falcon-control-panel — both at the direct port (8081) and via the
// dev nginx ingress on :8080. Default to direct-port to keep the docs tier
// independent of ingress being up, but allow override for ingress-routed runs.
const CONTROL_PANEL_GRAPHQL = process.env.DOCS_CONTROL_PANEL_GRAPHQL_URL
  ?? 'http://localhost:8081/remote-falcon-control-panel/graphql';

/**
 * Connect to Mongo with a short retry loop — dev-up.sh's health check has
 * passed by the time we get here but Mongo can briefly flap on cold-start.
 */
const connectMongo = async (uri: string): Promise<MongoClient> => {
  const client = new MongoClient(uri);
  let lastError: Error | undefined;
  for (let i = 0; i < 5; i++) {
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastError = err as Error;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw lastError ?? new Error('Failed to connect to Mongo');
};

/**
 * Override the database segment of a Mongo connection URI.
 * `mongodb://host:27017/old-db?opts` -> `mongodb://host:27017/new-db?opts`
 */
const overrideDbInUri = (uri: string, dbName: string): string => {
  // Strip any existing /<db> segment after host:port, before optional ?query.
  const [base, query] = uri.split('?', 2);
  const withoutDb = base.replace(/\/[^/]*$/, '');
  return `${withoutDb}/${dbName}${query ? `?${query}` : ''}`;
};

/** Default (smoke/regression) behavior — unchanged from the original. */
const seedDefault = async (uri: string, dbName: string): Promise<void> => {
  const client = await connectMongo(uri);
  try {
    const db = client.db(dbName);
    await db.collection('show').deleteMany({});

    const fixturesDir = join(__dirname, '../fixtures/seed-shows');
    if (existsSync(fixturesDir)) {
      for (const file of readdirSync(fixturesDir).filter(f => f.endsWith('.json'))) {
        const doc = JSON.parse(readFileSync(join(fixturesDir, file), 'utf-8'));
        await db.collection('show').insertOne(doc);
      }
    }
  } finally {
    await client.close();
  }
};

interface DocsEnrichment {
  playingNow?: string;
  lastFppHeartbeat?: string;
  pluginVersion?: string;
  fppVersion?: string;
  preferences?: Record<string, unknown>;
  sequences?: Array<Record<string, unknown>>;
  sequenceGroups?: Array<Record<string, unknown>>;
  requests?: Array<Record<string, unknown>>;
  votes?: Array<Record<string, unknown>>;
  activeViewers?: Array<Record<string, unknown>>;
  viewerSessions?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

/**
 * Today (host local time) as a LocalDate-shaped string YYYY-MM-DD.
 * `viewerSessions[*].nightDate` is a LocalDate on the Java side; Mongo
 * stores it as the same string when the document was written by Spring.
 */
const todayLocalDate = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * "Today at HH:MM:SS local" as a JS Date. Used to anchor viewerSessions
 * inside the show's timezone window. The host's local timezone is the
 * deterministic anchor for v1 (the spec runs locally, not in CI).
 */
const todayAt = (hours: number, minutes: number, seconds = 0): Date => {
  const d = new Date();
  d.setHours(hours, minutes, seconds, 0);
  return d;
};

/**
 * Apply the runtime timestamp rewrites called out in PRD Appendix A.3.
 * The JSON ships with placeholder ISO strings so it's reviewable in PRs;
 * the actual Date instances are computed here so the dashboard tiles
 * compute (within-last-5-min / today's-window / 30s-heartbeat).
 */
const rewriteTimestamps = (raw: DocsEnrichment): Record<string, unknown> => {
  const enrichment: Record<string, unknown> = { ...raw };

  // lastFppHeartbeat → now() - 30s → green Show Health row.
  enrichment.lastFppHeartbeat = new Date(Date.now() - 30 * 1000);

  // activeViewers[*].visitDateTime → spaced inside the last 5 minutes so
  // DashboardService.dashboardLiveStats() counts every one of them.
  if (Array.isArray(raw.activeViewers)) {
    enrichment.activeViewers = raw.activeViewers.map((v, i) => ({
      ...v,
      visitDateTime: new Date(Date.now() - i * 60 * 1000),
    }));
  }

  // viewerSessions[*] anchored to today @ 18:00 local; lastSeen 10-15 min
  // later for a natural ~10 min median dwell. nightDate is today's
  // LocalDate string.
  if (Array.isArray(raw.viewerSessions)) {
    const night = todayLocalDate();
    enrichment.viewerSessions = raw.viewerSessions.map((s, i) => {
      const firstSeen = todayAt(18, 0, 0);
      const dwellMinutes = 10 + (i * 2) % 6; // 10, 12, 14 → median 12
      const lastSeen = new Date(firstSeen.getTime() + dwellMinutes * 60 * 1000);
      return { ...s, firstSeen, lastSeen, nightDate: night };
    });
  }

  // votes[*].lastVoteTime → 5 min ago, recent enough to look live.
  if (Array.isArray(raw.votes)) {
    const lastVote = new Date(Date.now() - 5 * 60 * 1000);
    enrichment.votes = raw.votes.map(v => ({ ...v, lastVoteTime: lastVote }));
  }

  return enrichment;
};

/**
 * Phase A — call the live signUp GraphQL mutation. Credentials travel in
 * the HTTP Basic Auth header (PRD §8 Q8); GraphQL variables only carry
 * the names. The control-panel handles bcrypt hashing, subdomain
 * derivation, and default page init.
 */
const signUpDocsShow = async (email: string, password: string): Promise<void> => {
  const basic = Buffer.from(`${email}:${password}`).toString('base64');
  const body = JSON.stringify({
    query: 'mutation { signUp(firstName: "Docs", lastName: "Demo", showName: "Docs Demo Lights") }',
  });

  const res = await fetch(CONTROL_PANEL_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basic}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(
      `[docs-screenshots] signUp failed: HTTP ${res.status} ${res.statusText} — ${await res.text()}`
    );
  }

  const payload = await res.json() as { data?: { signUp?: boolean }, errors?: unknown };
  if (payload.errors) {
    throw new Error(`[docs-screenshots] signUp returned errors: ${JSON.stringify(payload.errors)}`);
  }
  if (payload.data?.signUp !== true) {
    throw new Error(
      `[docs-screenshots] signUp returned ${payload.data?.signUp} (expected true). ` +
      `Likely a duplicate email or subdomain — drop the show collection in ${DOCS_DB_NAME} and retry.`
    );
  }
};

/**
 * docs-screenshots tier — two-phase seed (live signUp + Mongo enrichment).
 * Targets the isolated `remote-falcon-docs` DB so it can coexist on disk
 * with the regular smoke/regression `remote-falcon` DB. PRD §5.3.
 */
const seedDocsScreenshots = async (mongoUri: string): Promise<void> => {
  const email = process.env.DOCS_FIXTURE_USER_EMAIL;
  const password = process.env.DOCS_FIXTURE_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      '[docs-screenshots] DOCS_FIXTURE_USER_EMAIL and DOCS_FIXTURE_USER_PASSWORD must be set. ' +
      'See tests/e2e/.env.example.'
    );
  }

  // Make sure we're hitting the docs DB regardless of what was in the URI.
  const docsUri = overrideDbInUri(mongoUri, DOCS_DB_NAME);

  // Drop the show collection first so the signUp can't trip the
  // uniqueness check on email/subdomain.
  const client = await connectMongo(docsUri);
  try {
    const db = client.db(DOCS_DB_NAME);
    await db.collection('show').deleteMany({});
    console.log(`[docs-screenshots] seed: dropped show collection in ${DOCS_DB_NAME}`);

    // Phase A — live signUp.
    await signUpDocsShow(email, password);
    console.log('[docs-screenshots] seed: created show via signUp mutation');

    // Phase B — Mongo enrichment.
    const fixturePath = join(__dirname, 'fixtures/seed-shows-docs/docs-demo-show.json');
    if (!existsSync(fixturePath)) {
      throw new Error(`[docs-screenshots] missing fixture: ${fixturePath}`);
    }
    const raw = JSON.parse(readFileSync(fixturePath, 'utf-8')) as DocsEnrichment;
    const enrichment = rewriteTimestamps(raw);

    const result = await db.collection('show').updateOne(
      { email },
      { $set: enrichment },
    );
    if (result.matchedCount !== 1) {
      throw new Error(
        `[docs-screenshots] enrichment matched ${result.matchedCount} shows for email ${email} — expected 1.`
      );
    }
    const seqCount = Array.isArray(raw.sequences) ? raw.sequences.length : 0;
    const groupCount = Array.isArray(raw.sequenceGroups) ? raw.sequenceGroups.length : 0;
    const reqCount = Array.isArray(raw.requests) ? raw.requests.length : 0;
    console.log(
      `[docs-screenshots] seed: enriched with ${seqCount} sequences, ${groupCount} groups, ${reqCount} requests`
    );
  } finally {
    await client.close();
  }
};

export default async () => {
  const tier = process.env.PLAYWRIGHT_TIER ?? 'smoke';

  // dev-up.sh's mongo container runs without auth. Override MONGO_URI to
  // point at a Mongo with credentials if connecting to a different stack.
  const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/remote-falcon';

  if (tier === 'docs-screenshots') {
    await seedDocsScreenshots(uri);
    return;
  }

  // smoke / regression — original behavior preserved.
  const dbName = process.env.MONGO_DATABASE ?? 'remote-falcon';
  await seedDefault(uri, dbName);
};
