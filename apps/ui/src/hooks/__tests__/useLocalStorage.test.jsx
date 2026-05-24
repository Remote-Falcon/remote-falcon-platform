import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import useLocalStorage from '../useLocalStorage';

// Pins the contract for the generic useLocalStorage hook (separate from
// the bespoke useDismissedNotifications). Covers hydrate-from-storage,
// JSON round-trip, functional setter, and the cross-tab storage event.

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns the default value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('k1', { count: 0 }));
    expect(result.current[0]).toEqual({ count: 0 });
  });

  it('hydrates the previously stored JSON value on mount', () => {
    window.localStorage.setItem('k2', JSON.stringify({ count: 7 }));
    const { result } = renderHook(() => useLocalStorage('k2', { count: 0 }));
    expect(result.current[0]).toEqual({ count: 7 });
  });

  it('setter writes through to localStorage as JSON', () => {
    const { result } = renderHook(() => useLocalStorage('k3', null));
    act(() => {
      result.current[1]({ flag: true });
    });
    expect(result.current[0]).toEqual({ flag: true });
    expect(window.localStorage.getItem('k3')).toBe(JSON.stringify({ flag: true }));
  });

  it('setter accepts a functional updater (prev => next)', () => {
    const { result } = renderHook(() => useLocalStorage('k4', 1));
    act(() => {
      result.current[1]((prev) => prev + 10);
    });
    expect(result.current[0]).toBe(11);
    expect(window.localStorage.getItem('k4')).toBe('11');
  });

  // The jsdom-managed window.localStorage is replaced with a plain
  // shim in test setup (real jsdom localStorage SecurityErrors on
  // opaque origins), so the `StorageEvent` constructor refuses our shim
  // as a `Storage`. We dispatch a plain Event with the relevant
  // properties stamped on instead — the hook only reads .storageArea,
  // .key and .newValue, so this is faithful to the runtime contract.
  const dispatchStorage = ({ key, newValue }) => {
    const evt = new Event('storage');
    Object.defineProperty(evt, 'storageArea', { value: window.localStorage });
    Object.defineProperty(evt, 'key', { value: key });
    Object.defineProperty(evt, 'newValue', { value: newValue });
    window.dispatchEvent(evt);
  };

  it('reacts to a cross-tab storage event for the same key', () => {
    const { result } = renderHook(() => useLocalStorage('k5', 'initial'));
    act(() => {
      dispatchStorage({ key: 'k5', newValue: JSON.stringify('updated') });
    });
    expect(result.current[0]).toBe('updated');
  });

  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useLocalStorage('mine', 'orig'));
    act(() => {
      dispatchStorage({ key: 'other', newValue: JSON.stringify('nope') });
    });
    expect(result.current[0]).toBe('orig');
  });
});
