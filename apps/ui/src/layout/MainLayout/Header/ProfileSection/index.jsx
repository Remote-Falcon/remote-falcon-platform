import { useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';

import {
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { IconLogout } from '@tabler/icons-react';
import md5 from 'md5';

import { VERSION } from '../../../../config';
import useAuth from '../../../../hooks/useAuth';
import { useSelector } from '../../../../store';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';

// v2 identity menu — slim popover that owns identity-only concerns.
// Navigation (Account Settings, Tracker, Docs) lives in the sidebar now.
// Show URL actions (open / copy) moved to the Dashboard's "View Public
// Page" split button — this menu is identity-only.
// What stays here:
//   • Header card: name / email
//   • Stop Impersonating (admin support tool, only when active)
//   • Sign out
const ProfileSection = () => {
  const { logout, isDemo } = useAuth();
  const { show } = useSelector((state) => state.show);

  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const gravatar = useMemo(() => {
    const hashedEmail = show?.email ? md5(show.email, { encoding: 'binary' }) : '';
    return `//www.gravatar.com/avatar/${hashedEmail}?r=pg&d=identicon`;
  }, [show?.email]);

  useEffect(() => {
    setIsImpersonating(!!localStorage.getItem('isImpersonating'));
  }, [open]);

  const fullName = [show?.userProfile?.firstName, show?.userProfile?.lastName].filter(Boolean).join(' ') || show?.showName;

  const handleClose = () => setOpen(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      // logout() can throw if already-expired session — fine to ignore
      console.error(err);
    }
  };

  const stopImpersonating = () => {
    trackPosthogEvent('impersonation_stopped', {
      source: 'profile_menu',
      target_show_subdomain: show?.showSubdomain
    });
    localStorage.removeItem('isImpersonating');
    localStorage.removeItem('impersonationServiceToken');
    window.location.reload();
  };

  return (
    <>
      <Tooltip title={fullName || 'Account'}>
        <IconButton
          ref={anchorRef}
          onClick={() => setOpen((v) => !v)}
          aria-label="Open account menu"
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          sx={{
            p: 0.25,
            border: (t) =>
              isImpersonating
                ? `2px solid ${t.palette.warning.main}`
                : `2px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            transition: 'border-color 150ms ease',
            '&:hover': { borderColor: (t) => t.palette.primary.main }
          }}
        >
          <Avatar src={gravatar} alt="" sx={{ width: 32, height: 32 }} />
        </IconButton>
      </Tooltip>

      <Menu
        id="account-menu"
        anchorEl={anchorRef.current}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 280,
            borderRadius: 2,
            border: (t) =>
              t.palette.mode === 'dark'
                ? '1px solid rgba(255,255,255,0.06)'
                : `1px solid ${t.palette.divider}`,
            boxShadow: (t) =>
              t.palette.mode === 'dark'
                ? '0 8px 24px rgba(0,0,0,0.5)'
                : '0 8px 24px rgba(0,0,0,0.12)'
          }
        }}
      >
        {/* Identity card — read-only header. Not a menu item, not focusable. */}
        <Box sx={{ px: 2, py: 1.5 }} tabIndex={-1}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar src={gravatar} alt="" sx={{ width: 40, height: 40 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
                {fullName}
              </Typography>
              {show?.email && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                  {show.email}
                </Typography>
              )}
            </Box>
          </Stack>

          {isImpersonating && (
            <Button
              fullWidth
              size="small"
              variant="contained"
              color="warning"
              onClick={stopImpersonating}
              sx={{ mt: 1.5 }}
            >
              Stop Impersonating
            </Button>
          )}
        </Box>

        <Divider />

        <MenuItem onClick={() => { handleClose(); handleLogout(); }}>
          <ListItemIcon>
            <IconLogout size={18} stroke={1.75} />
          </ListItemIcon>
          <ListItemText primary="Sign out" />
        </MenuItem>

        {/* Version line — non-interactive caption pinned to the bottom of
            the menu. Used to live as a chip in the sidebar footer but moved
            here so the sidebar gutter stays uncluttered. */}
        <Divider sx={{ my: 0.5 }} />
        <Box sx={{ px: 2, py: 1, textAlign: 'center' }} tabIndex={-1}>
          <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: '0.04em' }}>
            {isDemo ? `DEMO · ${VERSION}` : VERSION}
          </Typography>
        </Box>
      </Menu>
    </>
  );
};

export default ProfileSection;
