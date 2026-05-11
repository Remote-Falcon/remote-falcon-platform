import * as React from 'react';

import { Box, CircularProgress, Fade, Stack, Typography } from '@mui/material';
import { IconAlertCircle, IconCheck, IconPencil } from '@tabler/icons-react';
import PropTypes from 'prop-types';

// Bottom-right floating pill that mirrors useAutoSave's status. Sits on
// top of `<MainLayout>` content and pins to the viewport so it follows
// the user as they scroll long settings forms.
//
// 'idle'   → hidden
// 'dirty'  → "Unsaved changes" (pencil)
// 'saving' → "Saving…" (spinner)
// 'saved'  → "Saved" (check, auto-fades from useAutoSave)
// 'error'  → "Couldn't save — try again" (alert, sticks until next edit)
const STATUS_CONFIG = {
  dirty: {
    icon: <IconPencil size={16} stroke={1.75} />,
    label: 'Unsaved changes',
    bg: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
    color: 'text.primary'
  },
  saving: {
    icon: <CircularProgress size={14} thickness={5} />,
    label: 'Saving…',
    bg: (t) => (t.palette.mode === 'dark' ? 'rgba(33,150,243,0.18)' : 'rgba(33,150,243,0.12)'),
    color: 'primary.main'
  },
  saved: {
    icon: <IconCheck size={16} stroke={2} />,
    label: 'Saved',
    bg: (t) => (t.palette.mode === 'dark' ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.14)'),
    color: 'success.main'
  },
  error: {
    icon: <IconAlertCircle size={16} stroke={1.75} />,
    label: "Couldn't save — try again",
    bg: (t) => (t.palette.mode === 'dark' ? 'rgba(244,67,54,0.18)' : 'rgba(244,67,54,0.12)'),
    color: 'error.main'
  }
};

const StickyFormBar = ({ status }) => {
  const config = STATUS_CONFIG[status];
  const visible = !!config;

  return (
    <Fade in={visible} unmountOnExit>
      <Box
        role="status"
        aria-live="polite"
        sx={{
          position: 'fixed',
          right: { xs: 16, md: 32 },
          bottom: { xs: 16, md: 24 },
          zIndex: (t) => t.zIndex.snackbar
        }}
      >
        {config && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              px: 1.75,
              py: 1,
              borderRadius: 999,
              bgcolor: config.bg,
              color: config.color,
              backdropFilter: 'blur(8px)',
              boxShadow: 2
            }}
          >
            {config.icon}
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {config.label}
            </Typography>
          </Stack>
        )}
      </Box>
    </Fade>
  );
};

StickyFormBar.propTypes = {
  status: PropTypes.oneOf(['idle', 'dirty', 'saving', 'saved', 'error'])
};

export default StickyFormBar;
