import { memo } from 'react';
import * as React from 'react';

import FacebookIcon from '@mui/icons-material/Facebook';
import { Box, Divider, Drawer, Stack, Tooltip, useMediaQuery } from '@mui/material';
import SvgIcon from '@mui/material/SvgIcon';
import { useTheme } from '@mui/material/styles';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import PropTypes from 'prop-types';
import PerfectScrollbar from 'react-perfect-scrollbar';

import { VERSION } from '../../../config';
import ThemeToggle from '../../../design-system/components/ThemeToggle';
import useAuth from '../../../hooks/useAuth';
import useConfig from '../../../hooks/useConfig';
import { useDispatch, useSelector } from '../../../store';
import {
  drawerWidthCollapsed,
  drawerWidthExpanded
} from '../../../store/constant';
import { openDrawer } from '../../../store/slices/menu';
import Chip from '../../../ui-component/extended/Chip';

import MenuList from './MenuList';
import SidebarLogo from './SidebarLogo';

// CSS rules applied to the Drawer paper when the sidebar is in icon-rail
// (collapsed) mode. We hide the things that don't fit in 72px — labels,
// section subheaders, the footer's text — without conditionally rendering
// them, so that React doesn't unmount/remount on every toggle and we keep
// a single transition path on `width`.
const COLLAPSED_PAPER_OVERRIDES = {
  '& .MuiListItemText-root': { display: 'none' },
  '& .MuiListSubheader-root': { display: 'none' },
  '& [data-rail-label]': { display: 'none' }
};

