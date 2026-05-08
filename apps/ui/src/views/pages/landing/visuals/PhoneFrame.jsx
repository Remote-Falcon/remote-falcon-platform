/**
 * <PhoneFrame />
 *
 * Shared phone chassis used by all marketing-feature visuals on the
 * landing page. 10:19 aspect, rounded chrome, faint top notch, and a
 * matching screen inset that paints `background.default` behind whatever
 * children render. The chrome adapts to light/dark mode.
 */

import { Box } from '@mui/material';
import PropTypes from 'prop-types';

const PhoneFrame = ({ children, sx, screenSx }) => (
  <Box
    sx={{
      aspectRatio: '10 / 19',
      height: '100%',
      maxHeight: '100%',
      borderRadius: '22px',
      border: '5px solid',
      borderColor: (theme) => (theme.palette.mode === 'dark' ? '#0a0a0a' : '#d8d8dc'),
      bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#0a0a0a' : '#d8d8dc'),
      boxShadow: (t) => t.customShadows?.elevated ?? t.shadows[6],
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
      ...sx
    }}
  >
    {/* Notch */}
    <Box
      sx={{
        position: 'absolute',
        top: 4,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '32%',
        height: 5,
        borderRadius: 999,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#1f1f1f' : '#a8a8ac'),
        zIndex: 2
      }}
    />

    {/* Screen */}
    <Box
      sx={{
        flex: 1,
        bgcolor: 'background.default',
        borderRadius: '15px',
        overflow: 'hidden',
        position: 'relative',
        pt: 2,
        px: 1.25,
        pb: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.6,
        ...screenSx
      }}
    >
      {children}
    </Box>
  </Box>
);

PhoneFrame.propTypes = {
  children: PropTypes.node,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func]),
  screenSx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func])
};

export default PhoneFrame;
