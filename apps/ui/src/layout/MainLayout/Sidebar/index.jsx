import { memo } from 'react';
import * as React from 'react';

import { Box, Drawer, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import SupportLinks from '../../../design-system/components/SupportLinks';
import useConfig from '../../../hooks/useConfig';
import { useDispatch, useSelector } from '../../../store';
import {
  drawerWidthCollapsed,
  drawerWidthExpanded
} from '../../../store/constant';
import { openDrawer } from '../../../store/slices/menu';

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
  const matchUpLg = useMediaQuery(theme.breakpoints.up('lg'));

  const dispatch = useDispatch();
  const { drawerOpen } = useSelector((state) => state.menu);

  const { sidebarCollapsed, onToggleSidebar } = useConfig();

  // Effective rail width: collapsed only matters at md+ (desktop).
  // Mobile is always the temporary full-width drawer.
  // Between md and lg (900–1199px) there's no room for the full sidebar
  // without crowding content, so force rail mode in that range. User's
  // manual collapse preference still applies at lg+.
  const railCollapsed = matchUpMd && (sidebarCollapsed || !matchUpLg);
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

      {/* Native overflow scrolling — replaces PerfectScrollbar which
          intermittently failed to constrain its scroll height in Chrome,
          causing menu items to bleed through the footer when the menu
          overflowed the viewport. flex: 1 + minHeight: 0 is the standard
          pattern that lets a flex child shrink below its content size. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: railCollapsed ? 1 : 1.5,
          transition: 'padding 200ms ease',
          // Slim, themed scrollbar — only visible when content overflows.
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: (t) =>
              t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)',
            borderRadius: 3
          },
          scrollbarWidth: 'thin'
        }}
      >
        <MenuList />
      </Box>

      <Box
        sx={{
          mt: 'auto',
          position: 'relative',
          zIndex: 1,
          bgcolor: 'background.default',
          borderTop: (t) =>
            t.palette.mode === 'dark'
              ? '1px solid rgba(255,255,255,0.04)'
              : `1px solid ${t.palette.divider}`,
          px: railCollapsed ? 1 : 1.5,
          py: 1
        }}
      >
        {/* Discord + Facebook icons used to live here. They moved into the
            Help nav group so they have a proper home alongside Docs. The
            version chip used to live here too — moved into the avatar
            dropdown to keep the gutter clean. SupportLinks renders its own
            label + divider treatment so it slots between the menu and the
            theme toggle without needing extra chrome. */}
        <SupportLinks variant={railCollapsed ? 'collapsed' : 'expanded'} />

        <Tooltip title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <Box
            component="button"
            type="button"
            onClick={onToggleSidebar}
            sx={{
              // Toggle is only meaningful at lg+, where the user can actually
              // choose between rail and full. Below lg, the rail is forced.
              display: { xs: 'none', lg: 'flex' },
              width: '100%',
              alignItems: 'center',
              // Centers the chevron under the heart icon when the rail is
              // collapsed (label is hidden, so only the chevron remains).
              // Expanded uses the default left-alignment so the chevron sits
              // next to the "Collapse" label with the gap.
              justifyContent: railCollapsed ? 'center' : 'flex-start',
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
