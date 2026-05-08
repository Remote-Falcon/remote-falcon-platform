/**
 * <AuthShell />
 *
 * Split-screen container for every public auth route (Login, Register,
 * Forgot/Reset Password, Verify Email). Renders the marketing AppBar at
 * the top in its `variant="auth"` mode (lockup + ThemeToggle only) so the
 * brand sits in the exact same DOM node — and pixel position — as on the
 * landing page. No coordinate matching gymnastics.
 *
 * Layout:
 *   - Top: <AppBar variant="auth" /> (sticky, 96px tall).
 *   - Below: 1200px container with a 2-column grid filling the rest of
 *            the viewport (calc(100vh - 96px) on md+).
 *   - Left panel  → brand surface (bg1), jukebox + tagline centered,
 *                   optional meta strip at the bottom.
 *   - Right panel → form surface (bg0) with centered ~400px form
 *                   (eyebrow → heading → subhead → children).
 *   - Mobile     → stacks vertically.
 *
 * Props
 *   eyebrow   — small UPPERCASE label above the form heading
 *   heading   — the main form heading (e.g. "So glad you came back!")
 *   subhead   — short body copy under the heading
 *   tagline   — React node rendered next to the jukebox in the brand
 *               panel (e.g. "Let your viewers take <accent>control.</accent>")
 *   meta      — optional caption at the bottom of the brand panel
 *               (e.g. "Open source · Community-built")
 *   children  — the actual form content (Formik etc.)
 */

import { Box, Container, Grid, Link, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';

import jukebox from '../../../assets/images/landing/full-jukebox-1301x1041.png';
import AppBar from '../../../ui-component/extended/AppBar';

// Marketing AppBar Toolbar minHeight; we offset the split-screen by the
// same amount so the form/brand panels fill exactly the rest of the viewport.
const APPBAR_HEIGHT = 96;

// "or" divider + cross-link between Login ↔ Sign up.
// Rendered inside the form panel (children of AuthShell).
export const AuthFormSwitch = ({ prompt, label, to }) => (
  <Box sx={{ pt: 3 }}>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        color: 'text.secondary',
        fontSize: 13,
        mb: 2
      }}
    >
      <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
      or
      <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
    </Box>
    <Typography
      variant="body2"
      sx={{ textAlign: 'center', color: 'text.secondary', fontSize: 14 }}
    >
      {prompt}{' '}
      <Link
        component={RouterLink}
        to={to}
        underline="none"
        sx={{ color: 'secondary.main', fontWeight: 600, '&:hover': { color: 'secondary.dark' } }}
      >
        {label}
      </Link>
    </Typography>
  </Box>
);
AuthFormSwitch.propTypes = {
  prompt: PropTypes.node.isRequired,
  label: PropTypes.node.isRequired,
  to: PropTypes.string.isRequired
};

const BrandOrb = () => (
  <Box
    aria-hidden
    sx={{
      position: 'absolute',
      inset: '-10% 0 -10% 0',
      pointerEvents: 'none',
      zIndex: 0,
      filter: 'blur(40px)',
      opacity: (theme) => (theme.palette.mode === 'dark' ? 1 : 0.6),
      background: (theme) => `
        radial-gradient(circle at 30% 50%, ${alpha(theme.palette.primary.main, 0.20)}, transparent 50%),
        radial-gradient(circle at 70% 70%, ${alpha(theme.palette.secondary.main, 0.16)}, transparent 55%),
        radial-gradient(circle at 50% 30%, rgba(239,43,61,0.10), transparent 60%)
      `
    }}
  />
);

const AuthShell = ({ eyebrow, heading, subhead, tagline, meta, children }) => (
  <>
    {/* Same AppBar component as landing — its `auth` variant strips the
        nav and sign-in/up buttons but keeps the lockup + ThemeToggle.
        Identical DOM = brand stays nailed to the same coordinates when
        navigating between /, /signin, and /signup. */}
    <AppBar variant="auth" />

    <Container
      disableGutters
      maxWidth="lg"
      sx={{
        maxWidth: 1200,
        minHeight: { md: `calc(100vh - ${APPBAR_HEIGHT}px)` }
      }}
    >
      <Grid
        container
        sx={{
          minHeight: { md: `calc(100vh - ${APPBAR_HEIGHT}px)` },
          // Subtle border separates the centered shell from the page
          // background on viewports wider than 1200px.
          boxShadow: { md: (t) => `0 0 0 1px ${t.palette.divider}` }
        }}
      >
        {/* BRAND PANEL --------------------------------------------------- */}
        <Grid
          item
          xs={12}
          md={6}
          sx={{
            position: 'relative',
            overflow: 'hidden',
            bgcolor: 'background.paper',
            borderRight: { md: '1px solid' },
            borderBottom: { xs: '1px solid', md: 'none' },
            borderColor: { xs: 'divider', md: 'divider' },
            p: { xs: 4, md: 6 },
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <BrandOrb />

          {/* Jukebox + tagline, centered */}
          <Box
            sx={{
              flex: 1,
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: { xs: 2, md: 4 },
              textAlign: 'center',
              py: { xs: 3, md: 4 }
            }}
          >
            <Box
              component="img"
              src={jukebox}
              alt="Remote Falcon"
              sx={{
                width: '100%',
                maxWidth: { xs: 220, md: 760 },
                maxHeight: { xs: 'none', md: 600 },
                height: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 16px 36px rgba(239,43,61,0.25))'
              }}
            />
            {tagline && (
              <Typography
                variant="h2"
                sx={{
                  fontSize: { xs: '1.375rem', md: '2rem' },
                  fontWeight: 700,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  maxWidth: '18ch',
                  margin: '0 auto'
                }}
              >
                {tagline}
              </Typography>
            )}
          </Box>

          {meta && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ position: 'relative', zIndex: 1, fontSize: 13, display: { xs: 'none', md: 'block' } }}
            >
              {meta}
            </Typography>
          )}
        </Grid>

        {/* FORM PANEL ---------------------------------------------------- */}
        <Grid
          item
          xs={12}
          md={6}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: { xs: 4, md: 6 },
            bgcolor: 'background.default'
          }}
        >
          <Stack spacing={1} sx={{ width: '100%', maxWidth: 400 }}>
            {eyebrow && (
              <Typography
                sx={{
                  color: 'secondary.main',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}
              >
                {eyebrow}
              </Typography>
            )}
            {heading && (
              <Typography
                variant="h2"
                component="h1"
                sx={{
                  fontSize: { xs: '1.75rem', md: '2rem' },
                  fontWeight: 700,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em'
                }}
              >
                {heading}
              </Typography>
            )}
            {subhead && (
              <Typography variant="body1" color="text.secondary" sx={{ fontSize: 15, lineHeight: 1.6, pb: 2 }}>
                {subhead}
              </Typography>
            )}
            <Box sx={{ pt: subhead ? 0 : 2 }}>{children}</Box>
          </Stack>
        </Grid>
      </Grid>
    </Container>
  </>
);

AuthShell.propTypes = {
  eyebrow: PropTypes.node,
  heading: PropTypes.node,
  subhead: PropTypes.node,
  tagline: PropTypes.node,
  meta: PropTypes.node,
  children: PropTypes.node.isRequired
};

export default AuthShell;
