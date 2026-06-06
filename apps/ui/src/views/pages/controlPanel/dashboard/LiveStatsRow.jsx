import { Box, Skeleton, Stack, Typography } from '@mui/material';
import {
  IconBolt,
  IconHeadphones,
  IconPlaylist,
  IconUsers
} from '@tabler/icons-react';

import HealthRow from './HealthRow';
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

  // CSS grid with `gap` instead of MUI <Grid container spacing>: MUI's grid
  // applies a negative left margin that the column's overflow was clipping,
  // leaving the items' compensating left padding as a net ~16px indent. A gap
  // grid has no negative margins, so the tiles sit flush with the page edge.
  // Tiles in a row are equal height via the grid's default row stretch +
  // StatTile's height:100%.
  // 4 stat tiles + the compact FPP plugin card share one row so the "Right now"
  // band reads as a single unit. 5-across on lg; wraps below.
  const tileGridSx = {
    display: 'grid',
    gap: 2,
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' }
  };

  if (loading) {
    return (
      <Box sx={tileGridSx}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={tileGridSx} role="status" aria-live="polite" aria-atomic="false">
      <Box data-testid="dashboard-viewers-now" sx={{ height: '100%' }}>
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
      </Box>
      <Box data-testid="dashboard-active-tile" sx={{ height: '100%' }}>
        <StatTile
          label={isJukebox ? 'Songs queued' : 'Active votes'}
          value={queuedNow}
          sub={isJukebox ? 'In the jukebox now' : 'Across active sequences'}
          icon={<IconHeadphones size={28} stroke={1.5} />}
        />
      </Box>
      <StatTile
        label={isJukebox ? 'Requests today' : 'Votes cast today'}
        value={interactionsToday}
        sub={`Since midnight (${show?.timezone || 'show timezone'})`}
        icon={<IconBolt size={28} stroke={1.5} />}
      />
      <StatTile
        label="Active sequences"
        value={activeSequences}
        sub={`${(show?.sequences || []).length} total`}
        icon={<IconPlaylist size={28} stroke={1.5} />}
      />
      <HealthRow />
    </Box>
  );
};

export default LiveStatsRow;
