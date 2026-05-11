import * as React from 'react';

import { Box, Grid, Skeleton, Stack, Typography } from '@mui/material';
import {
  IconBolt,
  IconHeadphones,
  IconPlaylist,
  IconUsers
} from '@tabler/icons-react';
import PropTypes from 'prop-types';

import MainCard from '../../../../ui-component/cards/MainCard';
import LiveIndicator from '../../../../ui-component/LiveIndicator';
import { useSelector } from '../../../../store';
import { ViewerControlMode } from '../../../../utils/enum';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';

// Single stat tile per the v2 mockup `.stat` block. Borderless card with
// generous padding, label on top, large value, sub-line for trend/context.
const StatTile = ({ label, value, sub, icon, accent = 'text.secondary' }) => (
  <MainCard
    sx={{ height: '100%' }}
    contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }}
  >
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="overline"
          sx={{
            display: 'block',
            color: 'text.secondary',
            letterSpacing: '0.06em',
            lineHeight: 1.4
          }}
        >
          {label}
        </Typography>
        <Typography variant="h2" sx={{ mt: 0.5, fontWeight: 700, fontSize: 32, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="body2" sx={{ mt: 0.5, color: accent, fontSize: 12 }}>
            {sub}
          </Typography>
        )}
      </Box>
      {icon && <Box sx={{ color: accent, opacity: 0.4 }}>{icon}</Box>}
    </Box>
  </MainCard>
);

StatTile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  sub: PropTypes.node,
  icon: PropTypes.node,
  accent: PropTypes.string
};

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
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
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
      <Grid item xs={12} sm={6} md={3}>
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
