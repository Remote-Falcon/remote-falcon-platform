import { useMemo } from 'react';
import * as React from 'react';

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { IconClockHour9 } from '@tabler/icons-react';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';

import useAnalyticsFilters from './useAnalyticsFilters';
import useViewerSessions from './useViewerSessions';

// V6 — Dwell-time distribution.
//
// "How long do cars actually park outside?" — the killer chart for the
// local-audience model. Buckets every session's duration into ranges,
// renders as a horizontal bar chart with median callout.
const BUCKETS = [
  { label: '< 1 min', max: 60, color: 'text.disabled' },
  { label: '1–5 min', max: 5 * 60, color: 'primary.light' },
  { label: '5–15 min', max: 15 * 60, color: 'primary.main' },
  { label: '15–30 min', max: 30 * 60, color: 'success.main' },
  { label: '30+ min', max: Infinity, color: 'warning.main' }
];

const formatMinutes = (sec) => {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

const DwellDistribution = () => {
  const { range } = useAnalyticsFilters();
  const { sessions, loading } = useViewerSessions(range);

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const buckets = BUCKETS.map((b) => ({ ...b, count: 0 }));
    const durations = [];
    sessions.forEach((s) => {
      const dur = Number(s.durationSeconds || 0);
      durations.push(dur);
      const idx = buckets.findIndex((b) => dur < b.max);
      const targetIdx = idx === -1 ? buckets.length - 1 : idx;
      buckets[targetIdx].count += 1;
    });
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)] || 0;
    const max = Math.max(0, ...buckets.map((b) => b.count));
    return { buckets, median, total: sessions.length, max };
  }, [sessions]);

  if (loading) {
    return (
      <MainCard title="How long viewers stay">
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <MainCard title="How long viewers stay">
        <EmptyState
          icon={<IconClockHour9 size={32} stroke={1.5} />}
          title="No viewer sessions yet"
          description="Once viewers visit your show page, dwell-time patterns will appear here."
        />
      </MainCard>
    );
  }

  return (
    <MainCard
      title="How long viewers stay"
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          median {formatMinutes(stats.median)} · {stats.total} session{stats.total === 1 ? '' : 's'}
        </Typography>
      }
    >
      <Stack spacing={1}>
        {stats.buckets.map((b) => {
          const pct = stats.max > 0 ? (b.count / stats.max) * 100 : 0;
          const sharePct = stats.total > 0 ? Math.round((b.count / stats.total) * 100) : 0;
          return (
            <Stack key={b.label} direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ minWidth: 70, fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>
                {b.label}
              </Box>
              <Box sx={{ flex: 1, position: 'relative' }}>
                <Box
                  sx={{
                    height: 22,
                    borderRadius: 1,
                    bgcolor: (t) =>
                      t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: 22,
                    width: `${Math.max(2, pct)}%`,
                    borderRadius: 1,
                    bgcolor: b.color,
                    transition: 'width 250ms ease'
                  }}
                />
              </Box>
              <Box
                sx={{
                  minWidth: 70,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 13,
                  fontWeight: 600
                }}
              >
                {b.count}
                <Typography
                  component="span"
                  sx={{ ml: 0.5, color: 'text.secondary', fontSize: 11, fontWeight: 400 }}
                >
                  · {sharePct}%
                </Typography>
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </MainCard>
  );
};

export default DwellDistribution;
