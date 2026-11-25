import { useMemo } from 'react';

import { Skeleton, Typography } from '@mui/material';
import { IconAlertTriangle, IconChartLine } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import { useSelector } from '../../../../store';
import { ViewerControlMode } from '../../../../utils/enum';
import ApexLineChart from '../dashboard/ApexLineChart';

import { buildNightlySeries } from './nightlySeries';
import useAnalyticsFilters from './useAnalyticsFilters';

// Show-total requests (jukebox) or votes (voting) per night across the
// selected range. Restores the "Sequence Requests by Date" line chart the
// old dashboard had before the May 2026 rebuild; operators asked for the
// simple trend line back. stats is the useDashboardStats result,
// fetched once by OverviewTab.
const RequestsPerNight = ({ stats }) => {
  const { timezone } = useAnalyticsFilters();
  const { show } = useSelector((state) => state.show);

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;
  const noun = isJukebox ? 'Requests' : 'Votes';
  const title = `${noun} per night`;

  const series = useMemo(
    () => buildNightlySeries(stats.data?.[isJukebox ? 'jukeboxByDate' : 'votingByDate'], timezone),
    [stats.data, isJukebox, timezone]
  );
  const total = useMemo(() => series.reduce((acc, [, value]) => acc + value, 0), [series]);
  const chartData = useMemo(() => ({ name: noun, yValue: `${noun}: `, data: series }), [noun, series]);

  if (stats.loading) {
    return (
      <MainCard title={title}>
        <Skeleton variant="rectangular" height={350} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  // Without this the failed fetch falls through to the empty state and a
  // busy night reads as "no requests".
  if (stats.error) {
    return (
      <MainCard title={title}>
        <EmptyState
          icon={<IconAlertTriangle size={32} stroke={1.5} />}
          title={`Couldn't load ${noun.toLowerCase()}`}
          description="Something went wrong fetching your stats. Refresh the page to try again."
        />
      </MainCard>
    );
  }

  if (total === 0) {
    return (
      <MainCard title={title}>
        <EmptyState
          icon={<IconChartLine size={32} stroke={1.5} />}
          title={`No ${noun.toLowerCase()} in this range yet`}
          description="Once viewers start interacting, each night's total shows up here."
        />
      </MainCard>
    );
  }

  return (
    <MainCard
      title={title}
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {total.toLocaleString()} {noun.toLowerCase()} across {series.length} {series.length === 1 ? 'night' : 'nights'}
        </Typography>
      }
    >
      <ApexLineChart chartData={chartData} timezone={timezone} />
    </MainCard>
  );
};

RequestsPerNight.propTypes = {
  stats: PropTypes.shape({ data: PropTypes.object, loading: PropTypes.bool, error: PropTypes.object }).isRequired
};

export default RequestsPerNight;
