import { useMemo } from 'react';

import { Grid, Skeleton, Stack } from '@mui/material';

import StatTile from '../../../../ui-component/StatTile';
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
          subtle
          delta={compareToPrior && priorStats ? formatPctDelta(stats.uniqueViewers, priorStats.uniqueViewers) : null}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label="Total page hits"
          value={stats.totalViewers}
          sparkValues={(current.data.page || []).map((d) => d.total || 0)}
          accent="success.main"
          subtle
          delta={compareToPrior && priorStats ? formatPctDelta(stats.totalViewers, priorStats.totalViewers) : null}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label={interactionLabel}
          value={stats.interactions}
          accent="warning.main"
          subtle
          delta={compareToPrior && priorStats ? formatPctDelta(stats.interactions, priorStats.interactions) : null}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label="Active nights"
          value={stats.activeNights}
          accent="text.secondary"
          subtle
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
