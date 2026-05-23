import * as React from 'react';

import { Box, Stack } from '@mui/material';
import { Outlet } from 'react-router-dom';

import PageHead from '../../../../ui-component/PageHead';
import SubNav from '../../../../ui-component/SubNav';

import DateRangePicker from './DateRangePicker';

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
const Analytics = () => (
  <Box data-testid="analytics-root">
    <PageHead
      title="Analytics"
      description="Reflect on your audience and how the show is landing. Filter, compare, and share."
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          <DateRangePicker />
        </Stack>
      }
    />
    <SubNav items={analyticsRoutes} />
    <Outlet />
  </Box>
);

export default Analytics;
