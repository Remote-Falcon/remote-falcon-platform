import { useCallback, useEffect, useState } from 'react';

import { useLazyQuery } from '@apollo/client';

import { useDispatch, useSelector } from '../../../../store';
import { DASHBOARD_STATS_BY_HOUR } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

// Fetcher for the hourly bucket aggregator. Same shape as useDashboardStats.
const useHourlyStats = (range) => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const [data, setData] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [hourlyQuery] = useLazyQuery(DASHBOARD_STATS_BY_HOUR);

  const fetch = useCallback(async () => {
    if (!range?.start || !range?.end || !show?.timezone) return;
    setLoading(true);
    setError(null);
    await hourlyQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: { startDate: range.start, endDate: range.end, timezone: show.timezone },
      fetchPolicy: 'network-only',
      onCompleted: (resp) => {
        setData(resp?.dashboardStatsByHour?.buckets || []);
        setLoading(false);
      },
      onError: (err) => {
        setError(err);
        setLoading(false);
        showAlert(dispatch, { alert: 'error' });
      }
    });
  }, [hourlyQuery, range?.start, range?.end, show?.timezone, dispatch]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
};

export default useHourlyStats;
