import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Box, Button, Stack, Typography } from '@mui/material';
import { IconAlertTriangle } from '@tabler/icons-react';

import { useSelector } from '../../store';
import { trackPosthogEvent } from '../../utils/analytics/posthog';

const readImpersonating = () => !!localStorage.getItem('isImpersonating');

// Fixed amber/white instead of theme-derived. The theme's warning palette
// is pale yellow (#ffe57f) in dark mode — white text on that fails AA.
// A locked color combo also keeps the warning identical across light/dark
// so muscle memory works regardless of mode.
const BANNER_BG = '#a06b00';   // dark amber — readable with white text
const BANNER_FG = '#ffffff';
const BANNER_LINE = '#5c3d00'; // border / shadow accent

// Top-of-viewport warning bar + 4-side viewport frame that render whenever
// the admin support "Impersonate" flow is active. AccountDetails sets
// `isImpersonating` right before navigating, so we re-check on every route
// change. The frame is a fixed, non-interactive overlay so it survives
// scrolling without competing with the page layout.
const ImpersonationBanner = () => {
  const location = useLocation();
  const { show } = useSelector((state) => state.show);
  const [active, setActive] = useState(readImpersonating);

  useEffect(() => {
    setActive(readImpersonating());
  }, [location.pathname, show?.email]);

  useEffect(() => {
    const onStorage = () => setActive(readImpersonating());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!active) return null;

  const stop = () => {
    trackPosthogEvent('impersonation_stopped', {
      source: 'banner',
      target_show_subdomain: show?.showSubdomain
    });
    localStorage.removeItem('isImpersonating');
    localStorage.removeItem('impersonationServiceToken');
    window.location.reload();
  };

  const identity = show?.showName || 'another show';
  const email = show?.email ? ` · ${show.email}` : '';

  return (
    <>
      <Box
        role="status"
        aria-live="polite"
        data-testid="impersonation-banner"
        sx={{
          position: 'sticky',
          top: 0,
          // Above the Drawer (1200) so the full message — including the
          // "IMPERSONATING — <show name>" prefix — is visible across the
          // sidebar's column instead of being clipped on the left.
          zIndex: (t) => t.zIndex.drawer + 2,
          bgcolor: BANNER_BG,
          color: BANNER_FG,
          borderBottom: `2px solid ${BANNER_LINE}`,
          boxShadow: `0 4px 12px rgba(0,0,0,0.35)`
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          spacing={{ xs: 1, sm: 1.5 }}
          sx={{ px: 2, py: 1 }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1, minWidth: 0 }}>
            <IconAlertTriangle size={20} stroke={2.25} />
            <Typography
              variant="body2"
              sx={{
                // MUI Typography doesn't inherit CSS `color` from a parent
                // Box — it pulls from theme.palette.text.* per variant. Set
                // explicitly so the banner stays legible in BOTH themes.
                color: BANNER_FG,
                fontWeight: 700,
                letterSpacing: '0.04em',
                lineHeight: 1.4,
                minWidth: 0,
                flexGrow: 1
              }}
            >
              IMPERSONATING — {identity}
              {email} · changes will affect that account
            </Typography>
          </Stack>
          <Button
            size="small"
            variant="contained"
            onClick={stop}
            sx={{
              alignSelf: { xs: 'stretch', sm: 'center' },
              whiteSpace: 'nowrap',
              bgcolor: BANNER_LINE,
              color: BANNER_FG,
              '&:hover': { bgcolor: '#3d2900' }
            }}
          >
            Stop Impersonating
          </Button>
        </Stack>
      </Box>

      {/* Fixed-position 4-side frame around the whole viewport. Non-
          interactive so it never blocks clicks. Sits at the same z-layer
          as the banner so it shows over the Drawer's left edge too. */}
      <Box
        aria-hidden
        sx={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: (t) => t.zIndex.drawer + 1,
          border: `4px solid ${BANNER_BG}`
        }}
      />
    </>
  );
};

export default ImpersonationBanner;
