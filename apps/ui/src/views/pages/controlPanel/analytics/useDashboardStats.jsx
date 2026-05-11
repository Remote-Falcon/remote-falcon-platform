import { useCallback, useEffect, useState } from 'react';

import { useLazyQuery } from '@apollo/client';

import { useDispatch, useSelector } from '../../../../store';
import { DASHBOARD_STATS } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

// Shared fetcher for the existing DASHBOARD_STATS query, keyed on a
// date range. Multiple analytics views can call this — the hook holds
// independent state per call site, but that's acceptable; the query
// payload is small and Apollo's HTTP cache handles dedup.
//
// Returns { data, loading, error, refetch }.
const useDashboardStats = (range) => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const [data, setData] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [dashboardStatsQuery] = useLazyQuery(DASHBOARD_STATS);

  const fetch = useCallback(async () => {
    if (!range?.start || !range?.end || !show?.timezone) return;
    setLoading(true);
    setError(null);
    await dashboardStatsQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: { startDate: range.start, endDate: range.end, timezone: show.timezone },
      fetchPolicy: 'network-only',
      onCompleted: (resp) => {
        setData(resp?.dashboardStats);
        setLoading(false);
      },
      onError: (err) => {
        setError(err);
        setLoading(false);
        showAlert(dispatch, { alert: 'error' });
      }
    });
  }, [dashboardStatsQuery, range?.start, range?.end, show?.timezone, dispatch]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
};

export default useDashboardStats;
