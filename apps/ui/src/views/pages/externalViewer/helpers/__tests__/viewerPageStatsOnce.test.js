import { describe, expect, it } from 'vitest';

import { DEDUPE_WINDOW_MS, markViewerPageStatsRecorded, viewerPageStatsAlreadyRecorded } from '../viewerPageStatsOnce';

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v))
  };
};

describe('viewerPageStatsOnce', () => {
  it('reports not-recorded for a fresh session', () => {
    expect(viewerPageStatsAlreadyRecorded('holtz', memoryStorage())).toBe(false);
  });

  it('skips a repeat load of the same show inside the dedupe window', () => {
    const storage = memoryStorage();
    markViewerPageStatsRecorded('holtz', storage, 1000);
    expect(viewerPageStatsAlreadyRecorded('holtz', storage, 1000 + DEDUPE_WINDOW_MS - 1)).toBe(true);
    expect(viewerPageStatsAlreadyRecorded('othershow', storage, 1000)).toBe(false);
  });

  it('records again once the dedupe window has passed', () => {
    const storage = memoryStorage();
    markViewerPageStatsRecorded('holtz', storage, 1000);
    expect(viewerPageStatsAlreadyRecorded('holtz', storage, 1000 + DEDUPE_WINDOW_MS)).toBe(false);
  });

  it('treats a legacy or garbage value as not-recorded', () => {
    const storage = memoryStorage();
    storage.setItem('rf.viewerPageStats.holtz', 'x');
    expect(viewerPageStatsAlreadyRecorded('holtz', storage)).toBe(false);
  });

  it('treats blocked storage as not-recorded and never throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      }
    };
    expect(viewerPageStatsAlreadyRecorded('holtz', blocked)).toBe(false);
    expect(() => markViewerPageStatsRecorded('holtz', blocked)).not.toThrow();
  });

  it('defaults to window.sessionStorage', () => {
    window.sessionStorage.clear();
    expect(viewerPageStatsAlreadyRecorded('holtz')).toBe(false);
    markViewerPageStatsRecorded('holtz');
    expect(viewerPageStatsAlreadyRecorded('holtz')).toBe(true);
    window.sessionStorage.clear();
  });
});
