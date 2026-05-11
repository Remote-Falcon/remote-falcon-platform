import { useMemo, useState } from 'react';
import * as React from 'react';

import { Box, MenuItem, Select, Skeleton, Stack, Typography } from '@mui/material';
import { IconChartLine } from '@tabler/icons-react';
import moment from 'moment-timezone';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';

import useAnalyticsFilters from './useAnalyticsFilters';
import useViewerSessions from './useViewerSessions';

// V5 — Concurrent viewers timeline (per-night).
//
// For each minute in the show window, count visitors with an active
// session covering that minute (firstSeen ≤ t ≤ lastSeen). Renders as a
// stacked area chart for one selected night. The dropdown picks the
// night; the chart shows that night's parking-lot fullness over time.
const ALL_NIGHT = '__all__';

const ConcurrentTimeline = () => {
  const { range, timezone } = useAnalyticsFilters();
  const { sessions, loading } = useViewerSessions(range);

  // Available nights for the dropdown
  const availableNights = useMemo(() => {
    const nights = new Map();
    sessions.forEach((s) => {
      const key = moment.tz(s.firstSeen, timezone).startOf('day').valueOf();
      if (!nights.has(key)) nights.set(key, moment.tz(key, timezone).format('ddd MMM D'));
    });
    return [...nights.entries()].sort((a, b) => b[0] - a[0]);  // newest first
  }, [sessions, timezone]);

  const [selectedNight, setSelectedNight] = useState(ALL_NIGHT);

  // For the selected night, compute concurrent counts at 5-min intervals
  // from the show window (default 17:00–23:00 in show tz, expanded if data
  // falls outside).
  const series = useMemo(() => {
    if (sessions.length === 0) return null;
    let ofInterest = sessions;
    if (selectedNight !== ALL_NIGHT) {
      const nightStart = parseInt(selectedNight, 10);
      const nightEnd = nightStart + 24 * 60 * 60 * 1000;
      ofInterest = sessions.filter((s) => s.firstSeen >= nightStart && s.firstSeen < nightEnd);
    }
    if (ofInterest.length === 0) return null;

    const earliest = Math.min(...ofInterest.map((s) => s.firstSeen));
    const latest = Math.max(...ofInterest.map((s) => s.lastSeen));
    // Round to nearest 5 min
    const FIVE_MIN = 5 * 60 * 1000;
    const startMs = Math.floor(earliest / FIVE_MIN) * FIVE_MIN;
    const endMs = Math.ceil(latest / FIVE_MIN) * FIVE_MIN;
    const buckets = [];
    for (let t = startMs; t <= endMs; t += FIVE_MIN) {
      const concurrent = ofInterest.filter((s) => s.firstSeen <= t && s.lastSeen >= t).length;
      buckets.push({ t, concurrent });
    }
    const peak = buckets.reduce((best, cur) => (cur.concurrent > (best?.concurrent || 0) ? cur : best), null);
    return { buckets, peak };
  }, [sessions, selectedNight]);

  if (loading) {
    return (
      <MainCard title="Concurrent viewers">
        <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  if (!series || series.buckets.length === 0) {
    return (
      <MainCard title="Concurrent viewers">
        <EmptyState
          icon={<IconChartLine size={32} stroke={1.5} />}
          title="No sessions yet for this range"
          description="The concurrent-viewers timeline will appear once viewers start watching."
        />
      </MainCard>
    );
  }

  // Build SVG path
  const width = 800;
  const height = 200;
  const max = Math.max(1, ...series.buckets.map((b) => b.concurrent));
  const stepX = series.buckets.length > 1 ? width / (series.buckets.length - 1) : width;
  const points = series.buckets
    .map((b, i) => {
      const x = i * stepX;
      const y = height - (b.concurrent / max) * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z`;

  return (
    <MainCard
      title="Concurrent viewers"
      secondary={
        <Stack direction="row" spacing={1.5} alignItems="center">
          {series.peak && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              peak {series.peak.concurrent} at {moment.tz(series.peak.t, timezone).format('h:mm A')}
            </Typography>
          )}
          <Select
            size="small"
            value={selectedNight}
            onChange={(e) => setSelectedNight(e.target.value)}
            sx={{ fontSize: 12, minWidth: 140 }}
          >
            <MenuItem value={ALL_NIGHT}>All nights</MenuItem>
            {availableNights.map(([key, label]) => (
              <MenuItem key={key} value={String(key)}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      }
    >
      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <svg
          width="100%"
          height={height + 32}
          viewBox={`0 0 ${width} ${height + 32}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Concurrent viewers over time"
          style={{ display: 'block', minWidth: 320 }}
        >
          <defs>
            <linearGradient id="concurrentFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(31,119,120)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="rgb(31,119,120)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#concurrentFill)" />
          <polyline
            points={points}
            fill="none"
            stroke="rgb(31,119,120)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {[0, Math.floor(series.buckets.length / 2), series.buckets.length - 1].map((idx, i) => {
            if (series.buckets[idx] == null) return null;
            const x = idx * stepX;
            return (
              <text
                key={i}
                x={x}
                y={height + 22}
                fontSize="11"
                textAnchor={idx === 0 ? 'start' : idx === series.buckets.length - 1 ? 'end' : 'middle'}
                fill="currentColor"
                opacity="0.55"
              >
                {moment.tz(series.buckets[idx].t, timezone).format('h:mm A')}
              </text>
            );
          })}
        </svg>
      </Box>
    </MainCard>
  );
};

export default ConcurrentTimeline;
