import { useState } from 'react';

import { Box, Button, CircularProgress, Stack } from '@mui/material';
import { IconDownload } from '@tabler/icons-react';
import { Outlet } from 'react-router-dom';

import PageHead from '../../../../ui-component/PageHead';
import SubNav from '../../../../ui-component/SubNav';
import { useDispatch, useSelector } from '../../../../store';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';

import { downloadStatsExport } from './analyticsExport.service';
import DateRangePicker from './DateRangePicker';
import useAnalyticsFilters from './useAnalyticsFilters';

// Sub-route entries — exported so CommandPalette + RouteBreadcrumb pick
// them up automatically (same pattern as the other tabbed pages).
export const analyticsRoutes = [
  { label: 'Overview', to: '/control-panel/analytics/overview' },
  { label: 'Audience', to: '/control-panel/analytics/audience' },
  { label: 'Sequences (Jukebox)', to: '/control-panel/analytics/sequences-jukebox' },
  { label: 'Sequences (Voting)', to: '/control-panel/analytics/sequences-voting' }
];

// v2 Analytics shell. The PageHead actions slot owns the date-range
// picker so it stays sticky-visible regardless of which sub-tab is open.
// The export lives beside it for the same reason: one CSV covering the
// whole selected range, identical from every sub-tab.
const Analytics = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const { range, timezone, presetId } = useAnalyticsFilters();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    trackPosthogEvent('analytics_export_downloaded', { preset_id: presetId, surface: 'analytics_shell' });
    downloadStatsExport(dispatch, { showSubdomain: show?.showSubdomain, timezone, range }, setIsExporting);
  };

  return (
    <Box data-testid="analytics-root">
      <PageHead
        title="Analytics"
        description="Reflect on your audience and how the show is landing. Filter, compare, and share."
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <DateRangePicker />
            {/* Deliberately a plain Button rather than RFLoadingButton: that
                shared component hardcodes size="large", which sits a step
                taller than the picker beside it. Same variant/color/size as
                the picker so the pair reads as one control group. */}
            <Button
              variant="outlined"
              color="primary"
              disabled={isExporting}
              startIcon={
                isExporting ? <CircularProgress size={16} color="inherit" /> : <IconDownload size={16} stroke={1.75} />
              }
              sx={{ whiteSpace: 'nowrap' }}
              onClick={handleExport}
            >
              Export CSV
            </Button>
          </Stack>
        }
      />
      <SubNav items={analyticsRoutes} />
      <Outlet />
    </Box>
  );
};

export default Analytics;
