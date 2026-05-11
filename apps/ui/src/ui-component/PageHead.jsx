import * as React from 'react';

import { Box, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

// v2 dashboard PageHead per the mockup at
// apps/ui/docs/design-system/mockup.html ([data-screen="control"]).
// Pattern: <h1 title>, optional eyebrow + description, action slot
// pinned to the right. Lives at the top of every control-panel screen
// so the layout shell doesn't have to know per-page chrome.
const PageHead = ({ eyebrow, title, description, actions }) => (
  <Box sx={{ mb: 3 }}>
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      alignItems={{ xs: 'flex-start', md: 'center' }}
      justifyContent="space-between"
      spacing={2}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography
            variant="overline"
            sx={{
              color: 'text.secondary',
              letterSpacing: '0.08em',
              display: 'block',
              lineHeight: 1.4
            }}
          >
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h2" component="h1" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', md: 'center' } }}
        >
          {actions}
        </Stack>
      )}
    </Stack>
  </Box>
);

PageHead.propTypes = {
  eyebrow: PropTypes.node,
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  actions: PropTypes.node
};

export default PageHead;
