/**
 * <ThemeToggle />
 *
 * One-click switch between light and dark mode. Uses the existing
 * ConfigContext (which already persists to localStorage via `useLocalStorage`),
 * so no extra plumbing is needed — drop it anywhere in the tree under the
 * ConfigProvider and it works.
 *
 * Place it in:
 *   - Marketing nav (apps/ui/src/ui-component/extended/AppBar.jsx or
 *     apps/ui/src/views/pages/landing/Header.jsx near the Sign-in button).
 *   - Control panel topbar (apps/ui/src/layout/MainLayout/Header/index.jsx
 *     in the header action cluster).
 *
 * Variants:
 *   - <ThemeToggle />              icon-only button (default)
 *   - <ThemeToggle variant="rail"> compact label + icon, for sidebar footer
 */

import PropTypes from 'prop-types';
import { IconButton, Tooltip, Stack, Typography } from '@mui/material';
import { IconSun, IconMoon } from '@tabler/icons-react';

import useConfig from '../../hooks/useConfig';

const ThemeToggle = ({ variant = 'icon', size = 20, sx }) => {
  const { navType = 'dark', onChangeMenuType } = useConfig() || {};
  const isDark = navType === 'dark';
  const next = isDark ? 'light' : 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const handleClick = () => {
    if (typeof onChangeMenuType === 'function') onChangeMenuType(next);
  };

  if (variant === 'rail') {
    return (
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={handleClick}
        role="button"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
        sx={{
          cursor: 'pointer',
          color: 'text.muted',
          px: 2.5,
          py: 1,
          borderRadius: 1,
          transition: (theme) => theme.transitions.create(['color', 'background-color']),
          '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
          ...sx
        }}
      >
        {isDark ? <IconSun size={size} /> : <IconMoon size={size} />}
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </Typography>
      </Stack>
    );
  }

  return (
    <Tooltip title={label} arrow>
      <IconButton
        onClick={handleClick}
        aria-label={label}
        size="small"
        sx={{
          color: 'text.secondary',
          '&:hover': { color: 'text.primary' },
          ...sx
        }}
      >
        {isDark ? <IconSun size={size} /> : <IconMoon size={size} />}
      </IconButton>
    </Tooltip>
  );
};

ThemeToggle.propTypes = {
  variant: PropTypes.oneOf(['icon', 'rail']),
  size: PropTypes.number,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func])
};

export default ThemeToggle;
