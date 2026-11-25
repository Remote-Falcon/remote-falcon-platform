import { useMemo } from 'react';

import { Skeleton, Typography } from '@mui/material';
import { IconChartLine } from '@tabler/icons-react';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import { useSelector } from '../../../../store';
import { ViewerControlMode } from '../../../../utils/enum';
import ApexLineChart from '../dashboard/ApexLineChart';

import { buildNightlySeries } from './nightlySeries';
import useAnalyticsFilters from './useAnalyticsFilters';
import useDashboardStats from './useDashboardStats';

// Show-total requests (jukebox) or votes (voting) per night across the
// selected range. Restores the "Sequence Requests by Date" line chart the
// old dashboard had before the May 2026 rebuild; operators asked for the
// simple trend line back.
const RequestsPerNight = () => {
  const { range, timezone } = useAnalyticsFilters();
  const { show } = useSelector((state) => state.show);
  const stats = useDashboardStats(range);

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;
  const noun = isJukebox ? 'Requests' : 'Votes';
  const title = `${noun} per night`;

  const series = useMemo(
    () => buildNightlySeries(stats.data?.[isJukebox ? 'jukeboxByDate' : 'votingByDate'], range, timezone),
    [stats.data, isJukebox, range, timezone]
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

export default RequestsPerNight;
