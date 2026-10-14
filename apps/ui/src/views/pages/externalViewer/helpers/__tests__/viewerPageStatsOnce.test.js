import { describe, expect, it } from 'vitest';

import { markViewerPageStatsRecorded, viewerPageStatsAlreadyRecorded } from '../viewerPageStatsOnce';

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

  it('records once per show per session', () => {
    const storage = memoryStorage();
    markViewerPageStatsRecorded('holtz', storage);
    expect(viewerPageStatsAlreadyRecorded('holtz', storage)).toBe(true);
    expect(viewerPageStatsAlreadyRecorded('othershow', storage)).toBe(false);
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
