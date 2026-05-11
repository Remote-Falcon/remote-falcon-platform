import * as React from 'react';

import { Box } from '@mui/material';
import { IconSearch } from '@tabler/icons-react';

import { COMMAND_PALETTE_OPEN_EVENT } from '../../../ui-component/CommandPalette';

// Topbar search-trigger chip per the v2 mockup. Click opens the global
// CommandPalette (mounted at MainLayout level) via a dispatched event;
// the palette also listens for ⌘K / Ctrl+K directly.
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const SearchTrigger = () => {
  const open = () => window.dispatchEvent(new Event(COMMAND_PALETTE_OPEN_EVENT));

  return (
    <Box
      component="button"
      type="button"
      onClick={open}
      sx={{
        display: { xs: 'none', md: 'inline-flex' },
        alignItems: 'center',
        gap: 1,
        px: 1.25,
        py: 0.5,
        minWidth: 200,
        borderRadius: 1,
        border: (t) =>
          `1px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
        bgcolor: (t) =>
          t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        color: 'text.secondary',
        cursor: 'pointer',
        fontSize: 14,
        '&:hover': {
          bgcolor: (t) =>
            t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
        }
      }}
      aria-label="Open command palette"
    >
      <IconSearch size={16} stroke={1.75} />
      <Box component="span" sx={{ flexGrow: 1, textAlign: 'left' }}>
        Search…
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: 12,
          px: 0.75,
          py: 0.125,
          borderRadius: 0.75,
          bgcolor: (t) =>
            t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
        }}
      >
        {isMac ? '⌘K' : 'Ctrl K'}
      </Box>
    </Box>
  );
};

export default SearchTrigger;
