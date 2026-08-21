import { useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { IconCalendar, IconChevronDown } from '@tabler/icons-react';

import { trackPosthogEvent } from '../../../../utils/analytics/posthog';

import { RETENTION_MONTHS, showDayToPickerDate, validateCustomRange } from './dateRange';
import useAnalyticsFilters, { formatRangeLabel } from './useAnalyticsFilters';

const DAY_MS = 24 * 60 * 60 * 1000;

// Compact preset picker for the PageHead actions slot. Renders as a
// chip-style button that opens a menu of presets + a compare-to-prior
// switch. "Custom…" swaps the menu for a two-field popover.
//
// The custom fields live in their own Popover rather than inside the
// Menu: a Menu owns keyboard type-ahead and focus, so typing a date into
// a field nested in one gets eaten by the menu's item search.
const DateRangePicker = () => {
  const {
    presetId,
    range,
    presetLabel,
    setPreset,
    presets,
    compareToPrior,
    toggleCompareToPrior,
    customRange,
    setCustomRange,
    timezone
  } = useAnalyticsFilters();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [startValue, setStartValue] = useState(null);
  const [endValue, setEndValue] = useState(null);

  // Seed the fields from the range that is actually applied, translated
  // back through the show's timezone so the field shows the day being
  // queried rather than whatever day that instant lands on in the
  // operator's own zone.
  const openCustom = () => {
    setStartValue(showDayToPickerDate(customRange?.start, timezone));
    setEndValue(showDayToPickerDate(customRange?.end, timezone));
    setOpen(false);
    setCustomOpen(true);
  };

  // Resolved every render so the notice + the Apply button and the value
  // that eventually gets committed all come from one evaluation.
  const candidate = validateCustomRange(startValue, endValue, timezone);

  const applyCustom = () => {
    if (!candidate.valid) return;
    trackPosthogEvent('analytics_preset_changed', {
      preset_id: 'custom',
      prior_preset_id: presetId,
      span_days: Math.round((candidate.range.end - candidate.range.start) / DAY_MS)
    });
    setCustomRange(candidate.range.start, candidate.range.end);
    setCustomOpen(false);
  };

  const notice = () => {
    if (!candidate.valid) return { text: candidate.error, color: 'text.secondary' };
    if (candidate.beyondRetention) {
      return {
        text: `Stats older than ${RETENTION_MONTHS} months are deleted nightly, so this range may come back empty.`,
        color: 'warning.main'
      };
    }
    if (candidate.swapped) return { text: 'Applied oldest date first.', color: 'text.secondary' };
    return null;
  };
  const activeNotice = notice();

  // A preset names a rule ("Last 7 nights"), not a window, and which nights
  // that covers is exactly what an operator reading a chart needs to know.
  // Custom already renders its dates as the label, so captioning it would
  // just say the same thing twice.
  const rangeCaption = presetId === 'custom' ? null : formatRangeLabel(range, timezone);

  return (
    <>
      <Box sx={{ display: 'inline-flex', flexDirection: 'column' }}>
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
        {rangeCaption && (
          <Typography
            variant="caption"
            data-testid="date-range-caption"
            sx={{ mt: 0.25, textAlign: 'center', lineHeight: 1.2, color: 'text.secondary' }}
          >
            {rangeCaption}
          </Typography>
        )}
      </Box>

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
        <MenuItem selected={presetId === 'custom'} onClick={openCustom}>
          Custom…
        </MenuItem>
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

      <Popover
        anchorEl={anchorRef.current}
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { p: 2, mt: 1, width: 340 } }}
      >
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Custom date range
        </Typography>
        {/* v5 date pickers: the field is supplied via renderInput. The
            slots / slotProps API is v6+ and does not exist here. */}
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Stack spacing={2}>
            {/* views includes month: the default DatePicker header only
                offers year, so reaching last December meant paging a month
                at a time. Seasons are months, so month-then-day is the
                natural way in. openTo stays on day for the common case of
                nudging a date within the month already shown. */}
            <DatePicker
              label="Start date"
              value={startValue}
              onChange={(newValue) => setStartValue(newValue)}
              views={['year', 'month', 'day']}
              openTo="day"
              renderInput={(props) => <TextField {...props} fullWidth size="small" helperText="" />}
            />
            <DatePicker
              label="End date"
              value={endValue}
              onChange={(newValue) => setEndValue(newValue)}
              views={['year', 'month', 'day']}
              openTo="day"
              renderInput={(props) => <TextField {...props} fullWidth size="small" helperText="" />}
            />
          </Stack>
        </LocalizationProvider>
        {activeNotice && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: activeNotice.color }}>
            {activeNotice.text}
          </Typography>
        )}
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button size="small" color="inherit" onClick={() => setCustomOpen(false)}>
            Cancel
          </Button>
          <Button size="small" variant="contained" disabled={!candidate.valid} onClick={applyCustom}>
            Apply
          </Button>
        </Stack>
      </Popover>
    </>
  );
};

export default DateRangePicker;
