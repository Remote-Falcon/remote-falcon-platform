import * as React from 'react';

import { Link, Typography } from '@mui/material';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';

import LogoMark from '../../../design-system/components/LogoMark';
import { CONTROL_PANEL_PATH } from '../../../config';

// v2 sidebar logo lockup. Matches the mockup's `.rail .logo` block:
// 32px icon flush-left, "Remote Falcon" wordmark to the right, hidden
// when the rail is collapsed. Icon is sourced from the design-system
// LogoMark so the sidebar matches the marketing surfaces (which read
// from public/rf-icon.png — the canonical brand mark).
const SidebarLogo = ({ collapsed }) => (
  <Link
    component={RouterLink}
    to={CONTROL_PANEL_PATH}
    underline="none"
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.25,
      px: collapsed ? 1.5 : 2.75,
      py: 1.5,
      color: 'text.primary'
    }}
  >
    <LogoMark size={32} />
    {!collapsed && (
      <Typography
        variant="subtitle1"
        data-rail-label
        sx={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap' }}
      >
        Remote Falcon
      </Typography>
    )}
  </Link>
);

SidebarLogo.propTypes = {
  collapsed: PropTypes.bool
};

export default SidebarLogo;
