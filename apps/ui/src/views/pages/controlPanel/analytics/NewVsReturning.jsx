import { useMemo } from 'react';
import * as React from 'react';

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { IconRepeat } from '@tabler/icons-react';
import moment from 'moment-timezone';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';

import useAnalyticsFilters from './useAnalyticsFilters';
import useViewerSessions from './useViewerSessions';

// V7 — New tonight vs returning tonight.
//
// For each show-night in the range:
//   • "New" = visitor's FIRST session ever was on this night
//   • "Returning" = visitor had at least one prior session in the range
// Side-by-side stacked bars per night.
const NewVsReturning = () => {
  const { range, timezone } = useAnalyticsFilters();
  const { sessions, loading } = useViewerSessions(range);

  const nights = useMemo(() => {
    if (sessions.length === 0) return [];
    // First, find each visitor's earliest session date in the range.
    const firstSeenByVisitor = new Map();
    sessions.forEach((s) => {
      const prev = firstSeenByVisitor.get(s.identityKey);
      if (!prev || s.firstSeen < prev) firstSeenByVisitor.set(s.identityKey, s.firstSeen);
    });

    // Group by night, classify each session as new or returning
    const byNight = new Map();
    sessions.forEach((s) => {
      const nightKey = moment.tz(s.firstSeen, timezone).startOf('day').valueOf();
      if (!byNight.has(nightKey)) byNight.set(nightKey, { newVisitors: new Set(), returningVisitors: new Set() });
      const isFirstNight = firstSeenByVisitor.get(s.identityKey) >= nightKey
        && firstSeenByVisitor.get(s.identityKey) < nightKey + 24 * 60 * 60 * 1000;
      if (isFirstNight) {
        byNight.get(nightKey).newVisitors.add(s.identityKey);
      } else {
        byNight.get(nightKey).returningVisitors.add(s.identityKey);
      }
    });

    return [...byNight.entries()]
      .map(([date, { newVisitors, returningVisitors }]) => ({
        date,
        label: moment.tz(date, timezone).format('ddd MMM D'),
        newCount: newVisitors.size,
        returningCount: returningVisitors.size,
        total: newVisitors.size + returningVisitors.size
      }))
      .sort((a, b) => a.date - b.date);
  }, [sessions, timezone]);

  if (loading) {
    return (
      <MainCard title="New vs returning visitors">
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  if (nights.length === 0) {
    return (
      <MainCard title="New vs returning visitors">
        <EmptyState
          icon={<IconRepeat size={32} stroke={1.5} />}
          title="No sessions yet"
          description="After a few show nights, you'll see how many viewers come back."
        />
      </MainCard>
    );
  }

  const max = Math.max(1, ...nights.map((n) => n.total));
  const totalNew = nights.reduce((acc, n) => acc + n.newCount, 0);
  const totalReturning = nights.reduce((acc, n) => acc + n.returningCount, 0);
  const returningPct = totalNew + totalReturning === 0 ? 0
    : Math.round((totalReturning / (totalNew + totalReturning)) * 100);

  return (
    <MainCard
      title="New vs returning visitors"
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {returningPct}% returning across {nights.length} {nights.length === 1 ? 'night' : 'nights'}
        </Typography>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${nights.length}, 1fr)`,
          gap: 1.5,
          alignItems: 'end',
          height: 200,
          mb: 1
        }}
      >
        {nights.map((n) => {
          const newH = (n.newCount / max) * 100;
          const retH = (n.returningCount / max) * 100;
          return (
            <Stack key={n.date} alignItems="center" justifyContent="flex-end" sx={{ height: '100%' }}>
              <Typography
                variant="caption"
                sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, mb: 0.5 }}
              >
                {n.total}
              </Typography>
              <Stack
                direction="column-reverse"
                sx={{ width: '100%', maxWidth: 40, height: '100%', justifyContent: 'flex-end' }}
              >
                <Box
                  sx={{
                    height: `${Math.max(0, newH)}%`,
                    borderRadius: '4px 4px 0 0',
                    bgcolor: 'primary.main'
                  }}
                  title={`${n.newCount} new`}
                />
                {n.returningCount > 0 && (
                  <Box
                    sx={{
                      height: `${retH}%`,
                      bgcolor: 'success.main',
                      borderRadius: n.newCount === 0 ? '4px 4px 0 0' : 0
                    }}
                    title={`${n.returningCount} returning`}
                  />
                )}
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, fontSize: 10 }}>
                {n.label}
              </Typography>
            </Stack>
          );
        })}
      </Box>
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'success.main' }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Returning ({totalReturning})
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'primary.main' }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            New ({totalNew})
          </Typography>
        </Stack>
      </Stack>
    </MainCard>
  );
};

export default NewVsReturning;
