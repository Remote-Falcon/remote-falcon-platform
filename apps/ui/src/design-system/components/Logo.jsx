/**
 * <Logo />
 *
 * The Remote Falcon brand lockup. Two variants:
 *
 *   variant="lockup" (default)
 *     RF icon mark + "Remote Falcon" wordmark side-by-side. Used in the
 *     marketing nav, the control-panel sidebar header, and the marketing
 *     footer.
 *
 *   variant="hero"
 *     The full neon "REMOTE FALCON" jukebox-arch image as shipped at
 *     apps/ui/public/jukebox.png (or src/assets/images/landing/
 *     full-jukebox-1301x1041.png at higher resolution). Used in the
 *     marketing hero ONLY — the glow asset is too dominant for nav use.
 *
 * The wordmark renders as styled text (Inter, weight 700, slight letter
 * spacing) rather than an SVG, because the repo doesn't ship a
 * production "REMOTE FALCON" wordmark file — only the iconic neon
 * jukebox version. If/when a clean SVG wordmark is added, swap the
 * <Typography> here for an <img>.
 */

import PropTypes from 'prop-types';
import { Box, Stack, Typography } from '@mui/material';

import LogoMark from './LogoMark';
import jukebox from '../../../public/jukebox.png';

const Logo = ({ variant = 'lockup', markSize = 28, wordmarkSize, markSrc, sx }) => {
  if (variant === 'hero') {
    return (
      <Box
        component="img"
        src={jukebox}
        alt="Remote Falcon"
        sx={{
          display: 'block',
          maxWidth: '100%',
          height: 'auto',
          ...sx
        }}
      />
    );
  }

  // Default ratio of 0.55 looks right at smaller marks (~28px nav use).
  // For larger marks (e.g. 72px in the marketing AppBar), pass a smaller
  // explicit wordmarkSize so the wordmark stays proportional.
  const ws = wordmarkSize ?? Math.round(markSize * 0.55);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.25}
      sx={{
        textDecoration: 'none',
        color: 'inherit',
        ...sx
      }}
    >
      <LogoMark size={markSize} src={markSrc} />
      <Typography
        component="span"
        sx={{
          // Wordmark always renders in Inter — independent of the active
          // MUI theme — so it stays consistent across light/dark and
          // legacy/v2 theme states.
          fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontWeight: 700,
          fontSize: ws,
          letterSpacing: '-0.01em',
          lineHeight: 1
        }}
      >
        Remote Falcon
      </Typography>
    </Stack>
  );
};

Logo.propTypes = {
  variant: PropTypes.oneOf(['lockup', 'hero']),
  markSize: PropTypes.number,
  wordmarkSize: PropTypes.number,
  markSrc: PropTypes.string,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func])
};

export default Logo;
