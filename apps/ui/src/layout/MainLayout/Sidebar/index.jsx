import { memo } from 'react';
import * as React from 'react';

import { Box, Divider, Drawer, Stack, Tooltip, useMediaQuery } from '@mui/material';
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
        {/* Discord + Facebook icons used to live here as a row above the
            theme toggle. They moved into the Help nav group so they have
            a proper home alongside Docs, and the icon-only buttons (which
            had no labels) now carry the network's name. The version chip
            stays at the bottom of the footer. */}
        {!railCollapsed && (
          <>
            <Stack direction="row" justifyContent="center" sx={{ mt: 0.5 }}>
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