const Sidebar = ({ window }) => {
  const theme = useTheme();
  const matchUpMd = useMediaQuery(theme.breakpoints.up('md'));

  const dispatch = useDispatch();
  const { drawerOpen } = useSelector((state) => state.menu);

  const { sidebarCollapsed, onToggleSidebar } = useConfig();
  const { isDemo } = useAuth();

  const chipLabel = `${isDemo ? 'DEMO - ' : ''} ${VERSION}`;

  // Effective rail width: collapsed only matters at md+ (desktop).
  // Mobile is always the temporary full-width drawer.
  const railCollapsed = matchUpMd && sidebarCollapsed;
  const paperWidth = railCollapsed ? drawerWidthCollapsed : drawerWidthExpanded;

  // The drawer paper is a flex column. Logo pinned to the top, scrollable
  // menu in the middle (`flex: 1`), and the footer (theme toggle, collapse,
  // social icons, version chip) pinned to the bottom via `mt: auto` per
  // the v2 mockup's `.rail-footer` block.
  const drawerBody = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <SidebarLogo collapsed={railCollapsed} />

      <PerfectScrollbar
        component="div"
        style={{
          flex: 1,
          minHeight: 0,
          paddingLeft: railCollapsed ? '8px' : '12px',
          paddingRight: railCollapsed ? '8px' : '12px',
          transition: 'padding 200ms ease'
        }}
      >
        <MenuList />
      </PerfectScrollbar>

      <Box
        sx={{
          mt: 'auto',
          borderTop: (t) =>
            t.palette.mode === 'dark'
              ? '1px solid rgba(255,255,255,0.04)'
              : `1px solid ${t.palette.divider}`,
          px: railCollapsed ? 1 : 1.5,
          py: 1
        }}
      >
        {/* Social icons + version chip on top of the footer block — only
            shown when expanded. Theme toggle + collapse stay pinned to the
            very bottom so they don't shift position between expanded and
            collapsed states (they're the only two items present in both). */}
        {!railCollapsed && (
          <>
            <Stack direction="row" justifyContent="center" spacing={2} sx={{ mt: 0.5 }}>
              <Box
                component="a"
                href="https://discord.gg/sTsVtYzUyz"
                target="_blank"
                rel="noreferrer"
                sx={{ color: 'text.secondary', display: 'inline-flex', '&:hover': { color: 'text.primary' } }}
                aria-label="Discord"
                title="Join us on Discord"
              >
                <SvgIcon viewBox="0 0 24 24" fontSize="small">
                  <path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.078.037c-.211.375-.444.864-.608 1.249-1.845-.276-3.68-.276-5.486 0-.164-.394-.405-.874-.617-1.249a.077.077 0 00-.078-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.027C2.302 9.045 1.64 13.58 2.011 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.027c.461-.63.873-1.295 1.226-1.994a.076.076 0 00-.041-.105c-.652-.247-1.274-.547-1.872-.892a.077.077 0 01-.008-.128c.125-.094.249-.192.368-.291a.074.074 0 01.077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.009c.12.099.243.198.368.292a.077.077 0 01-.006.128 12.3 12.3 0 01-1.873.891.076.076 0 00-.04.106c.36.698.772 1.362 1.225 1.993a.078.078 0 00.084.028 19.9 19.9 0 005.994-3.03.082.082 0 00.03-.057c.5-5.177-.838-9.673-3.548-13.662a.06.06 0 00-.03-.028zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.974 0c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.947 2.419-2.157 2.419z" />
                </SvgIcon>
              </Box>
              <Box
                component="a"
                href="https://www.facebook.com/groups/remotefalcon"
                target="_blank"
                rel="noreferrer"
                sx={{ color: 'text.secondary', display: 'inline-flex', '&:hover': { color: 'text.primary' } }}
                aria-label="Facebook"
                title="Join us on Facebook"
              >
                <FacebookIcon fontSize="small" />
              </Box>
            </Stack>
            <Stack direction="row" justifyContent="center" sx={{ mt: 1 }}>
              <Chip label={chipLabel} chipcolor="primary" size="small" />
            </Stack>
            <Divider
              sx={{
                my: 1,
                borderColor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'divider'
              }}
            />
          </>
        )}

        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <ThemeToggle variant="rail" />
        </Box>

        <Tooltip title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <Box
            component="button"
            type="button"
            onClick={onToggleSidebar}
            sx={{
              display: { xs: 'none', md: 'flex' },
              width: '100%',
              alignItems: 'center',
              gap: 1.5,
              px: 1.25,
              py: 1,
              borderRadius: 1,
              border: 0,
              cursor: 'pointer',
              color: 'text.secondary',
              bgcolor: 'transparent',
              '&:hover': {
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                color: 'text.primary'
              }
            }}
          >
            {railCollapsed ? (
              <IconChevronRight size={18} stroke={1.75} />
            ) : (
              <IconChevronLeft size={18} stroke={1.75} />
            )}
            <Box component="span" data-rail-label sx={{ fontSize: 14, fontWeight: 500 }}>
              Collapse
            </Box>
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );

  const container = window !== undefined ? () => window.document.body : undefined;

  return (
    <Box
      component="nav"
      sx={{
        flexShrink: { md: 0 },
        width: matchUpMd ? paperWidth : 'auto',
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.easeInOut,
          duration: 250
        })
      }}
      aria-label="control panel navigation"
    >
      <Drawer
        container={container}
        variant={matchUpMd ? 'persistent' : 'temporary'}
        anchor="left"
        open={drawerOpen}
        onClose={() => dispatch(openDrawer(!drawerOpen))}
        sx={{
          '& .MuiDrawer-paper': {
            width: paperWidth,
            background: theme.palette.background.default,
            color: theme.palette.text.primary,
            borderRight: (t) =>
              t.palette.mode === 'dark'
                ? '1px solid rgba(255,255,255,0.04)'
                : `1px solid ${t.palette.divider}`,
            overflowX: 'hidden',
            top: 0,
            height: '100vh',
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.easeInOut,
              duration: 250
            }),
            ...(railCollapsed && COLLAPSED_PAPER_OVERRIDES)
          }
        }}
        ModalProps={{ keepMounted: true }}
        color="inherit"
      >
        {drawerOpen && drawerBody}
      </Drawer>
    </Box>
  );
};

Sidebar.propTypes = {
  window: PropTypes.object
};

export default memo(Sidebar);
