import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BULK_LOOKUP_INTERVAL_MS, estimateBulkLookupMinutes, runBulkLookup } from '../bulkMetadataLookup';

// The queue must stay under Apple's documented ~20 calls/minute for the
// iTunes Search API, so pacing (one lookup per interval) is contract, not
// implementation detail.

const song = (overrides = {}) => ({
  title: 'Carol of the Bells',
  artist: 'Trans-Siberian Orchestra',
  album: 'Christmas Eve',
  artworkUrl: 'https://x.mzstatic.com/600x600bb.jpg',
  thumbnailUrl: 'https://x.mzstatic.com/100x100bb.jpg',
  ...overrides
});

describe('runBulkLookup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('looks up every item and picks the first match', async () => {
    const lookup = vi.fn().mockResolvedValue([song(), song({ title: 'Second' })]);
    const promise = runBulkLookup(
      [
        { key: 'a', query: 'carol of the bells' },
        { key: 'b', query: 'wizards in winter' }
      ],
      { lookup, intervalMs: 1000 }
    );
    await vi.runAllTimersAsync();
    const rows = await promise;

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe('a');
    expect(rows[0].match.title).toBe('Carol of the Bells');
    expect(rows[1].key).toBe('b');
  });

  it('paces lookups by the interval (no burst)', async () => {
    const callTimes = [];
    const lookup = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve([song()]);
    });
    const start = Date.now();
    const promise = runBulkLookup(
      [
        { key: 'a', query: 'one' },
        { key: 'b', query: 'two' },
        { key: 'c', query: 'three' }
      ],
      { lookup, intervalMs: 1000 }
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(callTimes.map((t) => t - start)).toEqual([0, 1000, 2000]);
  });

  it('records a null match when nothing is found', async () => {
    const lookup = vi.fn().mockResolvedValue([]);
    const promise = runBulkLookup([{ key: 'a', query: 'obscure name' }], { lookup, intervalMs: 0 });
    await vi.runAllTimersAsync();
    const rows = await promise;
    expect(rows[0].match).toBeNull();
    expect(rows[0].error).toBeNull();
  });

  it('records per-item errors without aborting the run', async () => {
    const lookup = vi
      .fn()
      .mockRejectedValueOnce(new Error('iTunes search failed (503)'))
      .mockResolvedValueOnce([song()]);
    const promise = runBulkLookup(
      [
        { key: 'a', query: 'one' },
        { key: 'b', query: 'two' }
      ],
      { lookup, intervalMs: 1000 }
    );
    await vi.runAllTimersAsync();
    const rows = await promise;

    expect(rows[0].match).toBeNull();
    expect(rows[0].error).toMatch(/503/);
    expect(rows[1].match).not.toBeNull();
  });

  it('reports progress before each request (with the in-flight query) and after each row', async () => {
    const lookup = vi.fn().mockResolvedValue([song()]);
    const seen = [];
    const promise = runBulkLookup(
      [
        { key: 'a', query: 'one' },
        { key: 'b', query: 'two' }
      ],
      { lookup, intervalMs: 1000, onProgress: (p) => seen.push({ ...p }) }
    );
    await vi.runAllTimersAsync();
    await promise;

    // `current` names the query actually in flight; it is null while the
    // run is only waiting out the pacing interval, so the UI never claims
    // to be looking something up before its request has started.
    expect(seen.map((p) => [p.done, p.total, p.current])).toEqual([
      [0, 2, 'one'],
      [1, 2, null],
      [1, 2, 'two'],
      [2, 2, null]
    ]);
  });

  it('looks up duplicate queries once and reuses the answer without a pacing slot', async () => {
    const lookup = vi.fn().mockResolvedValue([song()]);
    const promise = runBulkLookup(
      [
        { key: 'a', query: 'wizards in winter' },
        { key: 'b', query: 'wizards in winter' },
        { key: 'c', query: 'carol of the bells' }
      ],
      { lookup, intervalMs: 1000 }
    );
    await vi.runAllTimersAsync();
    const rows = await promise;

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(3);
    expect(rows[1].match.title).toBe('Carol of the Bells');
    expect(rows[1].error).toBeNull();
  });

  it('passes the abort signal through to the lookup and drops the aborted item silently', async () => {
    const controller = new AbortController();
    const lookup = vi.fn().mockImplementation((query, { signal } = {}) => {
      expect(signal).toBe(controller.signal);
      if (lookup.mock.calls.length === 2) {
        // Simulate Cancel landing while this request is in flight: the
        // composed fetch signal rejects with AbortError.
        controller.abort();
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return Promise.resolve([song()]);
    });
    const promise = runBulkLookup(
      [
        { key: 'a', query: 'one' },
        { key: 'b', query: 'two' },
        { key: 'c', query: 'three' }
      ],
      { lookup, intervalMs: 1000, signal: controller.signal }
    );
    await vi.runAllTimersAsync();
    const rows = await promise;

    // The aborted item is not recorded as a failed row; the run just ends.
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('a');
    expect(rows[0].error).toBeNull();
  });

  it('stops early when aborted and returns the rows fetched so far', async () => {
    const controller = new AbortController();
    const lookup = vi.fn().mockImplementation(() => {
      if (lookup.mock.calls.length === 1) {
        // Abort while waiting out the interval after the first item.
        setTimeout(() => controller.abort(), 100);
      }
      return Promise.resolve([song()]);
    });
    const promise = runBulkLookup(
      [
        { key: 'a', query: 'one' },
        { key: 'b', query: 'two' },
        { key: 'c', query: 'three' }
      ],
      { lookup, intervalMs: 1000, signal: controller.signal }
    );
    await vi.runAllTimersAsync();
    const rows = await promise;

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('a');
  });

  it('defaults the interval to the documented rate-limit-safe value', () => {
    // ~17/min, under Apple's ~20 calls/minute.
    expect(BULK_LOOKUP_INTERVAL_MS).toBeGreaterThanOrEqual(3000);
  });
});

describe('estimateBulkLookupMinutes', () => {
  it('floors small passes at one minute', () => {
    expect(estimateBulkLookupMinutes(1)).toBe(1);
    expect(estimateBulkLookupMinutes(10)).toBe(1);
  });

  it('rounds to the nearest whole minute at scale', () => {
    // 100 items * 3.5s = 350s -> 5.83 min -> 6
    expect(estimateBulkLookupMinutes(100)).toBe(6);
    // 26 items * 3.5s = 91s -> 1.52 min -> 2
    expect(estimateBulkLookupMinutes(26)).toBe(2);
  });
});
