import React, { useState } from 'react';

import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar as MuiAppBar,
  Box,
  Button,
  Chip,
  Container,
  Drawer,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { IconBolt, IconBook, IconChevronRight, IconLogin, IconMap, IconUsers } from '@tabler/icons-react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';

import Logo from '../../design-system/components/Logo';
import ThemeToggle from '../../design-system/components/ThemeToggle';

// Marketing nav structure. Anchor links use the full path (`/#features`)
// so they navigate to landing AND scroll, even when the user is already
// on /privacy-policy / /terms-and-conditions / /owners. `external: true`
// links open in a new tab.
const NAV_LINKS = [
  { label: 'Features',  href: '/#features',                                         icon: IconBolt },
  { label: 'Shows Map', href: '/#shows-map',                                        icon: IconMap, badge: 'Soon' },
  { label: 'Docs',      href: 'https://docs.remotefalcon.com',         external: true, icon: IconBook },
  { label: 'Community', href: 'https://www.facebook.com/groups/remotefalcon', external: true, icon: IconUsers }
];

const SoonBadge = (props) => (
  <Chip
    {...props}
    label="Soon"
    size="small"
    sx={{
      ml: 1,
      height: 18,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.18),
      color: 'secondary.main',
      border: (theme) => `1px solid ${alpha(theme.palette.secondary.main, 0.32)}`,
      '& .MuiChip-label': { px: '6px' },
      ...(props?.sx || {})
    }}
  />
);

const NavButton = ({ link }) => {
  const linkProps = link.external
    ? { component: Link, href: link.href, target: '_blank', rel: 'noopener' }
    : { component: 'a', href: link.href };
  return (
    <Button {...linkProps} color="inherit" sx={{ textTransform: 'none', fontWeight: 500, px: 1.5 }}>
      {link.label}
      {link.badge && <SoonBadge />}
    </Button>
  );
};

NavButton.propTypes = { link: PropTypes.object.isRequired };

// `variant` controls how much chrome the bar shows.
//   "full" (default) → marketing nav + Sign In/Up + ThemeToggle (+ mobile drawer)
//   "auth"           → only the lockup + ThemeToggle. Used by AuthShell so the
//                      bar — and the brand inside it — stays in the exact same
//                      DOM node and pixel position when navigating between
//                      landing and signin/signup.
const AppBar = ({ variant = 'full', ...others }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const openDrawer = () => setDrawerOpen(true);

  const isFull = variant === 'full';

  return (
    <MuiAppBar
      {...others}
      position="sticky"
      elevation={0}
      sx={{
        // Always-on glass effect — not scroll-triggered. Alpha is high
        // (0.92) so text behind the sticky bar doesn't bleed through and
        // tank readability; the blur still softens the seam at the edge.
        backdropFilter: 'blur(14px) saturate(150%)',
        WebkitBackdropFilter: 'blur(14px) saturate(150%)',
        backgroundColor: (theme) => alpha(theme.palette.background.default, 0.92),
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary'
      }}
    >
      <Container>
        <Toolbar disableGutters sx={{ minHeight: 96, gap: 2 }}>
          <RouterLink to="/" aria-label="Remote Falcon home" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Logo variant="lockup" markSize={72} wordmarkSize={22} />
          </RouterLink>

          {/* Middle nav — desktop only, full variant only */}
          {isFull && (
            <Stack
              direction="row"
              alignItems="center"
              sx={{ display: { xs: 'none', md: 'flex' }, ml: 2 }}
              spacing={0.5}
            >
              {NAV_LINKS.map((link) => (
                <NavButton key={link.label} link={link} />
              ))}
            </Stack>
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* Right side. In auth variant the ThemeToggle is the only item and
              must remain reachable on every breakpoint (no mobile drawer). */}
          <Stack
            direction="row"
            alignItems="center"
            sx={{ display: isFull ? { xs: 'none', sm: 'flex' } : 'flex' }}
            spacing={1.5}
          >
            <ThemeToggle />
            {isFull && (
              <>
                <Button id="appbar-signin" color="inherit" component={RouterLink} to="/signin">
                  Sign In
                </Button>
                <Button id="appbar-signup" component={RouterLink} to="/signup" disableElevation variant="contained" color="secondary">
                  Sign Up
                </Button>
              </>
            )}
          </Stack>

          {/* Mobile drawer — full variant only */}
          {isFull && (
            <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
              <IconButton color="inherit" onClick={openDrawer} size="large" aria-label="Open menu">
                <MenuIcon />
              </IconButton>
              <Drawer anchor="top" open={drawerOpen} onClose={closeDrawer}>
                <Box sx={{ width: 'auto' }} role="presentation" onClick={closeDrawer} onKeyDown={closeDrawer}>
                  <List>
                    {NAV_LINKS.map((link) => {
                      const Icon = link.icon;
                      const itemProps = link.external
                        ? { component: 'a', href: link.href, target: '_blank', rel: 'noopener' }
                        : { component: 'a', href: link.href };
                      return (
                        <ListItemButton key={link.label} {...itemProps}>
                          <ListItemIcon><Icon /></ListItemIcon>
                          <ListItemText primary={link.label} />
                          {link.badge && <SoonBadge />}
                        </ListItemButton>
                      );
                    })}
                    <ListItemButton component="a" href="/signin">
                      <ListItemIcon><IconLogin /></ListItemIcon>
                      <ListItemText primary="Sign In" />
                    </ListItemButton>
                    <ListItemButton component="a" href="/signup">
                      <ListItemIcon><IconChevronRight /></ListItemIcon>
                      <ListItemText primary="Sign Up" />
                    </ListItemButton>
                    <ThemeToggle variant="rail" />
                  </List>
                </Box>
              </Drawer>
            </Box>
          )}
        </Toolbar>
      </Container>
    </MuiAppBar>
  );
};

AppBar.propTypes = {
  variant: PropTypes.oneOf(['full', 'auth'])
};

export default AppBar;
