import * as React from 'react';

import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';

import PageHead from '../../../../ui-component/PageHead';
import SubNav from '../../../../ui-component/SubNav';

export const viewerPageTemplatesRoutes = [
  { label: 'Free Templates', to: '/control-panel/viewer-page-templates/free' },
  { label: 'Premium Templates', to: '/control-panel/viewer-page-templates/premium' }
];

const ViewerPageTemplates = () => (
  <Box>
    <PageHead
      title="Viewer Page Templates"
      description="Pick a starting point for your viewer page. Free templates load instantly; premium templates link out for download."
    />
    <SubNav items={viewerPageTemplatesRoutes} />
    <Outlet />
  </Box>
);

export default ViewerPageTemplates;
