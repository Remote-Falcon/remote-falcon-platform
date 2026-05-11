import * as React from 'react';

import { Box, Link, Typography } from '@mui/material';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';

import logo from '../../../assets/images/rf-icon.png';
import { CONTROL_PANEL_PATH } from '../../../config';

// v2 sidebar logo lockup. Matches the mockup's `.rail .logo` block:
// 32px icon flush-left, "Remote Falcon" wordmark to the right, hidden
// when the rail is collapsed.
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
    <Box
      component="img"
      src={logo}
      alt="Remote Falcon"
      sx={{ width: 32, height: 32, flexShrink: 0 }}
    />
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
