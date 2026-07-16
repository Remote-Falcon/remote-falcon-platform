// Bulk song-metadata lookup over the iTunes Search API (PRD-remote-falcon-003).
//
// Sequentially looks up a list of sequences and proposes the FIRST match for
// each — the caller shows the proposals in a review table before anything is
// committed. Pacing is contract: Apple documents the Search API at
// "approximately 20 calls per minute", so items run one per interval
// (default ~17/min) rather than in a burst. A 100-sequence pass takes about
// six minutes — the UI must show progress and offer cancel.

import { lookupITunes } from './musicMetadata';

export const BULK_LOOKUP_INTERVAL_MS = 3500;

// Abort-aware sleep: resolves early (never rejects) when the signal fires.
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let timer = null;
    const done = () => {
      signal?.removeEventListener('abort', done);
      if (timer !== null) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

/**
 * Run first-match lookups for `items` ([{ key, query }]) at a rate-limited
 * pace. Returns [{ key, query, match, error }] — `match` is the first
 * result or null; `error` is a message when that item's lookup threw
 * (errors never abort the run). Passing an AbortSignal stops after the
 * in-flight item and returns what was fetched so far.
 */
export const runBulkLookup = async (items, { lookup = lookupITunes, intervalMs = BULK_LOOKUP_INTERVAL_MS, onProgress, signal } = {}) => {
  const rows = [];
  for (let i = 0; i < items.length; i += 1) {
    if (signal?.aborted) break;
    const item = items[i];
    let match = null;
    let error = null;
    try {
      const results = await lookup(item.query);
      match = results?.[0] ?? null;
    } catch (e) {
      error = e?.message || 'Lookup failed';
    }
    rows.push({ key: item.key, query: item.query, match, error });
    onProgress?.({ done: rows.length, total: items.length, last: rows[rows.length - 1] });
    if (i < items.length - 1 && !signal?.aborted) {
      await sleep(intervalMs, signal);
    }
  }
  return rows;
};
