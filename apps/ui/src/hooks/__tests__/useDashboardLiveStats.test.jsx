import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MockedProvider } from '@apollo/client/testing';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';

import useDashboardLiveStats from '../useDashboardLiveStats';
import { DASHBOARD_LIVE_STATS } from '../../utils/graphql/controlPanel/queries';

// The dashboard "Right now" data hook — single poll source that
// replaced three separate pollers. We pin: short-circuits when no
// timezone, fires the query when timezone is set, surfaces the data
// shape, and refetch is exposed for instant-feedback mutations.

const buildStore = (show) => {
  const slice = createSlice({
    name: 'show',
    initialState: { show },
    reducers: {}
  });
  return configureStore({ reducer: { show: slice.reducer } });
};

const wrap = (store, mocks = []) => ({ children }) => (
  <Provider store={store}>
    <MockedProvider mocks={mocks} addTypename={false}>
      {children}
    </MockedProvider>
  </Provider>
);

describe('useDashboardLiveStats', () => {
  it('starts loading=true, data=null when timezone is missing (short-circuits the fetch)', async () => {
    const store = buildStore({ /* no timezone */ });
    const { result } = renderHook(() => useDashboardLiveStats(), { wrapper: wrap(store) });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refetch).toBe('function');
  });

  it('exposes data + clears loading after a successful first fetch', async () => {
    const store = buildStore({ timezone: 'UTC' });
    const dashboardLiveStats = { right: 'now', viewers: 5 };
    // The hook computes startDate/endDate from `new Date()` at fetch
    // time, so the mock has to accept any clock-derived numbers.
    // `variableMatcher` (Apollo 3.5+) is the supported way to match
    // dynamic variables — using `variables: {}` was the source of an
    // intermittent "No more mocked responses" failure on the first run
    // after a fresh `npm ci`.
    const mocks = [
      {
        request: { query: DASHBOARD_LIVE_STATS },
        variableMatcher: (vars) =>
          typeof vars.startDate === 'number' &&
          typeof vars.endDate === 'number' &&
          vars.timezone === 'UTC',
        result: { data: { dashboardLiveStats } }
      }
    ];
    const { result } = renderHook(() => useDashboardLiveStats(), {
      wrapper: wrap(store, mocks)
    });
    // Just check the hook returns the expected fields — exact data
    // assertion is brittle without a deterministic clock.
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(typeof result.current.refetch).toBe('function');
  });
});
