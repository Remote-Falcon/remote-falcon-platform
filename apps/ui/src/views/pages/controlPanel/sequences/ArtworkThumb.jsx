import * as React from 'react';

import { Box } from '@mui/material';
import { IconMusic } from '@tabler/icons-react';
import PropTypes from 'prop-types';

// Square album-art thumbnail with a music-note placeholder when there is no
// artwork. Shared by the metadata-lookup popover (44px rows) and the bulk
// review table (36px rows).
const ArtworkThumb = ({ src, alt, size = 44 }) => {
  if (!src) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: 1,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
          color: 'text.disabled'
        }}
      >
        <IconMusic size={Math.round(size * 0.45)} stroke={1.5} />
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      loading="lazy"
      sx={{ width: size, height: size, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }}
    />
  );
};

ArtworkThumb.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number
};

export default ArtworkThumb;
