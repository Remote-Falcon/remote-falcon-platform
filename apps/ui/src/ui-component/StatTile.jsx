import * as React from 'react';

import { Box, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

import MainCard from './cards/MainCard';

// Tiny inline sparkline used when `sparkValues` is provided. Stretched
// horizontally to a fixed width; not interactive — pair with a full
// ApexLineChart elsewhere if you need tooltips.
const Sparkline = ({ values, color = 'currentColor', height = 28 }) => {
  if (!values || values.length < 2) return null;
  const max = Math.max(1, ...values);
  const width = 80;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - (v / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

Sparkline.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.string,
  height: PropTypes.number
};

// Single canonical stat tile used by Dashboard live-stats row, Analytics
// hero row, and the per-sequence detail page. Props you can mix:
//
//   label       — overline string (required)
//   value       — the big number
//   sub         — caption under the value (e.g., "across 7 days")
//   delta       — { text, color } badge that replaces `sub` when present
//   icon        — large decorative icon at top-right (operational tiles)
//   sparkValues — inline sparkline beside the value (analytics tiles)
//   accent      — color token used for the icon AND sparkline stroke
//   subtle      — true → soft background tint (matches the analytics look)
const StatTile = ({
  label,
  value,
  sub,
  delta,
  icon,
  sparkValues,
  accent = 'text.secondary',
  subtle = false
}) => (
  <MainCard
    sx={{
      height: '100%',
      ...(subtle && {
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
      })
    }}
    contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }}
  >
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.4 }}>
          {label}
        </Typography>
        <Stack direction="row" alignItems="flex-end" spacing={1.5}>
          {/* Render the big number as a div with h2 visual style — stat
              values aren't document headings and shouldn't appear in the
              outline (WCAG 1.3.1 / 2.4.6). */}
          <Typography component="div" variant="h2" sx={{ mt: 0.5, fontWeight: 700, fontSize: 28, lineHeight: 1.1 }}>
            {value}
          </Typography>
          {sparkValues && (
            <Box sx={{ color: accent || 'primary.main', mb: 0.25 }}>
              <Sparkline values={sparkValues} />
            </Box>
          )}
        </Stack>
        {delta ? (
          <Typography variant="caption" sx={{ color: delta.color, fontSize: 12 }}>
            {delta.text}
          </Typography>
        ) : (
          sub && (
            <Typography variant="caption" component="div" sx={{ color: accent, fontSize: 12 }}>
              {sub}
            </Typography>
          )
        )}
      </Box>
      {icon && <Box sx={{ color: accent, opacity: 0.4, ml: 1 }}>{icon}</Box>}
    </Stack>
  </MainCard>
);

StatTile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  sub: PropTypes.node,
  delta: PropTypes.shape({
    text: PropTypes.node.isRequired,
    color: PropTypes.string
  }),
  icon: PropTypes.node,
  sparkValues: PropTypes.arrayOf(PropTypes.number),
  accent: PropTypes.string,
  subtle: PropTypes.bool
};

export default StatTile;
