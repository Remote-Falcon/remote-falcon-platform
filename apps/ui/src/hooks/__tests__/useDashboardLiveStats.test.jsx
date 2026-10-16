import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';

import useDashboardLiveStats, { POLL_MS, todayBounds } from '../useDashboardLiveStats';

// The dashboard "Right now" data hook. It is mounted by six dashboard
// components at once (LiveStatsRow, HealthRow, index, NowPlayingCard,
// PsaQuickPlayCard, PreShowChecklist). Each poll is a find plus a $filter
// aggregation over the season's stats arrays, so the contract pinned here is
// ONE poller per page, not one per consumer: the 6 consumers share a single
// 5s interval that only runs while at least one of them is mounted.
//
// Uses a real ApolloClient over a counting link (not MockedProvider) so every
// operation that would reach the network is counted exactly.

const LIVE_STATS = {
  __typename: 'DashboardLiveStats',
  playingNow: 'Song A',
  playingNext: 'Song B',
  currentRequests: 1,
  totalRequests: 2,
  currentVotes: 3,
  totalVotes: 4,
  currentViewers: 5,
  medianDwellSecondsTonight: 60,
  lastHeartbeatMs: 1700000000000,
  heartbeatGaps: [],
  versionChanges: []
};

const buildStore = (show) => {
  const slice = createSlice({ name: 'show', initialState: { show }, reducers: {} });
  return configureStore({ reducer: { show: slice.reducer } });
};

const buildClient = ({ fail = false } = {}) => {
  const calls = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        calls.push(operation.variables);
        if (fail) {
          observer.error(new Error('boom'));
          return;
        }
        observer.next({ data: { dashboardLiveStats: LIVE_STATS } });
        observer.complete();
      })
  );
  return { client: new ApolloClient({ link, cache: new InMemoryCache() }), calls };
};

const Wrapper =
  (store, client) =>
  ({ children }) => (
    <Provider store={store}>
      <ApolloProvider client={client}>{children}</ApolloProvider>
    </Provider>
  );

const seen = [];
const Consumer = ({ id }) => {
  seen[id] = useDashboardLiveStats();
  return null;
};
const SixConsumers = ({ count = 6 }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <Consumer key={i} id={i} />
    ))}
  </>
);

// Lets pending promise chains (link -> client.query -> store) settle without
// advancing the fake clock.
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const tick = () => act(() => vi.advanceTimersByTimeAsync(POLL_MS));

