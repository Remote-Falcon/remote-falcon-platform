import React, { useMemo, useState } from 'react';

import { Alert, AppBar, Box, Container, CssBaseline, Modal, Toolbar, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Outlet } from 'react-router-dom';

import useConfig from '../../hooks/useConfig';
import { useDispatch, useSelector } from '../../store';
import { openDrawer } from '../../store/slices/menu';
import CommandPalette from '../../ui-component/CommandPalette';

import Header from './Header';
import Sidebar from './Sidebar';
import WhatsNew from './WhatsNew.modal';
import _ from 'lodash';

// v2 layout: full-height sidebar (logo at top, footer at bottom) with the
// AppBar living inside the content column — not spanning the viewport.
// This matches the mockup's `.app` CSS grid (rail | content), where the
// topbar starts after the rail and only spans the content area.
const MainLayout = () => {
  const theme = useTheme();
  // Drawer is persistent (open) at md+ and switches to temporary
  // (closed, opened via the header hamburger) below md. Sidebar handles
  // auto-railing between md and lg internally.
  const matchDownMd = useMediaQuery(theme.breakpoints.down('md'));

  const dispatch = useDispatch();
  const { drawerOpen } = useSelector((state) => state.menu);
  const { container } = useConfig();
  const { show } = useSelector((state) => state.show);

  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);

  const newStuffDateString = '2023-11-21';
  const newStuffDate = Date.parse(newStuffDateString);

  React.useEffect(() => {
    checkErrorsAndWarnings();
    dispatch(openDrawer(!matchDownMd));
    const whatsNewDateViewed = window.localStorage.getItem('whatsNew');
    if (!whatsNewDateViewed || newStuffDate > Date.parse(whatsNewDateViewed)) {
      setWhatsNewOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchDownMd, show]);

  // 56px topbar height comes from `theme.mixins.toolbar` in
  // themes/index.jsx. Toolbar is sticky inside the content column so it
  // stays visible as the user scrolls long pages.
  const header = useMemo(
    () => (
      <Toolbar>
        <Header />
      </Toolbar>
    ),
    []
  );

  const closeWhatsNew = () => {
    window.localStorage.setItem('whatsNew', newStuffDateString);
    setWhatsNewOpen(false);
  };

  const checkErrorsAndWarnings = () => {
    setErrors([]);
    setWarnings([]);
    if (show?.preferences?.locationCheckMethod === 'GEO' && !show?.preferences?.allowedRadius) {
      setErrors((prev) => [...prev, 'Check Radius is not set.']);
    }
    if (!show?.pages || show?.pages?.length === 0) {
      setErrors((prev) => [...prev, 'No Viewer Pages have been created.']);
    }
    if (show?.preferences?.viewerPageViewOnly) {
      setWarnings((prev) => [...prev, 'Viewer Page is set to View Only.']);
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />

      <Sidebar />

      {/* Content column — owns its own AppBar, scrollable main area */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          bgcolor: theme.palette.background.default
        }}
      >
        <AppBar
          enableColorOnDark
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{
            top: 0,
            bgcolor: theme.palette.background.default,
            // Dark mode: nearly-invisible hairline. Bright `palette.divider`
            // values create a "stitched panes" look that the v2 mockup
            // deliberately avoids. Light mode still gets a visible line
            // for separation against the lighter content bg.
            borderBottom: (t) =>
              t.palette.mode === 'dark'
                ? '1px solid rgba(255,255,255,0.04)'
                : `1px solid ${t.palette.divider}`
          }}
        >
          {header}
        </AppBar>

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            p: { xs: 2, md: 3 }
          }}
        >
          {_.map(errors, (err, index) => (
            <Alert key={index} severity="error" sx={{ mb: 1 }}>
              {err}
            </Alert>
          ))}
          {_.map(warnings, (warn, index) => (
            <Alert key={index} severity="warning" sx={{ mb: 1 }}>
              {warn}
            </Alert>
          ))}

          <Modal open={whatsNewOpen} aria-labelledby="simple-modal-title" aria-describedby="simple-modal-description">
            <WhatsNew handleClose={() => closeWhatsNew()} />
          </Modal>

          {container ? (
            <Container maxWidth="lg" disableGutters>
              <Outlet />
            </Container>
          ) : (
            <Outlet />
          )}
        </Box>
      </Box>

      <CommandPalette />
    </Box>
  );
};

export default MainLayout;
