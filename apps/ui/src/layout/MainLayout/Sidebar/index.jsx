import { memo, useMemo } from 'react';
import * as React from 'react';

import { Box, Drawer, Stack, Typography, useMediaQuery } from '@mui/material';
import SvgIcon from '@mui/material/SvgIcon';
import { useTheme } from '@mui/material/styles';
import PropTypes from 'prop-types';
import PerfectScrollbar from 'react-perfect-scrollbar';

import { VERSION } from '../../../config';
import ThemeToggle from '../../../design-system/components/ThemeToggle';
import useAuth from '../../../hooks/useAuth';
import { useDispatch, useSelector } from '../../../store';
import { drawerWidth } from '../../../store/constant';
import { openDrawer } from '../../../store/slices/menu';
import Chip from '../../../ui-component/extended/Chip';
import FacebookIcon from '@mui/icons-material/Facebook';

import LogoSection from '../LogoSection';
import MenuList from './MenuList';

const Sidebar = ({ window }) => {
  const theme = useTheme();
  const matchUpMd = useMediaQuery(theme.breakpoints.up('md'));

  const dispatch = useDispatch();
  const { drawerOpen } = useSelector((state) => state.menu);

  const { isDemo } = useAuth();

  const chipLabel = `${isDemo ? 'DEMO - ' : ''} ${VERSION}`;

  const logo = useMemo(
    () => (
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Box sx={{ display: 'flex', p: 2, mx: 'auto' }}>
          <LogoSection />
        </Box>
      </Box>
    ),
    []
  );

  const drawer = useMemo(
    () => (
      <PerfectScrollbar
        component="div"
        style={{
          height: !matchUpMd ? 'calc(100vh - 56px)' : 'calc(100vh - 88px)',
          paddingLeft: '16px',
          paddingRight: '16px'
        }}
      >
        <MenuList />

        {/* Theme toggle — Phase 2 of the v2 migration. The rail variant
            shows the icon plus a "Light mode" / "Dark mode" label so it's
            obvious in the expanded sidebar. */}
        <Box sx={{ mt: 2, px: 1 }}>
          <ThemeToggle variant="rail" />
        </Box>

        <Stack direction="row" justifyContent="center" spacing={2} sx={{ mt: 2 }}>
          <Box
            component="a"
            href="https://discord.gg/sTsVtYzUyz"
            target="_blank"
            rel="noreferrer"
            sx={{ color: 'inherit', display: 'inline-flex' }}
            aria-label="Discord"
            title="Join us on Discord"
          >
            <SvgIcon viewBox="0 0 24 24" fontSize="large">
              <path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.078.037c-.211.375-.444.864-.608 1.249-1.845-.276-3.68-.276-5.486 0-.164-.394-.405-.874-.617-1.249a.077.077 0 00-.078-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.027C2.302 9.045 1.64 13.58 2.011 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.027c.461-.63.873-1.295 1.226-1.994a.076.076 0 00-.041-.105c-.652-.247-1.274-.547-1.872-.892a.077.077 0 01-.008-.128c.125-.094.249-.192.368-.291a.074.074 0 01.077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.009c.12.099.243.198.368.292a.077.077 0 01-.006.128 12.3 12.3 0 01-1.873.891.076.076 0 00-.04.106c.36.698.772 1.362 1.225 1.993a.078.078 0 00.084.028 19.9 19.9 0 005.994-3.03.082.082 0 00.03-.057c.5-5.177-.838-9.673-3.548-13.662a.06.06 0 00-.03-.028zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.974 0c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.947 2.419-2.157 2.419z" />
            </SvgIcon>
          </Box>
          <Box
            component="a"
            href="https://www.facebook.com/groups/remotefalcon"
            target="_blank"
            rel="noreferrer"
            sx={{ color: 'inherit', display: 'inline-flex' }}
            aria-label="Facebook"
            title="Join us on Facebook"
          >
            <FacebookIcon fontSize="large" />
          </Box>
        </Stack>

        <Stack direction="row" justifyContent="center" sx={{ mb: 2 }}>
          <Chip label={chipLabel} chipcolor="primary" />
        </Stack>
      </PerfectScrollbar>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchUpMd]
  );

  const container = window !== undefined ? () => window.document.body : undefined;

  return (
    <Box component="nav" sx={{ flexShrink: { md: 0 }, width: matchUpMd ? drawerWidth : 'auto' }} aria-label="mailbox folders">
      <Drawer
        container={container}
        variant={matchUpMd ? 'persistent' : 'temporary'}
        anchor="left"
        open={drawerOpen}
        onClose={() => dispatch(openDrawer(!drawerOpen))}
        sx={{
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            background: theme.palette.background.default,
            color: theme.palette.text.primary,
            borderRight: 'none',
            [theme.breakpoints.up('md')]: {
              top: '88px'
            }
          }
        }}
        ModalProps={{ keepMounted: true }}
        color="inherit"
      >
        {drawerOpen && logo}
        {drawerOpen && drawer}
      </Drawer>
    </Box>
  );
};

Sidebar.propTypes = {
  window: PropTypes.object
};

export default memo(Sidebar);
