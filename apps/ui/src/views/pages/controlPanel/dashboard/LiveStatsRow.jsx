import { Grid, Skeleton, Stack, Typography } from '@mui/material';
import {
  IconBolt,
  IconHeadphones,
  IconPlaylist,
  IconUsers
} from '@tabler/icons-react';

import LiveIndicator from '../../../../ui-component/LiveIndicator';
import StatTile from '../../../../ui-component/StatTile';
import { useSelector } from '../../../../store';
import { ViewerControlMode } from '../../../../utils/enum';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';

const LiveStatsRow = () => {
  const { show } = useSelector((state) => state.show);
  const { data: stats, loading } = useDashboardLiveStats();

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;
  // Prefer the deduped, 5-min-fresh count from the backend over the raw
  // activeViewers array length (which counts stale entries and double-counts
  // viewers whose IP changed mid-session).
  const viewersNow = stats?.currentViewers ?? (show?.activeViewers?.length || 0);
  const queuedNow = isJukebox ? show?.requests?.length || 0 : stats?.currentVotes || 0;
  const interactionsToday = isJukebox ? stats?.totalRequests || 0 : stats?.totalVotes || 0;
  const activeSequences = (show?.sequences || []).filter((s) => s.active).length;
  const dwellTonight = stats?.medianDwellSecondsTonight;
  const dwellMin = dwellTonight && dwellTonight > 0 ? Math.max(1, Math.round(dwellTonight / 60)) : null;

  if (loading) {
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

  return (
    <Grid container spacing={2} role="status" aria-live="polite" aria-atomic="false">
      <Grid item xs={12} sm={6} md={3} data-testid="dashboard-viewers-now">
        <StatTile
          label="Viewers right now"
          value={viewersNow}
          sub={
            viewersNow > 0 ? (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <LiveIndicator active size="xs" />
                <Typography component="span" variant="body2" sx={{ fontSize: 12 }}>
                  {dwellMin ? `${dwellMin}m median dwell tonight` : 'Live'}
                </Typography>
              </Stack>
            ) : (
              'No active viewers'
            )
          }
          icon={<IconUsers size={28} stroke={1.5} />}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3} data-testid="dashboard-active-tile">
        <StatTile
          label={isJukebox ? 'Songs queued' : 'Active votes'}
          value={queuedNow}
          sub={isJukebox ? 'In the jukebox now' : 'Across active sequences'}
          icon={<IconHeadphones size={28} stroke={1.5} />}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label={isJukebox ? 'Requests today' : 'Votes cast today'}
          value={interactionsToday}
          sub={`Since midnight (${show?.timezone || 'show timezone'})`}
          icon={<IconBolt size={28} stroke={1.5} />}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatTile
          label="Active sequences"
          value={activeSequences}
          sub={`${(show?.sequences || []).length} total`}
          icon={<IconPlaylist size={28} stroke={1.5} />}
        />
      </Grid>
    </Grid>
  );
};

export default LiveStatsRow;
