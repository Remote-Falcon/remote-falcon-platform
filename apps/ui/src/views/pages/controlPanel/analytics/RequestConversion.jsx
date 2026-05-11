import { useCallback, useEffect, useMemo, useState } from 'react';
import * as React from 'react';

import { useLazyQuery } from '@apollo/client';
import { Box, Skeleton, Stack, Tooltip, Typography } from '@mui/material';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import { REQUEST_CONVERSION } from '../../../../utils/graphql/controlPanel/queries';

import useAnalyticsFilters from './useAnalyticsFilters';

// V15 — Request → play conversion funnel.
//
// "Played" we don't actually have an event for (we log accepted requests,
// not completed playback), so the funnel is two-step: attempted → accepted,
// with the rejection breakdown answering "where did the dropped attempts go?"
// Goal of the view: make it obvious whether the queue depth limit is set
// right (lots of QUEUE_FULL → bump it up) and whether geofencing is too
// tight (lots of INVALID_LOCATION → relax it).

const REASON_LABEL = {
  QUEUE_FULL: 'Queue full',
  ALREADY_REQUESTED: 'Already requested',
  INVALID_LOCATION: 'Outside geofence',
  NAUGHTY: 'Blocked IP',
  SEQUENCE_REQUESTED: 'Sequence already in queue',
  UNKNOWN: 'Unknown'
};

const REASON_HINT = {
  QUEUE_FULL: 'Bump the jukebox depth limit (Settings → Show preferences) if these are frequent.',
  ALREADY_REQUESTED: 'A viewer hit the limit on their own requests for the night. Working as designed.',
  INVALID_LOCATION: 'Geofence rejected the viewer. Loosen the radius if you expect viewers from further away.',
  NAUGHTY: 'A blocked IP tried to request. Working as designed — no action needed.',
  SEQUENCE_REQUESTED: 'The sequence is already playing now / next, or has hit its per-night request cap.'
};

const FunnelStep = ({ label, value, widthPct, accent }) => (
  <Box>
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString()}
      </Typography>
    </Stack>
    <Box
      sx={{
        height: 14,
        borderRadius: 1,
        bgcolor: 'action.hover',
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          height: '100%',
          width: `${widthPct}%`,
          bgcolor: accent,
          transition: 'width 400ms ease'
        }}
      />
    </Box>
  </Box>
);

const RejectionRow = ({ reason, count, total }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Tooltip title={REASON_HINT[reason] || ''} placement="left" arrow>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 0.75, cursor: 'help' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, minWidth: 160 }}>
          {REASON_LABEL[reason] || reason}
        </Typography>
        <Box sx={{ flex: 1, height: 6, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: 'error.main', opacity: 0.8 }} />
        </Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {count.toLocaleString()} ({pct}%)
        </Typography>
      </Stack>
    </Tooltip>
  );
};

const RequestConversion = () => {
  const { range, timezone } = useAnalyticsFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [conversionQuery] = useLazyQuery(REQUEST_CONVERSION);

  const fetch = useCallback(async () => {
    if (!range?.start || !range?.end || !timezone) return;
    setLoading(true);
    await conversionQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: { startDate: range.start, endDate: range.end, timezone },
      fetchPolicy: 'network-only',
      onCompleted: (resp) => {
        setData(resp?.requestConversion || null);
        setLoading(false);
      },
      onError: () => setLoading(false)
    });
  }, [conversionQuery, range?.start, range?.end, timezone]);

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end, timezone]);

  const ratePct = useMemo(
    () => (data?.conversionRate != null ? Math.round(data.conversionRate * 100) : null),
    [data]
  );

  const acceptedWidth = data?.attempted > 0 ? (data.accepted / data.attempted) * 100 : 0;

  return (
    <MainCard
      title={
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Request → queue conversion
          </Typography>
          {ratePct !== null && (
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: 28,
                color: ratePct >= 80 ? 'success.main' : ratePct >= 50 ? 'warning.main' : 'error.main',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {ratePct}%
            </Typography>
          )}
        </Stack>
      }
      contentSX={{ p: 2.5 }}
    >
      {loading ? (
        <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1 }} />
      ) : !data || data.attempted === 0 ? (
        <EmptyState
          title="No request attempts in this range"
          body="Once viewers start requesting sequences, you'll see how many made it into the queue versus how many got rejected, and why."
        />
      ) : (
        <Stack spacing={2.5}>
          <FunnelStep label="Attempted" value={data.attempted} widthPct={100} accent="primary.main" />
          <FunnelStep label="Made it to queue" value={data.accepted} widthPct={acceptedWidth} accent="success.main" />

          {data.rejected > 0 && (
            <Box sx={{ pt: 1 }}>
              <Typography
                variant="overline"
                sx={{ color: 'text.secondary', letterSpacing: '0.06em', display: 'block', mb: 0.75 }}
              >
                Why requests were rejected ({data.rejected.toLocaleString()} total)
              </Typography>
              <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
                {(data.rejectionsByReason || []).map((b) => (
                  <RejectionRow key={b.reason} reason={b.reason} count={b.count} total={data.rejected} />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
    </MainCard>
  );
};

export default RequestConversion;
