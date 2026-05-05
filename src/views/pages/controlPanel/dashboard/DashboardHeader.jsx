import { useEffect, useState, useCallback } from 'react';

import { useLazyQuery } from '@apollo/client';
import LibraryMusicTwoTone from '@mui/icons-material/LibraryMusicTwoTone';
import ThumbUpTwoTone from '@mui/icons-material/ThumbUpTwoTone';
import { Grid } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import useInterval from '../../../../hooks/useInterval';
import { useDispatch, useSelector } from '../../../../store';
import RevenueCard from '../../../../ui-component/cards/RevenueCard';
import DashboardStatsSkeleton from '../../../../ui-component/cards/Skeleton/DashboardStatsSkeleton';
import { ViewerControlMode } from '../../../../utils/enum';
import { DASHBOARD_LIVE_STATS } from '../../../../utils/graphql/controlPanel/queries';

import { showAlertOld } from '../../globalPageHelpers';

const DashboardHeader = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [playingNow, setPlayingNow] = useState(null);
  const [playingNext, setPlayingNext] = useState(null);
  const [currentRequests, setCurrentRequests] = useState('0');
  const [totalRequests, setTotalRequests] = useState('0');
  const [isLoading, setIsLoading] = useState(false);

  const [dashboardLiveStatsQuery] = useLazyQuery(DASHBOARD_LIVE_STATS);

  const fetchDashboardLiveStats = useCallback(async () => {
    await dashboardLiveStatsQuery({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      variables: {
        startDate: new Date().setHours(0, 0, 0),
        endDate: new Date().setHours(23, 59, 59),
        timezone: show?.timezone
      },
      onCompleted: (data) => {
        const dashboardLiveStats = data?.dashboardLiveStats;
        setPlayingNow(dashboardLiveStats?.playingNow || '--');
        setPlayingNext(`Next: ${dashboardLiveStats?.playingNext || '--'}`);
        if (show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX) {
          setCurrentRequests(dashboardLiveStats?.currentRequests?.toString());
          setTotalRequests(`${dashboardLiveStats?.totalRequests} Today`);
        } else {
          setCurrentRequests(dashboardLiveStats?.currentVotes?.toString());
          setTotalRequests(`${dashboardLiveStats?.totalVotes} Today`);
        }
      },
      onError: () => {
        showAlertOld({ dispatch, alert: 'error' });
      }
    });
  }, [dashboardLiveStatsQuery, dispatch, show?.timezone]);

  useEffect(() => {
    if (!show?.timezone) return;
    setIsLoading(true);
    fetchDashboardLiveStats().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.timezone]);

  useInterval(async () => {
    await fetchDashboardLiveStats();
  }, 5000);

  return (
    <>
      {isLoading ? (
        <DashboardStatsSkeleton />
      ) : (
        <Grid item xs={12} md={6} lg={6}>
          <RevenueCard
            primary="Playing Now"
            secondary={playingNow}
            content={playingNext}
            iconPrimary={LibraryMusicTwoTone}
            color={theme.palette.secondary.main}
          />
        </Grid>
      )}
      {isLoading ? (
        <DashboardStatsSkeleton />
      ) : (
        <Grid item xs={12} md={6} lg={6}>
          <RevenueCard
            primary={show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX ? 'Active Requests' : 'Active Votes'}
            secondary={currentRequests}
            content={totalRequests}
            iconPrimary={ThumbUpTwoTone}
            color={theme.palette.primary.main}
          />
        </Grid>
      )}
    </>
  );
};

export default DashboardHeader;
