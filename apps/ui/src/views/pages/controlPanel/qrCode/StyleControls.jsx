import {
  Box,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import PropTypes from 'prop-types';

import { CORNER_STYLES, DOT_STYLES, EC_LEVELS, EMBLEMS } from './presets';

// Native color input wrapped to look at home in the MUI form. Returns a
// lowercase #rrggbb, which matches the HEX guard in qrStyleStorage.
const ColorField = ({ label, value, onChange }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between">
    <Typography variant="body2">{label}</Typography>
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
        {value}
      </Typography>
      <Box
        component="input"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          width: 40,
          height: 30,
          p: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          background: 'none',
          cursor: 'pointer'
        }}
      />
    </Stack>
  </Stack>
);

ColorField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
};

// Presentational: receives the flat style and emits patches. All persistence,
// preset resolution, and option-building live in the parent / pure utils.
const StyleControls = ({ style, onChange }) => {
  const emblemSet = style.emblem !== 'none';

  return (
    <Stack spacing={2.5}>
      <ColorField label="Foreground" value={style.fgColor} onChange={(v) => onChange({ fgColor: v })} />

      <FormControlLabel
        control={<Switch checked={style.gradient} onChange={(e) => onChange({ gradient: e.target.checked })} />}
        label="Gradient foreground"
      />
      {style.gradient && (
        <ColorField label="Gradient end" value={style.gradientColor} onChange={(v) => onChange({ gradientColor: v })} />
      )}

      <ColorField label="Background" value={style.bgColor} onChange={(v) => onChange({ bgColor: v })} />

      <Divider />

      <FormControl fullWidth size="small">
        <InputLabel id="qr-dot-style-label">Dot style</InputLabel>
        <Select
          labelId="qr-dot-style-label"
          label="Dot style"
          value={style.dotStyle}
          onChange={(e) => onChange({ dotStyle: e.target.value })}
        >
          {DOT_STYLES.map((d) => (
            <MenuItem key={d.value} value={d.value}>
              {d.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth size="small">
        <InputLabel id="qr-corner-style-label">Corner style</InputLabel>
        <Select
          labelId="qr-corner-style-label"
          label="Corner style"
          value={style.cornerStyle}
          onChange={(e) => onChange({ cornerStyle: e.target.value })}
        >
          {CORNER_STYLES.map((c) => (
            <MenuItem key={c.value} value={c.value}>
              {c.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth size="small">
        <InputLabel id="qr-emblem-label">Center icon</InputLabel>
        <Select
          labelId="qr-emblem-label"
          label="Center icon"
          value={style.emblem}
          onChange={(e) => onChange({ emblem: e.target.value })}
        >
          {Object.entries(EMBLEMS).map(([id, e]) => (
            <MenuItem key={id} value={id}>
              {e.emoji ? `${e.emoji} ${e.label}` : e.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Divider />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Error correction
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          disabled={emblemSet}
          value={emblemSet ? 'H' : style.errorCorrection}
          onChange={(_, v) => v && onChange({ errorCorrection: v })}
        >
          {EC_LEVELS.map((ec) => (
            <ToggleButton key={ec.value} value={ec.value}>
              {ec.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <FormHelperText>
          {emblemSet
            ? 'Locked to H (highest) so the center icon never breaks the code.'
            : 'Higher levels survive damage and overlays but pack in more dots.'}
        </FormHelperText>
      </Box>
    </Stack>
  );
};

StyleControls.propTypes = {
  style: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired
};

export default StyleControls;
