import { useMemo } from 'react';
import * as React from 'react';

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { IconClock } from '@tabler/icons-react';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';

import useAnalyticsFilters from './useAnalyticsFilters';
import useHourlyStats from './useHourlyStats';

// V9 — Active-hour distribution.
//
// Bar chart, x = hour-of-night, y = average unique viewers at that hour
// across all show nights in the range. Answers "when does the audience
// peak?" — useful pre-season for marketing decisions.
const formatHour = (h) => {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
};

const ActiveHourDistribution = () => {
  const hourly = useHourlyStats(useAnalyticsFilters().range);

  const { hours, maxAvg, totalNights, peakHour } = useMemo(() => {
    const buckets = hourly.data || [];
    if (buckets.length === 0) {
      return { hours: [], maxAvg: 0, totalNights: 0, peakHour: null };
    }
    // For each hour: sum uniques across all nights, count nights with data
    const hoursPresent = new Set(buckets.map((b) => b.hour));
    const minH = Math.min(16, ...hoursPresent);
    const maxH = Math.max(23, ...hoursPresent);
    const out = [];
    for (let h = minH; h <= maxH; h += 1) {
      const hourBuckets = buckets.filter((b) => b.hour === h);
      const totalUniques = hourBuckets.reduce((acc, b) => acc + (b.unique || 0), 0);
      const nights = hourBuckets.length;
      out.push({ hour: h, avg: nights > 0 ? Math.round(totalUniques / nights) : 0, nights });
    }
    const datesSeen = new Set(buckets.map((b) => b.date));
    const max = Math.max(0, ...out.map((h) => h.avg));
    const peak = out.find((h) => h.avg === max && max > 0);
    return { hours: out, maxAvg: max, totalNights: datesSeen.size, peakHour: peak };
  }, [hourly.data]);

  if (hourly.loading) {
    return (
      <MainCard title="When viewers are active">
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  if (hours.length === 0 || maxAvg === 0) {
    return (
      <MainCard title="When viewers are active">
        <EmptyState
          icon={<IconClock size={32} stroke={1.5} />}
          title="No hourly data yet"
          description="The active-hour distribution will appear once viewers visit during your show window."
        />
      </MainCard>
    );
  }

  return (
    <MainCard
      title="When viewers are active"
      secondary={
        peakHour && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            peak at {formatHour(peakHour.hour)} ({peakHour.avg} avg viewers across {totalNights} {totalNights === 1 ? 'night' : 'nights'})
          </Typography>
        )
      }
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${hours.length}, 1fr)`,
          gap: 1,
          alignItems: 'end',
          height: 200
        }}
      >
        {hours.map((h) => {
          const heightPct = (h.avg / maxAvg) * 100;
          const isPeak = peakHour && h.hour === peakHour.hour;
          return (
            <Stack key={h.hour} alignItems="center" justifyContent="flex-end" sx={{ height: '100%' }}>
              <Typography
                variant="caption"
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  color: h.avg > 0 ? 'text.primary' : 'text.disabled',
                  fontWeight: 600,
                  mb: 0.5
                }}
              >
                {h.avg > 0 ? h.avg : '—'}
              </Typography>
              <Box
                sx={{
                  width: '100%',
                  maxWidth: 36,
                  height: h.avg > 0 ? `${Math.max(2, heightPct)}%` : '2%',
                  borderRadius: '4px 4px 0 0',
                  bgcolor: h.avg > 0 ? (isPeak ? 'warning.main' : 'primary.main') : (t) =>
                    t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  transition: 'height 250ms ease'
                }}
                title={`${formatHour(h.hour)} — ${h.avg} avg viewers`}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.75, fontSize: 10 }}>
                {formatHour(h.hour)}
              </Typography>
            </Stack>
          );
        })}
      </Box>
    </MainCard>
  );
};

export default ActiveHourDistribution;
