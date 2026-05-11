import * as React from 'react';

import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { IconChevronRight } from '@tabler/icons-react';
import { useLocation } from 'react-router-dom';

import controlPanelGroups from '../../../menu-items/controlPanel';
import { accountSettingsRoutes } from '../../../views/pages/controlPanel/accountSettings';
import { adminRoutes } from '../../../views/pages/controlPanel/admin';
import { analyticsRoutes } from '../../../views/pages/controlPanel/analytics';
import { viewerPageTemplatesRoutes } from '../../../views/pages/controlPanel/viewerPageTemplates';
import { viewerSettingsRoutes } from '../../../views/pages/controlPanel/viewerSettings';

const SUB_ROUTES = [
  ...viewerSettingsRoutes,
  ...accountSettingsRoutes,
  ...viewerPageTemplatesRoutes,
  ...analyticsRoutes,
  ...adminRoutes
];

// Topbar breadcrumb: "Section / Page [/ Sub-page]" derived from the
// current pathname. Returns null on routes outside the control panel
// menu so the topbar stays clean.
const findCrumb = (pathname) => {
  for (const group of controlPanelGroups) {
    for (const child of group.children || []) {
      if (child.url && pathname.startsWith(child.url)) {
        // Find a sub-route match nested under this menu item, if any.
        const sub = SUB_ROUTES.find(
          (s) => s.to.startsWith(child.url) && pathname.startsWith(s.to)
        );
        return { section: group.title, page: child.title, sub: sub?.label };
      }
    }
  }
  return null;
};

const Crumb = ({ children, strong }) => (
  <Typography
    variant="body2"
    sx={{
      color: strong ? 'text.primary' : 'text.secondary',
      fontWeight: strong ? 600 : 400,
      whiteSpace: 'nowrap'
    }}
  >
    {children}
  </Typography>
);

const RouteBreadcrumb = () => {
  const theme = useTheme();
  const { pathname } = useLocation();
  const crumb = findCrumb(pathname);

  if (!crumb) return null;

  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        gap: 0.5,
        ml: 2,
        minWidth: 0
      }}
    >
      <Crumb>{crumb.section}</Crumb>
      <IconChevronRight size={14} stroke={1.75} color={theme.palette.text.secondary} />
      <Crumb strong={!crumb.sub}>{crumb.page}</Crumb>
      {crumb.sub && (
        <>
          <IconChevronRight size={14} stroke={1.75} color={theme.palette.text.secondary} />
          <Crumb strong>{crumb.sub}</Crumb>
        </>
      )}
    </Box>
  );
};

export default RouteBreadcrumb;
