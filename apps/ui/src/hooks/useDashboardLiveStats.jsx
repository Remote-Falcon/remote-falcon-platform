import { useEffect } from 'react';

import { useApolloClient } from '@apollo/client';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useSelector } from '../store';
import { DASHBOARD_LIVE_STATS } from '../utils/graphql/controlPanel/queries';

// Single source of truth for the Dashboard's "Right now" data.
//
// Six dashboard components read it (LiveStatsRow, HealthRow, index,
// NowPlayingCard, PsaQuickPlayCard, PreShowChecklist). When this was a plain
// hook with per-instance state, each of them ran its own 5s poller, so one
// open dashboard sent six `dashboardLiveStats` queries every 5s. Each one is
// a find plus a $filter aggregation over the season's stats arrays, which
// made it the largest single source of control-panel DB CPU (Season Capacity
// Plan 2026, Appendix C, R1).
//
// The state now lives in one module-level zustand store. Consumers subscribe
// to it, and the store ref-counts them: exactly one interval runs while at
// least one consumer is mounted, and it stops (and the state resets) when the
// last one unmounts.
//
// The query goes through `client.query` and the awaited result is read
// directly. Do NOT move it back to `useLazyQuery` with onCompleted/onError on
// the execute call: Apollo 3.14 drops execute-level options.
//
// Returns: { data, loading, error, refetch }
//   data    the latest dashboardLiveStats response, or null until first fetch
//   loading true on initial load only (subsequent polls don't toggle this)
//   error   last error, or null
//   refetch fire an immediate fetch ahead of the next poll tick. Useful
//           after mutations that the operator expects to see reflected
//           instantly (Reset Votes, Clear Now Playing) instead of waiting
//           up to POLL_MS for the next poll. Stable identity.
export const POLL_MS = 5000;

// Browser-local day bounds. Must be stable for the whole day: the previous
// `setHours(0, 0, 0)` kept the current milliseconds, so the variables changed
// on every call and Apollo could never dedupe identical requests. The
// dashboard deliberately buckets on the operator's browser wall clock (there
// is no persisted show timezone yet, see PRD-011), so local time is correct.
export const todayBounds = (now = new Date()) => ({
  startDate: new Date(now).setHours(0, 0, 0, 0),
  endDate: new Date(now).setHours(23, 59, 59, 999)
});

const INITIAL_STATE = { data: null, loading: true, error: null };

const useLiveStatsStore = create(() => ({ ...INITIAL_STATE }));

// Poller bookkeeping. Not reactive, so it stays outside the zustand state.
let consumers = 0;
let apolloClient = null;
let timezone = null;
let intervalId = null;
// Bumped whenever the context changes (timezone switch, last consumer gone)
// so a response that lands afterwards is discarded instead of overwriting
// the newer state.
let generation = 0;
let inFlight = null;

const fetchLiveStats = async ({ fromTick = false } = {}) => {
  // Hidden tabs keep their timers (throttled, not stopped), so without this
  // gate a backgrounded dashboard polls the heaviest control-panel query
  // indefinitely: one forgotten tab was observed still polling 70+ minutes
  // later. Mirrors the GET_SHOW poll's gate in dashboard/index.jsx. Manual
  // refetch() after a mutation is unaffected: the user just clicked, so the
  // tab is visible.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (!apolloClient || !timezone) return;
  // A slow DB should not get a second poll stacked on the first. Manual
  // refetches still go out, since they follow a mutation.
  if (fromTick && inFlight) return;

  const requestGeneration = generation;
  const token = {};
  inFlight = token;
  try {
    const { data } = await apolloClient.query({
      query: DASHBOARD_LIVE_STATS,
      context: { headers: { Route: 'Control-Panel' } },
      variables: { ...todayBounds(), timezone },
      fetchPolicy: 'network-only'
    });
    if (requestGeneration !== generation) return;
    useLiveStatsStore.setState({ data: data?.dashboardLiveStats || null, error: null, loading: false });
  } catch (err) {
    if (requestGeneration !== generation) return;
    useLiveStatsStore.setState({ error: err, loading: false });
  } finally {
    if (inFlight === token) inFlight = null;
  }
};

const refetch = () => fetchLiveStats();

const acquire = (client) => {
  apolloClient = client;
  consumers += 1;
  if (consumers === 1) {
    // No fetch here: timezone was reset with the last consumer, so the
    // initial fetch comes from the first consumer's setTimezone below.
    intervalId = setInterval(() => fetchLiveStats({ fromTick: true }), POLL_MS);
  }
  return () => {
    consumers -= 1;
    if (consumers > 0) return;
    clearInterval(intervalId);
    intervalId = null;
    apolloClient = null;
    timezone = null;
    inFlight = null;
    generation += 1;
    useLiveStatsStore.setState({ ...INITIAL_STATE });
  };
};

const setTimezone = (next) => {
  if (next === timezone) return;
  timezone = next;
  generation += 1;
  inFlight = null;
  useLiveStatsStore.setState({ loading: true });
  if (consumers > 0) fetchLiveStats();
};

const useDashboardLiveStats = () => {
  const client = useApolloClient();
  const { show } = useSelector((state) => state.show);
  const showTimezone = show?.timezone || null;

  // Order matters: register the consumer before syncing the timezone, so the
  // first consumer's timezone sync triggers the one initial fetch and the
  // other five see an unchanged timezone and do nothing.
  useEffect(() => acquire(client), [client]);
  useEffect(() => {
    setTimezone(showTimezone);
  }, [showTimezone]);

  const { data, loading, error } = useLiveStatsStore(
    useShallow((state) => ({ data: state.data, loading: state.loading, error: state.error }))
  );

  return { data, loading, error, refetch };
};

export default useDashboardLiveStats;
