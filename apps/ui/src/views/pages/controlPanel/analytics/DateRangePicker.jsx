import { useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Menu,
  MenuItem,
  Switch,
  Typography
} from '@mui/material';
import { IconCalendar, IconChevronDown } from '@tabler/icons-react';

import { trackPosthogEvent } from '../../../../utils/analytics/posthog';

import useAnalyticsFilters from './useAnalyticsFilters';

// Compact preset picker for the PageHead actions slot. Renders as a
// chip-style button that opens a menu of presets + a compare-to-prior
// switch. Custom date range is deferred to a follow-up — preset coverage
// is rich enough for the common cases.
const DateRangePicker = () => {
  const { presetId, presetLabel, setPreset, presets, compareToPrior, toggleCompareToPrior } = useAnalyticsFilters();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        ref={anchorRef}
        variant="outlined"
        color="primary"
        startIcon={<IconCalendar size={16} stroke={1.75} />}
        endIcon={<IconChevronDown size={14} stroke={1.75} />}
        onClick={() => setOpen(true)}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        {presetLabel}
      </Button>

      <Menu
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { minWidth: 240, mt: 1 } }}
      >
        {presets.map((preset) => (
          <MenuItem
            key={preset.id}
            selected={preset.id === presetId}
            onClick={() => {
              if (preset.id !== presetId) {
                trackPosthogEvent('analytics_preset_changed', {
                  preset_id: preset.id,
                  prior_preset_id: presetId
                });
              }
              setPreset(preset.id);
              setOpen(false);
            }}
          >
            {preset.label}
          </MenuItem>
        ))}
        <Divider sx={{ my: 0.5 }} />
        <Box sx={{ px: 2, py: 1 }}>
          <FormControlLabel
            control={<Switch size="small" checked={compareToPrior} onChange={toggleCompareToPrior} />}
            label={
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Compare to prior period
              </Typography>
            }
          />
        </Box>
      </Menu>
    </>
  );
};

export default DateRangePicker;
