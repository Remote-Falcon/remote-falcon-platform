import { useCallback, useEffect, useState } from 'react';

import { useLazyQuery } from '@apollo/client';

import { useSelector } from '../store';
import useInterval from './useInterval';
import { DASHBOARD_LIVE_STATS } from '../utils/graphql/controlPanel/queries';

// Single source of truth for the Dashboard's "Right now" data. Replaces
// what used to be three independent pollers (LiveStatsRow, NowPlayingCard,
// HealthRow) all hitting `dashboardLiveStats` with their own state and
// their own intervals — that was ~36 redundant requests/minute on the
// dashboard.
//
// Polls every 5s with `fetchPolicy: 'network-only'` so stale Apollo
// cache entries never leak between renders. Callers receive the full
// response and pick the fields they care about.
//
// Returns: { data, loading, error, refetch }
//   data    — the latest dashboardLiveStats response, or null until first fetch
//   loading — true on initial load only (subsequent polls don't toggle this)
//   error   — last error, or null
//   refetch — fire an immediate fetch ahead of the next poll tick. Useful
//             after mutations that the operator expects to see reflected
//             instantly (Reset Votes, Clear Now Playing) instead of waiting
//             up to POLL_MS seconds for the next poll.
const POLL_MS = 5000;

const useDashboardLiveStats = () => {
  const { show } = useSelector((state) => state.show);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [liveStatsQuery] = useLazyQuery(DASHBOARD_LIVE_STATS);

  const fetch = useCallback(async () => {
    if (!show?.timezone) return;
    await liveStatsQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: {
        startDate: new Date().setHours(0, 0, 0),
        endDate: new Date().setHours(23, 59, 59),
        timezone: show.timezone
      },
      fetchPolicy: 'network-only',
      onCompleted: (resp) => {
        setData(resp?.dashboardLiveStats || null);
        setError(null);
        setLoading(false);
      },
      onError: (err) => {
        setError(err);
        setLoading(false);
      }
    });
  }, [liveStatsQuery, show?.timezone]);

  useEffect(() => {
    setLoading(true);
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.timezone]);

  useInterval(fetch, POLL_MS);

  return { data, loading, error, refetch: fetch };
};

export default useDashboardLiveStats;
