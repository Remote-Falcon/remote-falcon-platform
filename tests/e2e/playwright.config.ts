import { defineConfig, devices, type Project } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Load .env.local from the e2e package root if present. Picks up the docs
// tier's fixture credentials (DOCS_FIXTURE_USER_EMAIL/PASSWORD) and any
// Mongo/GraphQL URL overrides without requiring callers to export them
// inline. See .env.example for the variables this expects.
loadEnv({ path: resolve(__dirname, '.env.local'), quiet: true });

const tier = process.env.PLAYWRIGHT_TIER ?? 'smoke';
const testMatch =
  tier === 'regression' ? 'regression/**/*.spec.ts'
  : tier === 'docs-screenshots' ? 'docs-screenshots/**/*.screenshot.ts'
  : 'smoke/**/*.spec.ts';

// Smoke tier: chromium only — keeps the PR/push CI budget tight.
// Regression tier: chromium + firefox + webkit, runs nightly + on-demand.
// docs-screenshots tier: Desktop Chrome 1440x900, light + dark color schemes.
const projects: Project[] = (() => {
  if (tier === 'docs-screenshots') {
    return [
      {
        name: 'screenshots-light',
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1440, height: 900 },
          colorScheme: 'light',
        },
      },
      {
        name: 'screenshots-dark',
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1440, height: 900 },
          colorScheme: 'dark',
        },
      },
    ];
  }

  const list: Project[] = [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ];

  if (tier === 'regression') {
    list.push(
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      },
    );
  }

  return list;
})();

const isDocsTier = tier === 'docs-screenshots';

export default defineConfig({
  testDir: '.',
  testMatch,
  // docs-screenshots tier shares a single fixture user; serialize to avoid
  // login races. Smoke/regression keep the existing parallel behavior.
  fullyParallel: !isDocsTier,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: isDocsTier ? 1 : (process.env.CI ? 2 : undefined),
  globalSetup: './global-setup.ts',
  globalTimeout: 20 * 60 * 1000,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['github'],
  ],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects,
});
