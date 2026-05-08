/**
 * <LogoMark />
 *
 * The Remote Falcon icon mark — the neon "RF" monogram glowing red.
 * Asset: apps/ui/public/rf-icon.png (also available in src/assets/images/
 * as rf-icon-small.png at lower resolution).
 *
 * Usage:
 *   <LogoMark size={28} />          // default — used in nav, sidebar
 *   <LogoMark size={44} glow />     // hero / footer — adds neon glow halo
 *   <LogoMark size={20} />          // dense / inline contexts
 *
 * Don't:
 *   - Place on amber or red backgrounds (kills the glow). Always on a
 *     surface darker than bg-1, or on transparent.
 *   - Recolor or apply CSS filters that shift hue. The red is part of
 *     the brand identity.
 *   - Stretch — keep aspect ratio 1:1 always.
 */

import PropTypes from 'prop-types';
import { Box } from '@mui/material';

import rfIcon from '../../../public/rf-icon.png';

// Pass `src` to use a different image (e.g. an experimental
// rf-icon-new while we evaluate it in a single surface).
const LogoMark = ({ size = 28, glow = false, src, sx, ...rest }) => (
  <Box
    component="img"
    src={src ?? rfIcon}
    alt="Remote Falcon"
    width={size}
    height={size}
    sx={{
      display: 'block',
      flexShrink: 0,
      objectFit: 'contain',
      ...(glow && {
        filter: 'drop-shadow(0 0 8px rgba(239,43,61,0.55)) drop-shadow(0 0 24px rgba(239,43,61,0.30))'
      }),
      ...sx
    }}
    {...rest}
  />
);

LogoMark.propTypes = {
  size: PropTypes.number,
  glow: PropTypes.bool,
  src: PropTypes.string,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func])
};

export default LogoMark;
