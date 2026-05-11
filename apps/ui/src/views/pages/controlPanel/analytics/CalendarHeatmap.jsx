import { useMemo } from 'react';
import * as React from 'react';

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { IconCalendar } from '@tabler/icons-react';
import moment from 'moment-timezone';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';

import useAnalyticsFilters from './useAnalyticsFilters';
import useDashboardStats from './useDashboardStats';

// V3 — Calendar heatmap.
//
// GitHub-contributions-style grid. Each cell is a single day; color
// intensity scales with the day's unique-viewer count. Cells without
// data render as a faint outline so you can see the shape of the season.
//
// Layout: weeks as columns, day-of-week as rows (Sun on top, Sat on
// bottom). For a season-to-date view that's ~10 columns; for a single
// month it's ~5; for a year it's 53.
//
// Tooltip on hover shows date + viewer count.
const HEAT_RAMP = [
  [0, 'transparent'],
  [0.01, 'rgba(31,119,120,0.18)'],
  [0.25, 'rgba(31,119,120,0.40)'],
  [0.5, 'rgba(31,119,120,0.65)'],
  [0.75, 'rgba(199,126,35,0.75)'],
  [1.0, 'rgba(199,126,35,0.95)']
];

const colorFor = (intensity) => {
  if (intensity <= 0) return HEAT_RAMP[0][1];
  for (let i = HEAT_RAMP.length - 1; i >= 0; i -= 1) {
    if (intensity >= HEAT_RAMP[i][0]) return HEAT_RAMP[i][1];
  }
  return HEAT_RAMP[0][1];
};

const DOW_LABELS = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

const CalendarHeatmap = () => {
  const { range, timezone } = useAnalyticsFilters();
  const stats = useDashboardStats(range);

  const grid = useMemo(() => {
    if (!range?.start || !range?.end) return null;
    const days = stats.data?.page || [];

    // Index by ymd string in show timezone for quick lookup
    const byDate = new Map();
    let max = 0;
    let totalDays = 0;
    days.forEach((day) => {
      const m = moment.tz(day.date, timezone);
      const key = m.format('YYYY-MM-DD');
      const u = day.unique || 0;
      byDate.set(key, { unique: u, total: day.total || 0, date: day.date });
      if (u > 0) totalDays += 1;
      if (u > max) max = u;
    });

    // Build week-columns. Anchor on the Sunday of the start week.
    const start = moment.tz(range.start, timezone).startOf('day');
    const startSunday = start.clone().day(0); // Sunday of that week
    const end = moment.tz(range.end, timezone).endOf('day');
    const weeks = [];
    let cursor = startSunday.clone();
    while (cursor.isSameOrBefore(end, 'day')) {
      const week = [];
      for (let dow = 0; dow < 7; dow += 1) {
        const ymd = cursor.format('YYYY-MM-DD');
        const inRange = cursor.isSameOrAfter(start, 'day') && cursor.isSameOrBefore(end, 'day');
        const data = byDate.get(ymd);
        week.push({
          date: cursor.clone(),
          ymd,
          inRange,
          unique: data?.unique || 0,
          total: data?.total || 0
        });
        cursor = cursor.clone().add(1, 'day');
      }
      weeks.push(week);
    }

    return { weeks, max, totalDays };
  }, [stats.data, range?.start, range?.end, timezone]);

  if (stats.loading) {
    return (
      <MainCard title="Season at a glance">
        <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  if (!grid || grid.totalDays === 0) {
    return (
      <MainCard title="Season at a glance">
        <EmptyState
          icon={<IconCalendar size={32} stroke={1.5} />}
          title="No viewer activity in this range yet"
          description="Once your show starts running, the calendar will fill in night by night."
        />
      </MainCard>
    );
  }

  // Detect month boundaries for row labels at the top
  const monthLabels = grid.weeks.map((week, i) => {
    const monthStart = week.find((d) => d.date.date() === 1 || (i === 0 && d.inRange));
    if (!monthStart) return '';
    if (i === 0) return monthStart.date.format('MMM');
    // Only show month label when this week starts a new month
    const prevWeekLastDay = grid.weeks[i - 1][6];
    if (prevWeekLastDay.date.month() !== week[0].date.month()) {
      return week[0].date.format('MMM');
    }
    return '';
  });

  return (
    <MainCard
      title="Season at a glance"
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {grid.totalDays} active {grid.totalDays === 1 ? 'night' : 'nights'} · darker = more viewers
        </Typography>
      }
    >
      <Box sx={{ overflowX: 'auto' }}>
        <Stack direction="row" spacing={0.5} sx={{ minWidth: 'fit-content' }}>
          {/* Day-of-week labels column */}
          <Stack spacing={0.5} sx={{ pr: 0.5, justifyContent: 'flex-end' }}>
            <Box sx={{ height: 14 }} /> {/* spacer for month-label row */}
            {DOW_LABELS.map((label, i) => (
              <Box
                key={i}
                sx={{
                  height: 14,
                  fontSize: 10,
                  color: 'text.disabled',
                  display: 'flex',
                  alignItems: 'center',
                  pr: 0.5
                }}
              >
                {label}
              </Box>
            ))}
          </Stack>

          {/* Weeks (columns) */}
          {grid.weeks.map((week, wIdx) => (
            <Stack key={wIdx} spacing={0.5}>
              <Box sx={{ height: 14, fontSize: 10, color: 'text.secondary', textAlign: 'left' }}>
                {monthLabels[wIdx]}
              </Box>
              {week.map((day) => {
                const intensity = grid.max > 0 ? day.unique / grid.max : 0;
                const tooltip = `${day.date.format('ddd MMM D, YYYY')}${day.inRange ? ` — ${day.unique} viewer${day.unique === 1 ? '' : 's'}` : ' (out of range)'}`;
                return (
                  <Box
                    key={day.ymd}
                    title={tooltip}
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: 0.5,
                      bgcolor: day.inRange ? colorFor(intensity) : 'transparent',
                      border: (t) =>
                        day.inRange && intensity === 0
                          ? `1px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'}`
                          : day.inRange
                            ? 'none'
                            : `1px dashed ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'}`,
                      cursor: 'default',
                      transition: 'background 200ms ease'
                    }}
                  />
                );
              })}
            </Stack>
          ))}
        </Stack>

        {/* Legend */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1.5, justifyContent: 'flex-end' }}>
          <Typography variant="caption" sx={{ color: 'text.disabled', mr: 0.5 }}>
            less
          </Typography>
          {[0.05, 0.25, 0.5, 0.75, 1.0].map((intensity) => (
            <Box
              key={intensity}
              sx={{
                width: 12,
                height: 12,
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
    </MainCard>
  );
};

export default CalendarHeatmap;
