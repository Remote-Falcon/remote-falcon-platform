import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

// In-process manifest accumulator for the docs-screenshots tier.
//
// Per PRD §5.4 the manifest is the audit trail for which shots were captured
// during a run. Each `takeScreenshot()` call appends one entry here; the
// flush is called once at the end of the test run (we wire it via the
// Playwright `globalTeardown` hook from a sibling slice — when the
// tests/e2e/docs-screenshots/ specs run there's only ever one Playwright
// process, so an in-process Map is sufficient).
//
// Entries are deduplicated by name (two themes produce two PNGs but only one
// manifest entry — the name is theme-agnostic). When the same name is
// appended twice the second call wins on selector/alt/state; in practice
// they should be identical so this is a no-op.

export interface ManifestEntry {
  name: string;
  alt: string;
  selector: string;
  state: string;
}

export interface ManifestMetadata {
  viewport: { width: number; height: number };
  themes: string[];
}

// Module-scope singleton. Playwright runs each project in the same Node
// process when sharded; the in-memory accumulator naturally aggregates
// across both screenshots-light and screenshots-dark runs.
const entries = new Map<string, ManifestEntry>();

export const appendManifestEntry = (entry: ManifestEntry): void => {
  entries.set(entry.name, entry);
};

/**
 * Returns the absolute path that the manifest will be flushed to.
 * Co-located with the PNG output dir (resolved from the e2e package).
 */
export const manifestOutputPath = (): string =>
  // tests/e2e/docs-screenshots/utils/manifest-writer.ts
  //  → tests/e2e/docs-screenshots/utils/  (__dirname)
  //  → ../../../../docs-output/screenshots.manifest.json
  resolve(__dirname, '../../../../docs-output/screenshots.manifest.json');

/**
 * Serialize the accumulated entries to disk. Idempotent — calling twice
 * overwrites with the current state. Sorts entries by name for a stable
 * diff between runs.
 */
export const flushManifest = (metadata: ManifestMetadata): void => {
  const outPath = manifestOutputPath();
  mkdirSync(dirname(outPath), { recursive: true });

  const screenshots = [...entries.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const payload = {
    generated: new Date().toISOString(),
    viewport: metadata.viewport,
    themes: metadata.themes,
    screenshots,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
};

/**
 * Test helper: returns a snapshot of the current accumulator. Not used by
 * specs directly — exported so the globalTeardown can decide whether
 * there's anything worth flushing.
 */
export const manifestEntries = (): ManifestEntry[] => [...entries.values()];
