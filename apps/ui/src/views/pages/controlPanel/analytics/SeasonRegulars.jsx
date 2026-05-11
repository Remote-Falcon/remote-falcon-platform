import { useMemo } from 'react';
import * as React from 'react';

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { IconAward } from '@tabler/icons-react';
import moment from 'moment-timezone';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';

import useAnalyticsFilters from './useAnalyticsFilters';
import useViewerSessions from './useViewerSessions';

// V8 — Season regulars.
//
// Top 20 visitors by number of distinct show-nights attended in the
// range. Anonymized as "Viewer #1" through "Viewer #20" — never expose
// the underlying viewerId or ip-hash. Honesty footnote at the bottom.
const TOP_N = 20;

const SeasonRegulars = () => {
  const { range, timezone } = useAnalyticsFilters();
  const { sessions, loading } = useViewerSessions(range);

  const regulars = useMemo(() => {
    if (sessions.length === 0) return [];
    // Group by visitor identityKey, count distinct show-nights
    const byVisitor = new Map();
    sessions.forEach((s) => {
      if (!byVisitor.has(s.identityKey)) byVisitor.set(s.identityKey, new Set());
      const nightKey = moment.tz(s.firstSeen, timezone).startOf('day').valueOf();
      byVisitor.get(s.identityKey).add(nightKey);
    });
    const items = [...byVisitor.entries()]
      .map(([identityKey, nights]) => ({ identityKey, nightCount: nights.size }))
      .filter((x) => x.nightCount >= 2)  // at least 2 nights to be a "regular"
      .sort((a, b) => b.nightCount - a.nightCount)
      .slice(0, TOP_N);
    return items;
  }, [sessions, timezone]);

  // Total distinct show-nights — computed unconditionally to satisfy
  // rules-of-hooks (must be called before the early return below).
  const totalNights = useMemo(() => {
    const nights = new Set();
    sessions.forEach((s) => {
      nights.add(moment.tz(s.firstSeen, timezone).startOf('day').valueOf());
    });
    return nights.size;
  }, [sessions, timezone]);

  if (loading) {
    return (
      <MainCard title="Season regulars">
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
      </MainCard>
    );
  }

  if (regulars.length === 0) {
    return (
      <MainCard title="Season regulars">
        <EmptyState
          icon={<IconAward size={32} stroke={1.5} />}
          title="No regulars yet"
          description="After visitors come back on multiple nights, the regulars will rank here."
        />
      </MainCard>
    );
  }

  const max = regulars[0].nightCount;

  return (
    <MainCard
      title="Season regulars"
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {regulars.length} viewer{regulars.length === 1 ? '' : 's'} watched 2+ nights
        </Typography>
      }
    >
      <Stack spacing={0.5}>
        {regulars.map((r, i) => {
          const widthPct = (r.nightCount / max) * 100;
          return (
            <Stack
              key={r.identityKey}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{
                py: 0.5,
                px: 1,
                borderRadius: 1,
                '&:hover': {
                  bgcolor: (t) =>
                    t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                }
              }}
            >
              <Box
                sx={{
                  width: 24,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'text.secondary',
                  fontSize: 12
                }}
              >
                {i + 1}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Viewer #{i + 1}
                </Typography>
                <Box
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: (t) =>
                      t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    overflow: 'hidden'
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${Math.max(2, widthPct)}%`,
                      borderRadius: 3,
                      bgcolor: 'warning.main'
                    }}
                  />
                </Box>
              </Box>
              <Box
                sx={{
                  minWidth: 90,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 13
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {r.nightCount} nights
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  of {totalNights} total
                </Typography>
              </Box>
            </Stack>
          );
        })}
      </Stack>
      <Typography
        variant="caption"
        sx={{ display: 'block', color: 'text.disabled', fontStyle: 'italic', mt: 2, lineHeight: 1.5 }}
      >
        Returning-visitor counts are based on a per-device identifier stored in the browser. Cleared browser
        data and incognito sessions count as new viewers. Multi-device viewers (phone + tablet) count once
        per device.
      </Typography>
    </MainCard>
  );
};

export default SeasonRegulars;
