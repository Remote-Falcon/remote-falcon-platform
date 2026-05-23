// Fixed-credentials reader for the docs-screenshots tier.
//
// The seed-and-setup slice creates a single canonical fixture user in the
// `remote-falcon-docs` Mongo DB during global-setup (per PRD §5.3) using
// these env vars. Specs that need an authenticated session reuse the
// existing `signIn(page, email, password)` helper from regression/helpers
// and pass these values in.
//
// Source of truth: `.env.local` at the repo root (gitignored), with the
// matching keys committed to `.env.example`. We throw loudly on missing
// values so that running `npm run test:docs-screenshots` against an
// unconfigured machine fails with a clear error message rather than a
// confusing GraphQL "invalid credentials" 401 deep inside a spec.

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `docs-screenshots: required env var ${name} is not set. ` +
        'Configure it in .env.local at the repo root (see .env.example).',
    );
  }
  return value;
};

export const FIXTURE_EMAIL = requireEnv('DOCS_FIXTURE_USER_EMAIL');
export const FIXTURE_PASSWORD = requireEnv('DOCS_FIXTURE_USER_PASSWORD');
