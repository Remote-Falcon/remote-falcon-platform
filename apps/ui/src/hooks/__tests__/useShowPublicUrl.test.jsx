import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';

import useShowPublicUrl from '../useShowPublicUrl';

// Verifies the public-viewer URL the dashboard renders for every show.
// Wrong host = users click "Open viewer page" and land on a 404, so this
// is worth pinning across the three environments.

const buildStore = (show) => {
  const slice = createSlice({
    name: 'show',
    initialState: { show },
    reducers: {}
  });
  return configureStore({ reducer: { show: slice.reducer } });
};

const wrap = (store) => ({ children }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useShowPublicUrl', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    import.meta.env.VITE_HOST_ENV = 'prod';
    import.meta.env.VITE_SWAP_CP = 'false';
  });

  afterEach(() => {
    for (const k of Object.keys(import.meta.env)) {
      delete import.meta.env[k];
    }
    Object.assign(import.meta.env, originalEnv);
  });

  it('returns null when there is no show subdomain', () => {
    const store = buildStore(null);
    const { result } = renderHook(() => useShowPublicUrl(), { wrapper: wrap(store) });
    expect(result.current).toBeNull();
  });

  it('builds an https URL on prod', () => {
    import.meta.env.VITE_HOST_ENV = 'prod';
    const store = buildStore({ showSubdomain: 'matt' });
    const { result } = renderHook(() => useShowPublicUrl(), { wrapper: wrap(store) });
    expect(result.current).toBe('https://matt.remotefalcon.com');
  });

  it('uses the .dev domain on the test environment', () => {
    import.meta.env.VITE_HOST_ENV = 'test';
    const store = buildStore({ showSubdomain: 'matt' });
    const { result } = renderHook(() => useShowPublicUrl(), { wrapper: wrap(store) });
    expect(result.current).toBe('https://matt.remotefalcon.dev');
  });

  it('uses an http subdomain.localhost URL on local', () => {
    import.meta.env.VITE_HOST_ENV = 'local';
    const store = buildStore({ showSubdomain: 'matt' });
    const { result } = renderHook(() => useShowPublicUrl(), { wrapper: wrap(store) });
    expect(result.current).toBe('http://matt.localhost:5173');
  });

  it('collapses to localhost root when SWAP_CP is on (single-port local setup)', () => {
    import.meta.env.VITE_HOST_ENV = 'local';
    import.meta.env.VITE_SWAP_CP = 'true';
    const store = buildStore({ showSubdomain: 'matt' });
    const { result } = renderHook(() => useShowPublicUrl(), { wrapper: wrap(store) });
    expect(result.current).toBe('http://localhost:5173');
  });
});
