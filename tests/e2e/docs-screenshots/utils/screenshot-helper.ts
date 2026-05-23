import { mkdirSync } from 'fs';
import { resolve } from 'path';
import type { Locator, Page, TestInfo } from '@playwright/test';

import { appendManifestEntry } from './manifest-writer';

// Screenshot helper for the docs-screenshots tier.
//
// Two responsibilities:
//   • setupTheme(page)   — applies the project's colorScheme to the RF UI
//                          BEFORE the SPA mounts (must run pre-goto so the
//                          MUI ThemeProvider reads the right localStorage
//                          value).
//   • takeScreenshot()   — settles animations best-effort, captures the
//                          target into docs-output/screenshots/<theme>/<name>.png,
//                          and appends a manifest entry.
//
// Animation handling caveat: RF uses Framer Motion which schedules via RAF
// rather than the Web Animations API, so `document.getAnimations()` won't
// see everything. We layer three defenses: an explicit wait, a getAnimations
// finish/cancel sweep, and `animations: 'disabled'` on the Playwright
// screenshot call (always). See PRD §5.1.

const DEFAULT_WAIT_MS = 750;
export const VIEWPORT = { width: 1440, height: 900 } as const;
export const THEMES = ['light', 'dark'] as const;

export type ColorScheme = (typeof THEMES)[number];

/**
 * Resolve the active colorScheme from the Playwright project name (set on
 * the test info). Falls back to reading the page's matchMedia at runtime
 * if the project name isn't one of the documented values. The project name
 * is the authoritative source — it's set in playwright.config.ts as
 * `screenshots-light` / `screenshots-dark` (per PRD §5.1).
 */
export const colorSchemeFromProject = (projectName: string): ColorScheme => {
  if (projectName === 'screenshots-dark') return 'dark';
  if (projectName === 'screenshots-light') return 'light';
  // Fallback: assume light. Specs always run under one of the two named
  // projects in practice — this is just so a future ad-hoc invocation
  // doesn't throw.
  return 'light';
};

/**
 * Resolve the on-disk output directory for a given colorScheme.
 * docs-output/ lives at the monorepo root (gitignored).
 *
 *   tests/e2e/docs-screenshots/utils/screenshot-helper.ts
 *     → __dirname = .../tests/e2e/docs-screenshots/utils
 *     → ../../../../docs-output/screenshots/<theme>
 *
 * (Walks: utils → docs-screenshots → e2e → tests → repo-root.)
 */
export const screenshotDir = (colorScheme: ColorScheme): string =>
  resolve(__dirname, '../../../../docs-output/screenshots', colorScheme);

/**
 * Apply the project's colorScheme to RF UI's `localStorage['rf-config']`
 * before the SPA mounts. Must be called BEFORE `page.goto()` so that the
 * MUI ThemeProvider reads the right value at first render.
 *
 * RF stores theme as part of a wider `rf-config` blob — merge, don't
 * replace, to keep any other config values intact.
 */
export const setupTheme = async (page: Page): Promise<void> => {
  // matchMedia is set by Playwright's per-project `colorScheme` option —
  // we read it inside addInitScript so we don't need to thread the value
  // through from the project name. This also keeps the helper symmetric
  // with the PRD §5.1 snippet.
  await page.addInitScript(() => {
    const mode = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    const raw = window.localStorage.getItem('rf-config');
    let cfg: Record<string, unknown> = {};
    if (raw) {
      try {
        cfg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Bad JSON in localStorage — overwrite cleanly.
        cfg = {};
      }
    }
    window.localStorage.setItem(
      'rf-config',
      JSON.stringify({ ...cfg, navType: mode }),
    );
  });
};

/**
 * Best-effort animation settling. `document.getAnimations()` covers CSS
 * transitions and Web-Animations-API animations; Framer Motion uses RAF
 * and is largely invisible here. The `animations: 'disabled'` flag on the
 * screenshot call below is the real backstop.
 */
const settleAnimations = async (page: Page): Promise<void> => {
  await page
    .evaluate(() => {
      for (const a of document.getAnimations()) {
        const effect = a.effect as KeyframeEffect | null;
        const timing = effect?.getTiming?.();
        if (timing && timing.iterations !== Infinity) {
          try {
            a.finish();
          } catch {
            // Some animations don't allow finish() — ignore.
          }
        } else {
          try {
            a.cancel();
          } catch {
            // ignore
          }
        }
      }
    })
    .catch(() => {
      // page may be navigating; not fatal.
    });
};

export interface TakeScreenshotOptions {
  /** Delay before capture, after navigation, in ms. Default 750. */
  waitBeforeMs?: number;
  /** Run the getAnimations settle sweep. Default true. */
  waitForAnimations?: boolean;
  /** Manifest alt text. Defaults to a humanized version of `name`. */
  alt?: string;
  /** Manifest state label (e.g. 'jukebox', 'voting'). Default 'default'. */
  state?: string;
}

/**
 * Capture a screenshot and append a manifest entry.
 *
 * `target` is either a Playwright Locator (element-capture) or the literal
 * string `'fullPage'` to capture the full viewport.
 *
 * Resolves the on-disk path via the Playwright project name on `testInfo`
 * (we need that to pick light/dark). Always passes `animations: 'disabled'`
 * to the underlying screenshot call.
 */
export const takeScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  target: Locator | 'fullPage',
  name: string,
  opts: TakeScreenshotOptions = {},
): Promise<void> => {
  const {
    waitBeforeMs = DEFAULT_WAIT_MS,
    waitForAnimations = true,
    alt = humanize(name),
    state = 'default',
  } = opts;

  if (waitBeforeMs > 0) {
    await page.waitForTimeout(waitBeforeMs);
  }
  if (waitForAnimations) {
    await settleAnimations(page);
  }

  const colorScheme = colorSchemeFromProject(testInfo.project.name);
  const outDir = screenshotDir(colorScheme);
  mkdirSync(outDir, { recursive: true });

  const path = resolve(outDir, `${name}.png`);

  let selectorForManifest: string;
  if (target === 'fullPage') {
    await page.screenshot({
      path,
      fullPage: true,
      animations: 'disabled',
    });
    selectorForManifest = 'full-page';
  } else {
    await target.waitFor({ state: 'visible' });
    await target.screenshot({
      path,
      animations: 'disabled',
    });
    // Best-effort selector capture for the manifest. Playwright doesn't
    // expose the underlying selector string off a Locator, but the locator's
    // toString() returns something like `locator('[data-testid="x"]')` which
    // is informative enough for the audit trail.
    selectorForManifest = target.toString();
  }

  appendManifestEntry({
    name,
    alt,
    selector: selectorForManifest,
    state,
  });
};

const humanize = (name: string): string =>
  name
    .split('-')
    .map((word, i) => (i === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
