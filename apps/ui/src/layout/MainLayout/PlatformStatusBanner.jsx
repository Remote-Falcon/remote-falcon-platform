import { useEffect, useState } from 'react';

import { Box, Link, Stack, Typography } from '@mui/material';
import { IconAlertTriangle, IconTool } from '@tabler/icons-react';

import { STATUS_PAGE_URL, fetchPlatformStatus } from '../../utils/platformStatus';

// The status page checks every 3 minutes, so polling faster buys nothing.
export const POLL_MS = 3 * 60 * 1000;

// Fixed colors, same reasoning as ImpersonationBanner: theme warning/error
// palettes fail AA with white text in dark mode. Outage uses brand red 700,
// degraded and maintenance use the impersonation banner's dark amber.
const OUTAGE_BG = '#a8182a';
const WARN_BG = '#a06b00';
const BANNER_FG = '#ffffff';

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

// Top-of-viewport notice shown while status.remotefalcon.com reports a
// problem, so an owner seeing a broken viewer page or a disconnected plugin
// knows it is RF and not their setup. Renders nothing when everything is up
// or the feed can't be read (the last known state is kept on a failed poll).
const PlatformStatusBanner = () => {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      if (isHidden()) return;
      fetchPlatformStatus()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    // poll() skips while hidden, so this only fires a fetch on becoming visible.
    document.addEventListener('visibilitychange', poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, []);

  if (!status || (status.state === 'operational' && status.affected.length === 0)) return null;

  const maintenance = status.state === 'maintenance';
  const services = status.affected.join(', ');
  let message;
  if (maintenance) {
    message = services ? `Scheduled maintenance: ${services}.` : 'Scheduled maintenance in progress.';
  } else {
    message = services
      ? `Remote Falcon is having trouble with ${services}. This isn't caused by your show.`
      : "Remote Falcon is having trouble right now. This isn't caused by your show.";
  }
  const Icon = maintenance ? IconTool : IconAlertTriangle;

  return (
    <Box
      role="status"
      aria-live="polite"
      data-testid="platform-status-banner"
      sx={{
        // Not sticky: ImpersonationBanner already is, and two sticky bars at
        // top: 0 would overlap. The z-index keeps it above the Drawer.
        position: 'relative',
        zIndex: (t) => t.zIndex.drawer + 2,
        bgcolor: status.state === 'downtime' ? OUTAGE_BG : WARN_BG,
        color: BANNER_FG
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1 }}>
        <Icon size={20} stroke={2.25} style={{ flexShrink: 0 }} />
        <Typography variant="body2" sx={{ color: BANNER_FG, fontWeight: 600, lineHeight: 1.4, minWidth: 0 }}>
          {message}{' '}
          <Link
            href={STATUS_PAGE_URL}
            target="_blank"
            rel="noopener"
            sx={{ color: BANNER_FG, fontWeight: 700, textDecorationColor: 'currentColor' }}
          >
            Follow updates on the status page
          </Link>
        </Typography>
      </Stack>
    </Box>
  );
};

export default PlatformStatusBanner;
