import * as React from 'react';

import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

// Canonical "is live" indicator. Pulled from three different ad-hoc
// implementations across the Dashboard (PageHead eyebrow, NowPlayingCard
// header, LiveStatsRow Viewers tile). One component, three sizes:
//
//   xs (5px dot)   — inline next to other inline text
//   sm (7px dot + 3px halo) — PageHead eyebrow context
//   md (8px dot)   — card-header context
//
// Pass `label` to add text beside the dot. Without a label, render is
// dot-only. Inactive state shows a muted disabled dot.
const SIZES = {
  xs: { dot: 5, halo: 0 },
  sm: { dot: 7, halo: 3 },
  md: { dot: 8, halo: 0 }
};

const LiveIndicator = ({ active = true, size = 'sm', label, color = 'success.main' }) => {
  const cfg = SIZES[size] || SIZES.sm;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box
        component="span"
        sx={{
          width: cfg.dot,
          height: cfg.dot,
          borderRadius: '50%',
          bgcolor: active ? color : 'text.disabled',
          boxShadow: active && cfg.halo > 0
            ? (t) => `0 0 0 ${cfg.halo}px ${alpha(t.palette.success.main, 0.18)}`
            : 'none'
        }}
      />
      {label && (
        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'lowercase' }}>
          {label}
        </Typography>
      )}
    </Stack>
  );
};

LiveIndicator.propTypes = {
  active: PropTypes.bool,
  size: PropTypes.oneOf(['xs', 'sm', 'md']),
  label: PropTypes.node,
  color: PropTypes.string
};

export default LiveIndicator;
