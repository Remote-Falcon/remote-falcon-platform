import * as React from 'react';

import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { IconExternalLink, IconMapPinOff } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import { getShowPublicUrl } from '../../../utils/showPublicUrl';

// Graceful-degradation list view (PRD NFR-6): rendered when the basemap
// can't load (tile origin down, WebGL unavailable). Show data comes from our
// own backend, so visitors can still browse and click through to shows.
const FallbackList = ({ shows, onShowClick }) => (
  <Box sx={{ maxWidth: 720, mx: 'auto', p: 2, width: '100%', overflowY: 'auto' }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, color: 'text.secondary' }}>
      <IconMapPinOff size={20} />
      <Typography variant="body2">
        The interactive map couldn&apos;t load, so here&apos;s every listed show instead.
      </Typography>
    </Stack>
    <Stack spacing={1.5}>
      {[...shows]
        .sort((a, b) => (a.showName || '').localeCompare(b.showName || ''))
        .map((show) => (
          <Card key={show.showSubdomain || show.showName} variant="outlined">
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {show.showName}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                endIcon={<IconExternalLink size={16} />}
                component="a"
                href={getShowPublicUrl(show.showSubdomain)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onShowClick?.(show)}
              >
                Visit Show
              </Button>
            </CardContent>
          </Card>
        ))}
    </Stack>
  </Box>
);

FallbackList.propTypes = {
  shows: PropTypes.array.isRequired,
  onShowClick: PropTypes.func
};

export default FallbackList;
