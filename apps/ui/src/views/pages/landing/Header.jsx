import { Box, Button, Container, Grid, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { IconArrowRight } from '@tabler/icons-react';
import { Link as RouterLink } from 'react-router-dom';

import jukebox from '../../../assets/images/landing/full-jukebox-1301x1041.png';
import { gridSpacing } from '../../../store/constant';

const HeaderPage = () => {
  const theme = useTheme();

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden' }}>
      {/* Soft orb glow behind the hero — pure decoration. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: '-120px 0 auto 0',
          height: 600,
          pointerEvents: 'none',
          zIndex: 0,
          filter: 'blur(40px)',
          opacity: theme.palette.mode === 'dark' ? 1 : 0.7,
          background: `
            radial-gradient(circle at 30% 50%, ${theme.palette.primary.main}33, transparent 50%),
            radial-gradient(circle at 70% 40%, ${theme.palette.secondary.main}33, transparent 55%),
            radial-gradient(circle at 50% 80%, rgba(239,43,61,0.10), transparent 60%)
          `
        }}
      />

      <Container sx={{ position: 'relative', zIndex: 1 }}>
        <Grid
          container
          alignItems="center"
          justifyContent="space-between"
          spacing={gridSpacing}
          sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 12 } }}
        >
          {/* Text column */}
          <Grid item xs={12} md={5}>
            <Stack spacing={3}>
              <motion.div
                initial={{ opacity: 0, translateY: 60 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'spring', stiffness: 150, damping: 30 }}
              >
                <Typography
                  variant="h1"
                  sx={{
                    fontSize: { xs: '2.5rem', sm: '3rem', md: '4rem' },
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: '-0.03em'
                  }}
                >
                  Let your viewers take{' '}
                  <Box component="span" sx={{ color: 'primary.main' }}>
                    control.
                  </Box>
                </Typography>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, translateY: 40 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'spring', stiffness: 150, damping: 30, delay: 0.1 }}
              >
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: '1rem', md: '1.125rem' },
                    lineHeight: 1.6,
                    maxWidth: '50ch'
                  }}
                >
                  Remote Falcon allows your viewers to take control of your light show in order to
                  provide an immersive and interactive experience.
                </Typography>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, translateY: 30 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'spring', stiffness: 150, damping: 30, delay: 0.2 }}
              >
                <Button
                  component={RouterLink}
                  to="/signup"
                  variant="contained"
                  color="secondary"
                  size="large"
                  endIcon={<IconArrowRight size={18} />}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    px: 3,
                    py: 1.5,
                    boxShadow: (t) => t.customShadows?.glow ?? t.shadows[4]
                  }}
                >
                  Create your show — free
                </Button>
              </motion.div>
            </Stack>
          </Grid>

          {/* Image column */}
          <Grid item xs={12} md={7} sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center' }}>
            <Box
              component="img"
              src={jukebox}
              alt="Remote Falcon"
              sx={{
                position: 'relative',
                maxWidth: 760,
                width: '100%',
                maxHeight: 600,
                height: 'auto',
                objectFit: 'contain',
                display: 'block',
                filter: 'drop-shadow(0 20px 40px rgba(239,43,61,0.25))'
              }}
            />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default HeaderPage;
