import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { getViewerId, VIEWER_ID_STORAGE_KEY } from '../viewerId';

// getViewerId is the synchronous, race-free source of the anonymous viewer
// id (PRD A3) that the viewer-page mutations send. It must be available the
// instant the page mounts (the page-view ping fires before the deferred
// enhancement scripts load), persist across visits, and degrade to null when
// localStorage is unavailable so the backend can fall back to IP identity.
describe('getViewerId', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('creates and persists a uuid on first call', () => {
    const id = getViewerId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(window.localStorage.getItem(VIEWER_ID_STORAGE_KEY)).toBe(id);
  });

  it('returns the same id on subsequent calls (stable across visits)', () => {
    const first = getViewerId();
    const second = getViewerId();
    expect(second).toBe(first);
  });

  it('reuses an id already present in localStorage', () => {
    window.localStorage.setItem(VIEWER_ID_STORAGE_KEY, 'pre-existing-id');
    expect(getViewerId()).toBe('pre-existing-id');
  });

  it('returns null when localStorage throws (e.g. blocked/incognito)', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getViewerId()).toBeNull();
  });
});
