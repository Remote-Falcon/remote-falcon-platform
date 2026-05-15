import * as React from 'react';

import { Box, IconButton } from '@mui/material';
import { IconMenu2 } from '@tabler/icons-react';

import ThemeToggle from '../../../design-system/components/ThemeToggle';
import { useDispatch, useSelector } from '../../../store';
import { openDrawer } from '../../../store/slices/menu';

import ProfileSection from './ProfileSection';
import RouteBreadcrumb from './RouteBreadcrumb';
import SearchTrigger from './SearchTrigger';

// v2 slim topbar (56px) per the dashboard mockup. Page-specific actions
// (Reset Votes / Clear Now Playing for the dashboard, etc.) live in the
// PageHead component on each route — not in the chrome.
const Header = () => {
  const dispatch = useDispatch();
  const { drawerOpen } = useSelector((state) => state.menu);

  return (
    <>
      {/* Mobile-only hamburger — desktop has the persistent rail. */}
      <IconButton
        onClick={() => dispatch(openDrawer(!drawerOpen))}
        sx={{
          display: { xs: 'inline-flex', md: 'none' },
          color: 'text.primary'
        }}
        aria-label="Open navigation"
      >
        <IconMenu2 stroke={1.5} size={22} />
      </IconButton>

      <RouteBreadcrumb />

      <Box sx={{ flexGrow: 1 }} />

      <SearchTrigger />

      <Box sx={{ ml: 1 }}>
        <ThemeToggle />
      </Box>

      <Box sx={{ ml: 0.5 }}>
        <ProfileSection />
      </Box>
    </>
  );
};

export default Header;
