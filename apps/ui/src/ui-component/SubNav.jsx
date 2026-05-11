import * as React from 'react';

import { Box, Stack } from '@mui/material';
import PropTypes from 'prop-types';
import { NavLink, useLocation } from 'react-router-dom';

// v2 horizontal sub-nav pattern. Sits below the PageHead on any page that
// has multiple sub-views (settings, admin, templates, etc.). Each item is
// a pill-shaped router NavLink — clicking changes the URL, browser back
// works, and ⌘K can target each sub-view directly because they're real
// routes.
//
// Search-string preservation: sub-tab navigation carries the current
// query string forward (`?range=last-christmas`, `?group=Trans-Siberian`,
// etc.) so picking a date range on Analytics → Overview keeps the same
// range when you click into Audience or Sequences. Without this, the
// fresh URL strips the params and useSearchParams falls back to defaults.
//
// Items shape:
//   { label: 'Viewer Control', to: '/control-panel/settings/viewer-control' }
const SubNav = ({ items }) => {
  const location = useLocation();
  return (
  <Box
    sx={{
      mb: 3,
      borderBottom: (t) =>
        t.palette.mode === 'dark'
          ? '1px solid rgba(255,255,255,0.04)'
          : `1px solid ${t.palette.divider}`
    }}
  >
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        overflowX: 'auto',
        pb: 0,
        // Hide native scrollbar — the chevron-style horizontal-scroll is
        // distracting next to a pill row.
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none'
      }}
    >
      {items.map((item) => (
        <Box
          key={item.to}
          component={NavLink}
          to={{ pathname: item.to, search: location.search }}
          end={item.end}
          sx={{
            position: 'relative',
            px: 2,
            py: 1.25,
            fontSize: 14,
            fontWeight: 500,
            color: 'text.secondary',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            borderBottom: '2px solid transparent',
            mb: '-1px',
            transition: 'color 150ms ease, border-color 150ms ease',
            '&:hover': { color: 'text.primary' },
            '&.active': {
              color: 'text.primary',
              borderBottomColor: (t) => t.palette.warning.main
            }
          }}
        >
          {item.label}
        </Box>
      ))}
    </Stack>
  </Box>
  );
};

SubNav.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string.isRequired,
      end: PropTypes.bool
    })
  ).isRequired
};

export default SubNav;
