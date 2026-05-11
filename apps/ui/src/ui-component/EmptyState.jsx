import * as React from 'react';

import { Box, Button, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

// v2 empty-state pattern per the dashboard mockup. Drop into any page
// where async data resolved to nothing — a borderless card now looks
// like an unstyled gap, so empty surfaces need their own affordance.
//
// Centered, generous vertical padding, optional icon + CTA. Pair with a
// Skeleton during the loading phase, then swap to <EmptyState> when
// the response is empty.
const EmptyState = ({ icon, title, description, cta, sx = {} }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      py: { xs: 6, md: 10 },
      px: 3,
      ...sx
    }}
  >
    <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420 }}>
      {icon && (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
            color: 'text.secondary'
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h4" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {description}
        </Typography>
      )}
      {cta && (
        <Button variant="contained" color="primary" onClick={cta.onClick} sx={{ mt: 1 }}>
          {cta.label}
        </Button>
      )}
    </Stack>
  </Box>
);

EmptyState.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  cta: PropTypes.shape({
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired
  }),
  sx: PropTypes.object
};

export default EmptyState;