describe('useDashboardLiveStats', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 11, 24, 20, 15, 30, 123));
    seen.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts loading=true, data=null when timezone is missing (short-circuits the fetch)', async () => {
    const { client, calls } = buildClient();
    const { result, unmount } = renderHook(() => useDashboardLiveStats(), {
      wrapper: Wrapper(buildStore({}), client)
    });
    await flush();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refetch).toBe('function');
    await tick();
    expect(calls).toHaveLength(0);
    unmount();
  });

  it('exposes data and clears loading after a successful first fetch', async () => {
    const { client } = buildClient();
    const { result, unmount } = renderHook(() => useDashboardLiveStats(), {
      wrapper: Wrapper(buildStore({ timezone: 'UTC' }), client)
    });
    await flush();
    expect(result.current.data).toMatchObject({ playingNow: 'Song A', totalVotes: 4 });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('surfaces a failed fetch on error and clears loading', async () => {
    const { client } = buildClient({ fail: true });
    const { result, unmount } = renderHook(() => useDashboardLiveStats(), {
      wrapper: Wrapper(buildStore({ timezone: 'UTC' }), client)
    });
    await flush();
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    unmount();
  });

  it('six mounted consumers share ONE query per 5s tick', async () => {
    const { client, calls } = buildClient();
    const { unmount } = render(<SixConsumers />, { wrapper: Wrapper(buildStore({ timezone: 'UTC' }), client) });
    await flush();
    expect(calls).toHaveLength(1); // the initial fetch, not six

    await tick();
    expect(calls).toHaveLength(2);
    await tick();
    expect(calls).toHaveLength(3);

    // Every consumer sees the same shared state.
    expect(seen).toHaveLength(6);
    seen.forEach((s) => {
      expect(s.data).toMatchObject({ playingNow: 'Song A' });
      expect(s.loading).toBe(false);
    });
    unmount();
  });

  it('keeps polling while any consumer is mounted and stops when all unmount', async () => {
    const { client, calls } = buildClient();
    const wrapper = Wrapper(buildStore({ timezone: 'UTC' }), client);
    const { rerender, unmount } = render(<SixConsumers count={6} />, { wrapper });
    await flush();
    expect(calls).toHaveLength(1);

    rerender(<SixConsumers count={1} />);
    await tick();
    expect(calls).toHaveLength(2); // still one poller with one consumer left

    unmount();
    await tick();
    await tick();
    expect(calls).toHaveLength(2); // no consumers, no polling
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a fresh mount after a full unmount starts from a clean loading state', async () => {
    const { client, calls } = buildClient();
    const wrapper = Wrapper(buildStore({ timezone: 'UTC' }), client);
    const first = renderHook(() => useDashboardLiveStats(), { wrapper });
    await flush();
    expect(first.result.current.data).not.toBeNull();
    first.unmount();

    const second = renderHook(() => useDashboardLiveStats(), { wrapper });
    expect(second.result.current.data).toBeNull();
    expect(second.result.current.loading).toBe(true);
    await flush();
    expect(calls).toHaveLength(2);
    expect(second.result.current.data).not.toBeNull();
    second.unmount();
  });

  it('refetch fires one immediate query ahead of the next tick', async () => {
    const { client, calls } = buildClient();
    const { unmount } = render(<SixConsumers />, { wrapper: Wrapper(buildStore({ timezone: 'UTC' }), client) });
    await flush();
    expect(calls).toHaveLength(1);
    await act(() => seen[0].refetch());
    expect(calls).toHaveLength(2);
    unmount();
  });

  it('does not fetch while the tab is hidden, and resumes when visible', async () => {
    // Hidden tabs keep their timers (throttled, not stopped). Without the
    // visibilityState gate a backgrounded dashboard polls the heaviest
    // control-panel query indefinitely (one forgotten tab was observed still
    // polling 70+ minutes later).
    const { client, calls } = buildClient();
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const { unmount } = render(<SixConsumers />, {
        wrapper: Wrapper(buildStore({ timezone: 'UTC' }), client)
      });
      await flush();
      await tick();
      await tick();
      expect(calls).toHaveLength(0);

      spy.mockReturnValue('visible');
      await tick();
      expect(calls).toHaveLength(1);
      unmount();
    } finally {
      spy.mockRestore();
    }
  });

  it('sends identical date variables on every poll within a day', async () => {
    const { client, calls } = buildClient();
    const { unmount } = renderHook(() => useDashboardLiveStats(), {
      wrapper: Wrapper(buildStore({ timezone: 'UTC' }), client)
    });
    await flush();
    vi.setSystemTime(new Date(2026, 11, 24, 20, 15, 35, 987));
    await tick();
    vi.setSystemTime(new Date(2026, 11, 24, 23, 59, 54, 500)); // fires at 23:59:59.500
    await tick();
    expect(calls).toHaveLength(3);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]).toEqual(calls[0]);
    expect(calls[0]).toEqual({
      startDate: new Date(2026, 11, 24, 0, 0, 0, 0).getTime(),
      endDate: new Date(2026, 11, 24, 23, 59, 59, 999).getTime(),
      timezone: 'UTC'
    });
    unmount();
  });
});

describe('todayBounds', () => {
  it('is stable for any two instants on the same browser-local day', () => {
    const a = todayBounds(new Date(2026, 9, 16, 0, 0, 0, 0));
    const b = todayBounds(new Date(2026, 9, 16, 13, 7, 42, 512));
    const c = todayBounds(new Date(2026, 9, 16, 23, 59, 59, 999));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('spans local midnight to the last millisecond of the local day', () => {
    const { startDate, endDate } = todayBounds(new Date(2026, 9, 16, 13, 7, 42, 512));
    expect(startDate).toBe(new Date(2026, 9, 16, 0, 0, 0, 0).getTime());
    expect(endDate).toBe(new Date(2026, 9, 16, 23, 59, 59, 999).getTime());
  });

  it('rolls over at local midnight', () => {
    const today = todayBounds(new Date(2026, 9, 16, 23, 59, 59, 999));
    const tomorrow = todayBounds(new Date(2026, 9, 17, 0, 0, 0, 0));
    expect(tomorrow.startDate).toBe(today.endDate + 1);
  });
});
