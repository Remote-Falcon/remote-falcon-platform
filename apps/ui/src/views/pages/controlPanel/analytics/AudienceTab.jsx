import { useMemo } from 'react';
import * as React from 'react';

import { Box, Button, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { IconCalendarStats, IconFlask } from '@tabler/icons-react';
import _ from 'lodash';
import moment from 'moment-timezone';
import { Link as RouterLink } from 'react-router-dom';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import { useSelector } from '../../../../store';

import ActiveHourDistribution from './ActiveHourDistribution';
import ConcurrentTimeline from './ConcurrentTimeline';
import DwellDistribution from './DwellDistribution';
import NewVsReturning from './NewVsReturning';
import SeasonRegulars from './SeasonRegulars';
import useAnalyticsFilters from './useAnalyticsFilters';
import useDashboardStats from './useDashboardStats';

// V10 — Foot-traffic per night-of-week.
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FootTrafficByDOW = () => {
  const { range, timezone } = useAnalyticsFilters();
  const stats = useDashboardStats(range);

  const buckets = useMemo(() => {
    const empty = DOW_LABELS.map((label) => ({ label, total: 0, nights: 0, avg: 0 }));
    const days = stats.data?.page || [];
    days.forEach((day) => {
      const m = moment.tz(day.date, timezone);
      if (!m.isValid()) return;
      const idx = m.day();
      empty[idx].total += day.unique || 0;
      if ((day.unique || 0) > 0) empty[idx].nights += 1;
    });
    empty.forEach((b) => {
      b.avg = b.nights > 0 ? Math.round(b.total / b.nights) : 0;
    });
    return empty;
  }, [stats.data, timezone]);

  const maxAvg = Math.max(1, ...buckets.map((b) => b.avg));
  const totalNightsWithData = buckets.reduce((acc, b) => acc + b.nights, 0);

  if (stats.loading) {
    return (
      <MainCard title="Foot traffic by night of week">
        <Stack spacing={1}>
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
        </Stack>
      </MainCard>
    );
  }

  if (totalNightsWithData === 0) {
    return (
      <MainCard title="Foot traffic by night of week">
        <EmptyState
          icon={<IconCalendarStats size={32} stroke={1.5} />}
          title="No show nights with data in this range"
          description="Run a few shows and the day-of-week pattern will appear here."
        />
      </MainCard>
    );
  }

  return (
    <MainCard
      title="Foot traffic by night of week"
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          average unique viewers per night-of-week
        </Typography>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1.5,
          alignItems: 'end',
          height: 200
        }}
      >
        {buckets.map((b) => {
          const heightPct = (b.avg / maxAvg) * 100;
          const hasData = b.nights > 0;
          return (
            <Stack key={b.label} alignItems="center" justifyContent="flex-end" sx={{ height: '100%' }}>
              <Typography
                variant="caption"
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  color: hasData ? 'text.primary' : 'text.disabled',
                  fontWeight: 600,
                  mb: 0.5
                }}
              >
                {hasData ? b.avg : '—'}
              </Typography>
              <Box
                sx={{
                  width: '100%',
                  maxWidth: 48,
                  height: hasData ? `${Math.max(2, heightPct)}%` : '2%',
                  borderRadius: '4px 4px 0 0',
                  bgcolor: hasData ? 'primary.main' : (t) =>
                    t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  transition: 'height 250ms ease'
                }}
                title={hasData ? `${b.avg} avg across ${b.nights} ${b.label} night${b.nights === 1 ? '' : 's'}` : 'No data'}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.75 }}>
                {b.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
                {b.nights} night{b.nights === 1 ? '' : 's'}
              </Typography>
            </Stack>
          );
        })}
      </Box>
    </MainCard>
  );
};

// Beta-gated views (V5/V6/V7/V8) require the new viewerSessions data and
// only render when the show owner has opted in via Account Settings →
// Notifications. Non-beta views (V9/V10) always show.
const BetaGate = () => (
  <MainCard
    sx={{
      bgcolor: (t) =>
        t.palette.mode === 'dark' ? 'rgba(199,126,35,0.08)' : 'rgba(199,126,35,0.06)',
      borderLeft: (t) => `3px solid ${t.palette.warning.main}`
    }}
  >
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      alignItems={{ xs: 'flex-start', md: 'center' }}
      justifyContent="space-between"
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ color: 'warning.main', display: 'inline-flex' }}>
          <IconFlask size={24} stroke={1.5} />
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            More views are available in Analytics beta
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Concurrent viewers timeline, dwell-time, new-vs-returning, and season regulars need the
            new per-device viewer-id data. Opt in to see them.
          </Typography>
        </Box>
      </Stack>
      <Button
        variant="outlined"
        color="warning"
        component={RouterLink}
        to="/control-panel/account-settings/notifications"
      >
        Open Notifications
      </Button>
    </Stack>
  </MainCard>
);

const AudienceTab = () => {
  const { show } = useSelector((state) => state.show);
  const betaEnabled = !!show?.preferences?.analyticsBetaOptIn;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <ActiveHourDistribution />
      </Grid>
      <Grid item xs={12}>
        <FootTrafficByDOW />
      </Grid>
      {betaEnabled ? (
        <>
          <Grid item xs={12}>
            <ConcurrentTimeline />
          </Grid>
          <Grid item xs={12} md={6}>
            <DwellDistribution />
          </Grid>
          <Grid item xs={12} md={6}>
            <NewVsReturning />
          </Grid>
          <Grid item xs={12}>
            <SeasonRegulars />
          </Grid>
        </>
      ) : (
        <Grid item xs={12}>
          <BetaGate />
        </Grid>
      )}
    </Grid>
  );
};

export default AudienceTab;
