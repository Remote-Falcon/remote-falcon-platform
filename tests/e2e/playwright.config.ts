import { defineConfig, devices, type Project } from '@playwright/test';

const tier = process.env.PLAYWRIGHT_TIER ?? 'smoke';
const testMatch =
  tier === 'regression' ? 'regression/**/*.spec.ts' : 'smoke/**/*.spec.ts';

// Smoke tier: chromium only — keeps the PR/push CI budget tight.
// Regression tier: chromium + firefox + webkit, runs nightly + on-demand.
const projects: Project[] = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
];

if (tier === 'regression') {
  projects.push(
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

export default defineConfig({
  testDir: '.',
  testMatch,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
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
