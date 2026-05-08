import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link as RouterLink } from 'react-router-dom';

import AppBar from '../../ui-component/extended/AppBar';

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
      <Stack spacing={3} alignItems="center" textAlign="center" sx={{ py: 8 }}>
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
