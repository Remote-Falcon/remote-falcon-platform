import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLazyQuery } from '@apollo/client';

import { useDispatch, useSelector } from '../../../../store';
import { VIEWER_SESSIONS } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

// Fetcher for viewer sessions in a date range. Returns the raw session
// list plus a derived `identityKey` per session — viewerId-first, ipHash
// fallback — so consumers can group by visitor without deciding the
// fallback rule themselves.
const useViewerSessions = (range) => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sessionsQuery] = useLazyQuery(VIEWER_SESSIONS);

  const fetch = useCallback(async () => {
    if (!range?.start || !range?.end || !show?.timezone) return;
    setLoading(true);
    setError(null);
    await sessionsQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: { startDate: range.start, endDate: range.end, timezone: show.timezone },
      fetchPolicy: 'network-only',
      onCompleted: (resp) => {
        setSessions(resp?.viewerSessions?.sessions || []);
        setLoading(false);
      },
      onError: (err) => {
        setError(err);
        setLoading(false);
        showAlert(dispatch, { alert: 'error' });
      }
    });
  }, [sessionsQuery, range?.start, range?.end, show?.timezone, dispatch]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Identity rule: viewerId is preferred (stable across IP rotation).
  // Falls back to ipHash for legacy / cleared-localStorage events.
  const enriched = useMemo(
    () => sessions.map((s) => ({ ...s, identityKey: s.viewerId || s.ipHash || 'unknown' })),
    [sessions]
  );

  return { sessions: enriched, loading, error, refetch: fetch };
};

export default useViewerSessions;
