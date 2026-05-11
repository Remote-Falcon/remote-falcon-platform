import { useMemo } from 'react';
import * as React from 'react';

import { Box, Grid, Skeleton, Stack, Typography } from '@mui/material';
import _ from 'lodash';
import moment from 'moment-timezone';

import MainCard from '../../../../ui-component/cards/MainCard';
import { useSelector } from '../../../../store';
import { ViewerControlMode } from '../../../../utils/enum';

import CalendarHeatmap from './CalendarHeatmap';
import HourlyHeatmap from './HourlyHeatmap';
import useAnalyticsFilters from './useAnalyticsFilters';
import useDashboardStats from './useDashboardStats';

// Helpers --------------------------------------------------------------

const sumDailyTotals = (days) => (days || []).reduce((acc, d) => acc + (d.total || 0), 0);
const sumDailyUniques = (days) => (days || []).reduce((acc, d) => acc + (d.unique || 0), 0);
const sumSeqTotals = (block) => (block?.sequences || []).reduce((acc, s) => acc + (s.total || 0), 0);

const formatPctDelta = (current, prior) => {
  if (!prior || prior === 0) {
    return current > 0 ? { sign: '+', text: 'new', color: 'success.main' } : null;
  }
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return { sign: '', text: 'no change', color: 'text.secondary' };
  return {
    sign: pct > 0 ? '+' : '',
    text: `${pct > 0 ? '+' : ''}${pct}% vs prior`,
    color: pct > 0 ? 'success.main' : 'error.main'
  };
};

// Sparkline — tiny CSS/SVG chart ---------------------------------------

const Sparkline = ({ values, color = 'currentColor', height = 28 }) => {
  const max = Math.max(1, ...values);
  const width = 80;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - (v / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      aria-hidden
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// V2 — 4-stat hero row -------------------------------------------------

const StatTile = ({ label, value, sparkValues, delta, accent }) => (
  <MainCard
    sx={{
      height: '100%',
      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
    }}
    contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }}
  >
    <Stack spacing={1}>
      <Typography
        variant="overline"
        sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.4 }}
      >
        {label}
      </Typography>
      <Stack direction="row" alignItems="flex-end" spacing={1.5}>
        <Typography variant="h2" sx={{ fontWeight: 700, fontSize: 28, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {sparkValues && sparkValues.length > 1 && (
          <Box sx={{ color: accent || 'primary.main', mb: 0.25 }}>
            <Sparkline values={sparkValues} />
          </Box>
        )}
      </Stack>
      {delta && (
        <Typography variant="caption" sx={{ color: delta.color, fontSize: 12 }}>
          {delta.text}
        </Typography>
      )}
    </Stack>
  </MainCard>
);

const HeroStatsRow = () => {
  const { range, priorRange, compareToPrior } = useAnalyticsFilters();
  const { show } = useSelector((state) => state.show);
  const current = useDashboardStats(range);
  const prior = useDashboardStats(compareToPrior ? priorRange : null);

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;
  const interactionField = isJukebox ? 'jukeboxBySequence' : 'votingBySequence';

  const stats = useMemo(() => {
    const d = current.data;
    if (!d) return null;
    return {
      uniqueViewers: sumDailyUniques(d.page),
      totalViewers: sumDailyTotals(d.page),
      interactions: sumSeqTotals(d[interactionField]),
      activeNights: (d.page || []).filter((day) => (day.unique || 0) > 0).length,
      sparkUnique: (d.page || []).map((day) => day.unique || 0)
    };
  }, [current.data, interactionField]);

  const priorStats = useMemo(() => {
    if (!prior.data) return null;
    return {
      uniqueViewers: sumDailyUniques(prior.data.page),
      totalViewers: sumDailyTotals(prior.data.page),
      interactions: sumSeqTotals(prior.data[interactionField]),
      activeNights: (prior.data.page || []).filter((day) => (day.unique || 0) > 0).length
    };
  }, [prior.data, interactionField]);

  if (current.loading) {
    return (
      <Grid container spacing={2}>
        {[0, 1, 2, 3].map((i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!stats) return null;

  const interactionLabel = isJukebox ? 'Requests' : 'Votes';

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label="Unique viewers"
          value={stats.uniqueViewers}
          sparkValues={stats.sparkUnique}
          accent="primary.main"
          delta={compareToPrior && priorStats ? formatPctDelta(stats.uniqueViewers, priorStats.uniqueViewers) : null}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label="Total page hits"
          value={stats.totalViewers}
          sparkValues={(current.data.page || []).map((d) => d.total || 0)}
          accent="success.main"
          delta={compareToPrior && priorStats ? formatPctDelta(stats.totalViewers, priorStats.totalViewers) : null}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label={interactionLabel}
          value={stats.interactions}
          accent="warning.main"
          delta={compareToPrior && priorStats ? formatPctDelta(stats.interactions, priorStats.interactions) : null}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label="Active nights"
          value={stats.activeNights}
          accent="text.secondary"
          delta={compareToPrior && priorStats ? formatPctDelta(stats.activeNights, priorStats.activeNights) : null}
        />
      </Grid>
    </Grid>
  );
};


// Overview tab ---------------------------------------------------------

// V1 NarrativeSummary was removed at user request — its templated paragraph
// took up real estate without earning the read. The hero stats row now
// leads the page directly.
const OverviewTab = () => (
  <Stack spacing={2}>
    <HeroStatsRow />
    <CalendarHeatmap />
    <HourlyHeatmap />
  </Stack>
);

export default OverviewTab;
