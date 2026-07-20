import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import useDismissedNotifications from './useDismissedNotifications';

// Per-device "dismissed" state for the header notification bell is
// persisted in localStorage under a single JSON-array key. These tests
// pin the storage contract — hydrate, persist, idempotency, and graceful
// recovery from a corrupt value — so a regression in any of those
// behaviours stops users from accidentally re-seeing "read" notifications
// after a tab reload.

const STORAGE_KEY = 'rf:dismissedNotificationUuids';

const readStoredArray = () => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
};

describe('useDismissedNotifications', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('initializes as an empty Set when localStorage is empty', () => {
    const { result } = renderHook(() => useDismissedNotifications());
    expect(result.current.dismissedSet).toBeInstanceOf(Set);
    expect(result.current.dismissedSet.size).toBe(0);
  });

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['u1', 'u2']));
    const { result } = renderHook(() => useDismissedNotifications());
    expect(result.current.dismissedSet.has('u1')).toBe(true);
    expect(result.current.dismissedSet.has('u2')).toBe(true);
    expect(result.current.dismissedSet.size).toBe(2);
  });

  it('recovers gracefully from invalid JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json');
    // Render should not throw despite corrupt storage; the hook should
    // fall back to an empty set so the user isn't stuck.
    const { result } = renderHook(() => useDismissedNotifications());
    expect(result.current.dismissedSet.size).toBe(0);
  });

  it('dismiss adds a uuid and persists it to localStorage', () => {
    const { result } = renderHook(() => useDismissedNotifications());

    act(() => {
      result.current.dismiss('new-uuid');
    });

    expect(result.current.dismissedSet.has('new-uuid')).toBe(true);
    const stored = readStoredArray();
    expect(stored).toContain('new-uuid');
  });

  it('dismissAll adds every uuid and persists them to localStorage', () => {
    const { result } = renderHook(() => useDismissedNotifications());

    act(() => {
      result.current.dismissAll(['a', 'b', 'c']);
    });

    expect(result.current.dismissedSet.has('a')).toBe(true);
    expect(result.current.dismissedSet.has('b')).toBe(true);
    expect(result.current.dismissedSet.has('c')).toBe(true);

    const stored = readStoredArray();
    expect(stored).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(stored).toHaveLength(3);
  });

  it('dismiss is idempotent — no duplicate entries in persisted array', () => {
    const { result } = renderHook(() => useDismissedNotifications());

    act(() => {
      result.current.dismiss('same-uuid');
    });
    act(() => {
      result.current.dismiss('same-uuid');
    });

    expect(result.current.dismissedSet.size).toBe(1);
    const stored = readStoredArray();
    // Critical: the persisted JSON array must not grow on repeated
    // dismissals of the same uuid. The Set in memory dedupes for free
    // but if writeToStorage were called with a stale value or with an
    // array instead of a Set, this would silently double up.
    expect(stored).toEqual(['same-uuid']);
  });
  it('prune drops uuids absent from the current notification list', () => {
    const { result } = renderHook(() => useDismissedNotifications());

    act(() => {
      result.current.dismissAll(['live-1', 'dead-1', 'dead-2']);
    });
    act(() => {
      result.current.prune(['live-1', 'never-dismissed']);
    });

    // Dismissals for live notifications survive; replaced/cleared uuids
    // (FPP_HEALTH churns one per outage) are removed from memory AND storage.
    expect(result.current.dismissedSet.has('live-1')).toBe(true);
    expect(result.current.dismissedSet.has('dead-1')).toBe(false);
    expect(result.current.dismissedSet.has('dead-2')).toBe(false);
    expect(readStoredArray()).toEqual(['live-1']);
  });

  it('prune is a no-op when nothing is stale (no storage write churn)', () => {
    const { result } = renderHook(() => useDismissedNotifications());

    act(() => {
      result.current.dismiss('a');
    });
    act(() => {
      result.current.prune(['a', 'b']);
    });

    expect(result.current.dismissedSet.has('a')).toBe(true);
    expect(readStoredArray()).toEqual(['a']);
  });
});
