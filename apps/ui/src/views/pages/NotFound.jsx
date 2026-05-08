import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link as RouterLink } from 'react-router-dom';

import jukebox from '../../../public/jukebox.png';
import AppBar from '../../ui-component/extended/AppBar';

// Songs spilling out of a tipped-over jukebox: each note drifts down
// and sideways, rotates a bit, fades. CSS custom properties on inline
// sx control per-note drift/rotation so we can have ~10 notes on
// different trajectories from the same single keyframe.
const spill = keyframes`
  0%   { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  12%  { opacity: 1; }
  100% { transform: translate(var(--drift, 60px), 240px) rotate(var(--rot, 80deg)); opacity: 0; }
`;

// 10 notes spread across the jukebox top, mixing brand tones and
// staggered delays so the cascade reads as continuous, not ticked.
const NOTES = [
  { char: '♪', tone: 'primary',   left: '24%', drift:  60, rot:  60, size: 22, dur: 4.4, delay: 0    },
  { char: '♫', tone: 'secondary', left: '34%', drift: -50, rot: -90, size: 28, dur: 5.2, delay: 0.6  },
  { char: '♬', tone: 'error',     left: '44%', drift:  80, rot:  90, size: 20, dur: 4.6, delay: 1.2  },
  { char: '♩', tone: 'primary',   left: '54%', drift:  20, rot:  40, size: 24, dur: 5.6, delay: 1.8  },
  { char: '♪', tone: 'secondary', left: '64%', drift: -70, rot: -60, size: 18, dur: 4.8, delay: 0.4  },
  { char: '♫', tone: 'error',     left: '74%', drift:  30, rot:  50, size: 26, dur: 5.4, delay: 2.4  },
  { char: '♬', tone: 'primary',   left: '30%', drift: -30, rot: -50, size: 22, dur: 4.2, delay: 1.0  },
  { char: '♩', tone: 'secondary', left: '60%', drift:  50, rot:  70, size: 20, dur: 5.8, delay: 1.6  },
  { char: '♪', tone: 'error',     left: '40%', drift: -20, rot: -30, size: 24, dur: 5.0, delay: 2.0  },
  { char: '♫', tone: 'primary',   left: '70%', drift:  10, rot:  20, size: 18, dur: 4.6, delay: 0.8  }
];

const SpillingJukebox = () => (
  <Box
    aria-hidden
    sx={{
      position: 'relative',
      width: 240,
      height: 260,
      mx: 'auto',
      pointerEvents: 'none'
    }}
  >
    {/* Falling notes — start near the jukebox lid (top ~30px) */}
    {NOTES.map((n, i) => (
      <Box
        key={i}
        component="span"
        sx={{
          position: 'absolute',
          top: 30,
          left: n.left,
          fontSize: n.size,
          fontWeight: 700,
          lineHeight: 1,
          color: `${n.tone}.main`,
          textShadow: (theme) =>
            `0 0 8px ${alpha(theme.palette[n.tone].main, 0.45)}`,
          '--drift': `${n.drift}px`,
          '--rot': `${n.rot}deg`,
          animation: `${spill} ${n.dur}s ease-in ${n.delay}s infinite`,
          willChange: 'transform, opacity'
        }}
      >
        {n.char}
      </Box>
    ))}

    {/* Tilted jukebox — sits under the falling notes */}
    <Box
      component="img"
      src={jukebox}
      alt=""
      sx={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%) rotate(-9deg)',
        width: 150,
        height: 'auto',
        filter: 'drop-shadow(0 14px 28px rgba(239,43,61,0.30))'
      }}
    />
  </Box>
);

const NotFound = () => (
  <Box sx={{ overflowX: 'hidden', minHeight: '100vh', bgcolor: 'background.default', position: 'relative' }}>
    <AppBar />

    {/* Soft brand orb behind the message */}
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: '0 0 auto 0',
        height: '70vh',
        pointerEvents: 'none',
        zIndex: 0,
        filter: 'blur(40px)',
        opacity: (theme) => (theme.palette.mode === 'dark' ? 1 : 0.6),
        background: (theme) => `
          radial-gradient(circle at 30% 50%, ${alpha(theme.palette.primary.main, 0.18)}, transparent 50%),
          radial-gradient(circle at 70% 40%, ${alpha(theme.palette.secondary.main, 0.16)}, transparent 55%)
        `
      }}
    />

    <Container
      maxWidth="sm"
      sx={{
        position: 'relative',
        zIndex: 1,
        minHeight: 'calc(100vh - 96px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Stack spacing={3} alignItems="center" textAlign="center" sx={{ py: 6 }}>
        <SpillingJukebox />
        <Typography
          sx={{
            color: 'secondary.main',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase'
          }}
        >
          404 — Page not found
        </Typography>
        <Typography
          variant="h1"
          component="h1"
          sx={{
            fontSize: { xs: '2.5rem', md: '3.5rem' },
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            maxWidth: '14ch'
          }}
        >
          Looks like you took a wrong turn.
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ fontSize: 17, lineHeight: 1.6, maxWidth: '42ch' }}
        >
          The page you&apos;re after isn&apos;t here. Head back to the homepage to find your show
          — or sign in if you know where you were going.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 2 }}>
          <Button
            component={RouterLink}
            to="/"
            variant="contained"
            color="secondary"
            size="large"
            startIcon={<IconArrowLeft size={18} />}
            sx={{ textTransform: 'none', fontWeight: 600, px: 3 }}
          >
            Back to home
          </Button>
          <Button
            component={RouterLink}
            to="/signin"
            variant="outlined"
            color="inherit"
            size="large"
            sx={{ textTransform: 'none', fontWeight: 500, px: 3 }}
          >
            Sign in
          </Button>
        </Stack>
      </Stack>
    </Container>
  </Box>
);

export default NotFound;
