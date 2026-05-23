import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

// In-process manifest accumulator for the docs-screenshots tier.
//
// Per PRD §5.4 the manifest is the audit trail for which shots were captured
// during a run. Each `takeScreenshot()` call appends one entry here and the
// manifest is re-serialized to disk on the same call.
//
// Why self-flush (not globalTeardown): Playwright's globalTeardown runs in a
// separate Node process from the test workers, so the in-memory Map below
// would be empty when it's invoked. The simplest robust shape is to persist
// after every append — last write wins, the JSON is sorted/deterministic,
// and there's no cross-process coordination to get wrong.
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

// Run-level metadata. Hard-coded to match playwright.config.ts's docs tier
// projects (per PRD §5.1: Desktop Chrome 1440x900, light + dark). Kept in
// this file to avoid an import cycle with screenshot-helper.ts.
const MANIFEST_VIEWPORT: ManifestMetadata['viewport'] = { width: 1440, height: 900 };
const MANIFEST_THEMES: ManifestMetadata['themes'] = ['light', 'dark'];

// Module-scope singleton. Playwright runs each project in the same Node
// process when serialized (workers: 1 for the docs tier), so the in-memory
// accumulator naturally aggregates across screenshots-light + screenshots-dark.
const entries = new Map<string, ManifestEntry>();

export const appendManifestEntry = (entry: ManifestEntry): void => {
  entries.set(entry.name, entry);
  writeManifest();
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
 * Serialize the accumulated entries to disk. Sorts by name for a stable
 * diff between runs. Called automatically after every append; also
 * exported so callers can force a flush if needed.
 */
export const flushManifest = (_metadata?: ManifestMetadata): void => {
  writeManifest();
};

const writeManifest = (): void => {
  const outPath = manifestOutputPath();
  mkdirSync(dirname(outPath), { recursive: true });

  const screenshots = [...entries.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const payload = {
    generated: new Date().toISOString(),
    viewport: MANIFEST_VIEWPORT,
    themes: MANIFEST_THEMES,
    screenshots,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
};

/**
 * Test helper: returns a snapshot of the current accumulator.
 */
export const manifestEntries = (): ManifestEntry[] => [...entries.values()];
