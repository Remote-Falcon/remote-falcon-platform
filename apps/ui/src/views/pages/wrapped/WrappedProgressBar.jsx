import * as React from 'react';

import { Box, Stack } from '@mui/material';
import PropTypes from 'prop-types';

// Spotify-Wrapped-style segmented progress bar pinned to the top of the
// page. One segment per slide. Past slides are full, current slide
// animates from 0%→100% over its duration, future slides are empty.
// Each segment is clickable to jump.
//
// Props:
//   total   — number of slides
//   current — index of the active slide
//   progress — 0..1 progress within the current slide (driven by the parent's timer)
//   paused  — when true, the active segment freezes at its current width
//   onJump  — (index) => void
const WrappedProgressBar = ({ total, current, progress, paused, onJump, accent }) => (
  <Box
    data-testid="wrapped-progressbar"
    sx={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      px: { xs: 2, md: 3 },
      pt: { xs: 1.5, md: 2 },
      pb: 1.5,
      zIndex: 10,
      pointerEvents: 'none'
    }}
  >
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ width: '100%', pointerEvents: 'auto' }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const fill = i < current ? 1 : i === current ? progress : 0;
        return (
          <Box
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              onJump(i);
            }}
            sx={{
              flex: 1,
              height: 3,
              borderRadius: 999,
              cursor: 'pointer',
              bgcolor: 'rgba(255,255,255,0.18)',
              overflow: 'hidden',
              transition: 'height 150ms ease',
              '&:hover': { height: 5 }
            }}
          >
            <Box
              sx={{
                height: '100%',
                width: `${Math.max(0, Math.min(1, fill)) * 100}%`,
                bgcolor: accent,
                transition: i === current && !paused ? 'width 100ms linear' : 'width 250ms ease'
              }}
            />
          </Box>
        );
      })}
    </Stack>
  </Box>
);

WrappedProgressBar.propTypes = {
  total: PropTypes.number.isRequired,
  current: PropTypes.number.isRequired,
  progress: PropTypes.number.isRequired,
  paused: PropTypes.bool,
  onJump: PropTypes.func.isRequired,
  accent: PropTypes.string.isRequired
};

export default WrappedProgressBar;
