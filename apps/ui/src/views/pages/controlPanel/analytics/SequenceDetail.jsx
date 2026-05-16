import { useMemo } from 'react';

import { Box, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { IconArrowLeft, IconCalendar, IconMusic, IconTrendingUp } from '@tabler/icons-react';
import moment from 'moment-timezone';
import { Link as RouterLink, useParams } from 'react-router-dom';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import PageHead from '../../../../ui-component/PageHead';
import StatTile from '../../../../ui-component/StatTile';
import { useSelector } from '../../../../store';
import { ViewerControlMode } from '../../../../utils/enum';
import ApexLineChart from '../dashboard/ApexLineChart';

import DateRangePicker from './DateRangePicker';
import useAnalyticsFilters from './useAnalyticsFilters';
import useDashboardStats from './useDashboardStats';

// V13 — Sequence detail entity page.
//
// Bookmarkable URL `/control-panel/analytics/sequences/:sequenceName` —
// per the PRD, owners share these in Facebook groups so the URL itself
// is the win. Renders:
//   • Header: image (if present) + name + back link
//   • 3 hero stats: total in range / peak day / active days
//   • Per-day time-series for this sequence
//
// Hour-of-night-for-this-sequence and queue-position distribution are
// nice follow-ups but require a sequence-aware backend aggregator —
// deferred to P1 alongside the session work.

const SequenceDetail = () => {
  const { sequenceName: encodedName } = useParams();
  const sequenceName = decodeURIComponent(encodedName);
  const { range, timezone, presetLabel } = useAnalyticsFilters();
  const { show } = useSelector((state) => state.show);
  const stats = useDashboardStats(range);

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;
  const sourceField = isJukebox ? 'jukeboxByDate' : 'votingByDate';
  const verb = isJukebox ? 'requested' : 'voted';

  // Find this sequence in the show.sequences[] for image + display name + category
  const sequence = useMemo(
    () => (show?.sequences || []).find((s) => s.name === sequenceName),
    [show?.sequences, sequenceName]
  );

  // Per-day series for THIS sequence — extract from per-day breakdown
  const dailySeries = useMemo(() => {
    const days = stats.data?.[sourceField] || [];
    return days
      .map((day) => {
        const seqEntry = (day.sequences || []).find((s) => s.name === sequenceName);
        return { date: day.date, value: seqEntry?.total || 0 };
      })
      .filter((d) => d.date != null);
  }, [stats.data, sourceField, sequenceName]);

  const totalsInRange = useMemo(() => dailySeries.reduce((acc, d) => acc + d.value, 0), [dailySeries]);
  const peakDay = useMemo(
    () => dailySeries.reduce((best, cur) => (cur.value > (best?.value || 0) ? cur : best), null),
    [dailySeries]
  );
  const activeDays = useMemo(() => dailySeries.filter((d) => d.value > 0).length, [dailySeries]);

  const chartData = useMemo(
    () => ({
      name: isJukebox ? 'Requests' : 'Votes',
      yValue: isJukebox ? 'Total Requests: ' : 'Total Votes: ',
      data: dailySeries.map((d) => [d.date, d.value])
    }),
    [dailySeries, isJukebox]
  );

  const displayName = sequence?.displayName || sequenceName;

  if (stats.loading) {
    return (
      <Box>
        <PageHead
          title={<Skeleton width={240} />}
          description={<Skeleton width={120} />}
        />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            color: 'text.secondary',
            fontSize: 13,
            cursor: 'pointer',
            width: 'fit-content',
            '&:hover': { color: 'text.primary' }
          }}
          component={RouterLink}
          to="/control-panel/analytics/sequences-jukebox"
          style={{ textDecoration: 'none' }}
        >
          <IconArrowLeft size={16} stroke={1.75} />
          <Typography variant="body2" sx={{ color: 'inherit' }}>
            Back to sequences
          </Typography>
        </Stack>
        <DateRangePicker />
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        {sequence?.imageUrl ? (
          <Box
            component="img"
            src={sequence.imageUrl}
            alt=""
            sx={{
              width: 64,
              height: 64,
              borderRadius: 1,
              objectFit: 'cover',
              flexShrink: 0
            }}
          />
        ) : (
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              bgcolor: (t) =>
                t.palette.mode === 'dark' ? 'rgba(255,167,38,0.16)' : 'rgba(255,152,0,0.14)',
              color: 'warning.main',
              flexShrink: 0
            }}
          >
            <IconMusic size={32} stroke={1.5} />
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', display: 'block' }}>
            Sequence · {presetLabel}
          </Typography>
          <Typography variant="h1" sx={{ fontWeight: 600, fontSize: 28, lineHeight: 1.2 }}>
            {displayName}
          </Typography>
          {sequence && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {sequence.artist || 'Unknown artist'}
              {sequence.category && ` · ${sequence.category}`}
              {sequence.active === false && ' · Inactive'}
            </Typography>
          )}
        </Box>
      </Stack>

      {totalsInRange === 0 ? (
        <MainCard>
          <EmptyState
            icon={<IconMusic size={32} stroke={1.5} />}
            title={`No ${verb} activity for "${displayName}" in this range`}
            description="Try a wider date range or come back after a few show nights."
          />
        </MainCard>
      ) : (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <StatTile
                label={isJukebox ? 'Total requests' : 'Total votes'}
                value={totalsInRange}
                sub={`across ${dailySeries.length} ${dailySeries.length === 1 ? 'day' : 'days'} in range`}
                icon={<IconTrendingUp size={28} stroke={1.5} />}
                accent="primary.main"
                subtle
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatTile
                label="Peak day"
                value={peakDay && peakDay.value > 0 ? peakDay.value : '—'}
                sub={
                  peakDay && peakDay.value > 0
                    ? moment.tz(peakDay.date, timezone).format('ddd MMM D')
                    : 'no peak yet'
                }
                icon={<IconCalendar size={28} stroke={1.5} />}
                accent="warning.main"
                subtle
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatTile
                label="Active days"
                value={activeDays}
                sub={`of ${dailySeries.length} in range`}
                icon={<IconCalendar size={28} stroke={1.5} />}
                accent="success.main"
                subtle
              />
            </Grid>
          </Grid>

          <MainCard
            title={isJukebox ? 'Requests over time' : 'Votes over time'}
            secondary={
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {dailySeries.length} {dailySeries.length === 1 ? 'day' : 'days'} in range
              </Typography>
            }
          >
            <ApexLineChart chartData={chartData} timezone={timezone} />
          </MainCard>
        </Stack>
      )}
    </Box>
  );
};

export default SequenceDetail;
