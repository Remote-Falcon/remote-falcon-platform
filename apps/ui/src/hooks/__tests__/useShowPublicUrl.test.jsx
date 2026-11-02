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

  describe('subdomain-mode self-host', () => {
    const originalLocation = window.location;

    const setLocation = (host, protocol = 'https:') => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, host, protocol }
      });
    };

    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });

    const render = () => {
      const store = buildStore({ showSubdomain: 'matt' });
      return renderHook(() => useShowPublicUrl(), { wrapper: wrap(store) }).result.current;
    };

    it('uses the self-hosted base domain when a control panel subdomain is set', () => {
      import.meta.env.VITE_CONTROL_PANEL_SUBDOMAIN = 'control';
      import.meta.env.VITE_HOSTNAME_PARTS = '3';
      setLocation('control.rf.example.com');
      expect(render()).toBe('https://matt.rf.example.com');
    });

    it('uses the self-hosted base domain on the default controlpanel label', () => {
      import.meta.env.VITE_SELF_HOSTED = 'true';
      import.meta.env.VITE_HOSTNAME_PARTS = '2';
      setLocation('controlpanel.example.com');
      expect(render()).toBe('https://matt.example.com');
    });

    it('keeps a non-default port', () => {
      import.meta.env.VITE_SELF_HOSTED = 'true';
      import.meta.env.VITE_HOSTNAME_PARTS = '2';
      setLocation('controlpanel.example.com:3000', 'http:');
      expect(render()).toBe('http://matt.example.com:3000');
    });

    it('links to the bare base domain when SWAP_CP serves the single show at the root', () => {
      import.meta.env.VITE_SELF_HOSTED = 'true';
      import.meta.env.VITE_SWAP_CP = 'true';
      import.meta.env.VITE_HOSTNAME_PARTS = '2';
      setLocation('controlpanel.example.com');
      expect(render()).toBe('https://example.com');
    });

    it('still links to remotefalcon.com when the build is not a self-host', () => {
      import.meta.env.VITE_HOSTNAME_PARTS = '2';
      setLocation('lights.example.com');
      expect(render()).toBe('https://matt.remotefalcon.com');
    });
  });
});
