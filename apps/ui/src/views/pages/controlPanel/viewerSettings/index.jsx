import * as React from 'react';

import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';

import PageHead from '../../../../ui-component/PageHead';
import SubNav from '../../../../ui-component/SubNav';

// Sub-nav items live alongside the parent layout so the CommandPalette
// can import them and surface each settings sub-page directly.
export const viewerSettingsRoutes = [
  { label: 'Viewer Control', to: '/control-panel/remote-falcon-settings/viewer-control', end: false },
  { label: 'Viewer Page', to: '/control-panel/remote-falcon-settings/viewer-page' },
  { label: 'Jukebox', to: '/control-panel/remote-falcon-settings/jukebox' },
  { label: 'Voting', to: '/control-panel/remote-falcon-settings/voting' },
  { label: 'Interaction Safeguards', to: '/control-panel/remote-falcon-settings/safeguards' }
];

// v2 settings shell — PageHead + horizontal pill nav, content rendered by
// the matching child route via <Outlet />.
const ViewerSettings = () => (
  <Box>
    <PageHead
      title="Remote Falcon Settings"
      description="Tune how your viewer page and viewer control behave. Changes save automatically."
    />
    <SubNav items={viewerSettingsRoutes} />
    <Outlet />
  </Box>
);

export default ViewerSettings;
