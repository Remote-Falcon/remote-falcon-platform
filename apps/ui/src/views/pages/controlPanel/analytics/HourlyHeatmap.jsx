import { useMemo } from 'react';
import * as React from 'react';

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { IconChartHistogram } from '@tabler/icons-react';
import moment from 'moment-timezone';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';

import useAnalyticsFilters from './useAnalyticsFilters';
import useHourlyStats from './useHourlyStats';

// V4 — Hourly engagement heatmap.
//
// Rows = nights with at least one viewer event in the date range.
// Columns = hours of the day (default 16:00–23:00 — typical show window;
// we shrink/grow to fit data outside that window if present).
// Cell color = unique viewer count, scaled to the period max.
//
// The mockup proposed 5-min buckets but hourly is plenty of signal at
// this product's scale and keeps the payload small. If a show owner ever
// asks for finer granularity we revisit.
const HEAT_RAMP = [
  [0.0, 'transparent'],
  [0.01, 'rgba(31,119,120,0.10)'],
  [0.25, 'rgba(31,119,120,0.30)'],
  [0.5, 'rgba(31,119,120,0.55)'],
  [0.75, 'rgba(199,126,35,0.70)'],
  [1.0, 'rgba(199,126,35,0.95)']
];

const colorFor = (intensity) => {
  if (intensity <= 0) return HEAT_RAMP[0][1];
  for (let i = HEAT_RAMP.length - 1; i >= 0; i -= 1) {
    if (intensity >= HEAT_RAMP[i][0]) return HEAT_RAMP[i][1];
  }
  return HEAT_RAMP[0][1];
};

const HourlyHeatmap = () => {
  const { range, timezone } = useAnalyticsFilters();
  const hourly = useHourlyStats(range);

  const grid = useMemo(() => {
    const buckets = hourly.data || [];
    if (buckets.length === 0) return null;

    // Determine hour range — default to 16:00–23:00 (typical show), expand
    // if events fall outside.
    const hoursPresent = new Set(buckets.map((b) => b.hour));
    const minHour = Math.min(16, ...hoursPresent);
    const maxHour = Math.max(23, ...hoursPresent);
    const hours = [];
    for (let h = minHour; h <= maxHour; h += 1) hours.push(h);

    // Group by date
    const byDate = new Map();
    let maxUnique = 0;
    let peak = null;
    buckets.forEach((b) => {
      if (!byDate.has(b.date)) byDate.set(b.date, new Map());
      byDate.get(b.date).set(b.hour, b);
      if ((b.unique || 0) > maxUnique) {
        maxUnique = b.unique;
        peak = b;
      }
    });

    const rows = [...byDate.entries()]
      .map(([date, hoursMap]) => ({
        date,
        label: moment.tz(date, timezone).format('ddd MMM D'),
        cells: hours.map((h) => hoursMap.get(h) || { hour: h, unique: 0, total: 0 })
      }))
      .sort((a, b) => a.date - b.date);

    return { rows, hours, maxUnique, peak };
  }, [hourly.data, timezone]);

  const formatHour = (h) => {
    if (h === 0) return '12a';
    if (h === 12) return '12p';
    if (h < 12) return `${h}a`;
    return `${h - 12}p`;
  };

  if (hourly.loading) {
    return (
      <MainCard title="Hourly engagement">
        <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  if (!grid || grid.rows.length === 0) {
    return (
      <MainCard title="Hourly engagement">
        <EmptyState
          icon={<IconChartHistogram size={32} stroke={1.5} />}
          title="No hourly data yet"
          description="Once your show runs and viewers visit, the night-by-hour pattern will appear here."
        />
      </MainCard>
    );
  }

  const peakLabel = grid.peak
    ? `Peak: ${moment.tz(grid.peak.date, timezone).format('ddd MMM D')} ${formatHour(grid.peak.hour)} — ${grid.peak.unique} viewers`
    : null;

  return (
    <MainCard
      title="Hourly engagement"
      secondary={
        peakLabel && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {peakLabel}
          </Typography>
        )
      }
    >
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ minWidth: 480 }}>
          {/* Header row of hour labels */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `100px repeat(${grid.hours.length}, 1fr)`,
              gap: 0.5,
              mb: 0.5
            }}
          >
            <Box />
            {grid.hours.map((h) => (
              <Typography
                key={h}
                variant="caption"
                sx={{ color: 'text.disabled', textAlign: 'center', fontSize: 10 }}
              >
                {formatHour(h)}
              </Typography>
            ))}
          </Box>

          {/* Rows */}
          {grid.rows.map((row) => (
            <Box
              key={row.date}
              sx={{
                display: 'grid',
                gridTemplateColumns: `100px repeat(${grid.hours.length}, 1fr)`,
                gap: 0.5,
                mb: 0.5,
                alignItems: 'center'
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                {row.label}
              </Typography>
              {row.cells.map((cell) => {
                const intensity = grid.maxUnique > 0 ? (cell.unique || 0) / grid.maxUnique : 0;
                return (
                  <Box
                    key={cell.hour}
                    title={`${row.label} ${formatHour(cell.hour)} — ${cell.unique || 0} viewers`}
                    sx={{
                      aspectRatio: '1.5 / 1',
                      borderRadius: 0.5,
                      bgcolor: colorFor(intensity),
                      border: (t) =>
                        intensity === 0
                          ? `1px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`
                          : 'none',
                      transition: 'background 200ms ease',
                      cursor: 'default',
                      minHeight: 18
                    }}
                  />
                );
              })}
            </Box>
          ))}

          {/* Legend */}
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 2, justifyContent: 'flex-end' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mr: 0.5 }}>
              less
            </Typography>
            {[0.05, 0.25, 0.5, 0.75, 1.0].map((intensity) => (
              <Box
                key={intensity}
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: 0.5,
                  bgcolor: colorFor(intensity)
                }}
              />
            ))}
            <Typography variant="caption" sx={{ color: 'text.disabled', ml: 0.5 }}>
              more
            </Typography>
          </Stack>
        </Box>
      </Box>
    </MainCard>
  );
};

export default HourlyHeatmap;
