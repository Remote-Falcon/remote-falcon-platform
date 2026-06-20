import { Box, Chip, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

import { SEASONAL_PRESETS } from './presets';

// One-click palettes. The active chip is whichever preset the current style
// matches exactly (resolved by the parent), so manually tweaking any control
// deselects it without extra bookkeeping.
const SeasonalPresets = ({ activeId, onApply }) => (
  <Box>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>
      Seasonal preset
    </Typography>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {SEASONAL_PRESETS.map((preset) => (
        <Chip
          key={preset.id}
          label={`${preset.emoji} ${preset.label}`}
          clickable
          onClick={() => onApply(preset)}
          color={activeId === preset.id ? 'primary' : 'default'}
          variant={activeId === preset.id ? 'filled' : 'outlined'}
        />
      ))}
    </Stack>
  </Box>
);

SeasonalPresets.propTypes = {
  activeId: PropTypes.string,
  onApply: PropTypes.func.isRequired
};

export default SeasonalPresets;
