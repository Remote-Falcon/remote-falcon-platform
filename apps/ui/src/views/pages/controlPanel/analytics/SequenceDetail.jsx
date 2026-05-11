import { useMemo } from 'react';
import * as React from 'react';

import { Box, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { IconArrowLeft, IconCalendar, IconMusic, IconTrendingUp } from '@tabler/icons-react';
import _ from 'lodash';
import moment from 'moment-timezone';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import PageHead from '../../../../ui-component/PageHead';
import { useSelector } from '../../../../store';
import { ViewerControlMode } from '../../../../utils/enum';

import useAnalyticsFilters from './useAnalyticsFilters';
import useDashboardStats from './useDashboardStats';

// V13 — Sequence detail entity page.
//
// Bookmarkable URL `/control-panel/analytics/sequences/:sequenceName` —
// per the PRD, owners share these in Facebook groups so the URL itself
// is the win. Renders:
//   • Header: image (if present) + name + back link
//   • 3 hero stats: total in range / peak day / active days
//   • Per-day time-series for this sequence
//
// Hour-of-night-for-this-sequence and queue-position distribution are
// nice follow-ups but require a sequence-aware backend aggregator —
// deferred to P1 alongside the session work.

const StatTile = ({ label, value, sub, icon, accent = 'text.secondary' }) => (
  <MainCard
    sx={{
      height: '100%',
      bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
    }}
    contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }}
  >
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.4 }}>
          {label}
        </Typography>
        <Typography variant="h2" sx={{ mt: 0.5, fontWeight: 700, fontSize: 28, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" sx={{ color: accent, fontSize: 12 }}>
            {sub}
          </Typography>
        )}
      </Box>
      {icon && <Box sx={{ color: accent, opacity: 0.4 }}>{icon}</Box>}
    </Stack>
  </MainCard>
);

const TimeSeriesSparkline = ({ days, timezone }) => {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.value));
  const width = 800;
  const height = 200;
  const stepX = days.length > 1 ? width / (days.length - 1) : width;
  const points = days
    .map((d, i) => {
      const x = i * stepX;
      const y = height - (d.value / max) * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  // Build the area-fill path
  const areaPath = `M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z`;

  return (
    <Box sx={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <svg
          width="100%"
          height={height + 32}
          viewBox={`0 0 ${width} ${height + 32}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Per-day time series"
          style={{ display: 'block', minWidth: 320 }}
        >
          <defs>
            <linearGradient id="seqDetailFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(31,119,120)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="rgb(31,119,120)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#seqDetailFill)" />
          <polyline points={points} fill="none" stroke="rgb(31,119,120)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {days.map((d, i) => {
            const x = i * stepX;
            const y = height - (d.value / max) * (height - 20) - 10;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="3" fill="rgb(31,119,120)">
                  <title>{`${moment.tz(d.date, timezone).format('ddd MMM D')} — ${d.value}`}</title>
                </circle>
              </g>
            );
          })}
          {/* X-axis labels: first, last, middle */}
          {[0, Math.floor(days.length / 2), days.length - 1].map((idx, i) => {
            if (days[idx] == null) return null;
            const x = idx * stepX;
            return (
              <text
                key={i}
                x={x}
                y={height + 22}
                fontSize="11"
                textAnchor={idx === 0 ? 'start' : idx === days.length - 1 ? 'end' : 'middle'}
                fill="currentColor"
                opacity="0.55"
              >
                {moment.tz(days[idx].date, timezone).format('MMM D')}
              </text>
            );
          })}
        </svg>
      </Box>
    </Box>
  );
};

const SequenceDetail = () => {
  const { sequenceName: encodedName } = useParams();
  const sequenceName = decodeURIComponent(encodedName);
  const navigate = useNavigate();
  const { range, timezone, presetLabel } = useAnalyticsFilters();
  const { show } = useSelector((state) => state.show);
  const stats = useDashboardStats(range);

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;
  const sourceField = isJukebox ? 'jukeboxByDate' : 'votingByDate';
  const verb = isJukebox ? 'requested' : 'voted';

  // Find this sequence in the show.sequences[] for image + display name + category
  const sequence = useMemo(
    () => (show?.sequences || []).find((s) => s.name === sequenceName),
    [show?.sequences, sequenceName]
  );

  // Per-day series for THIS sequence — extract from per-day breakdown
  const dailySeries = useMemo(() => {
    const days = stats.data?.[sourceField] || [];
    return days
      .map((day) => {
        const seqEntry = (day.sequences || []).find((s) => s.name === sequenceName);
        return { date: day.date, value: seqEntry?.total || 0 };
      })
      .filter((d) => d.date != null);
  }, [stats.data, sourceField, sequenceName]);

  const totalsInRange = useMemo(() => dailySeries.reduce((acc, d) => acc + d.value, 0), [dailySeries]);
  const peakDay = useMemo(
    () => dailySeries.reduce((best, cur) => (cur.value > (best?.value || 0) ? cur : best), null),
    [dailySeries]
  );
  const activeDays = useMemo(() => dailySeries.filter((d) => d.value > 0).length, [dailySeries]);

  const displayName = sequence?.displayName || sequenceName;

  if (stats.loading) {
    return (
      <Box>
        <PageHead
          title={<Skeleton width={240} />}
          description={<Skeleton width={120} />}
        />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          mb: 2,
          color: 'text.secondary',
          fontSize: 13,
          cursor: 'pointer',
          width: 'fit-content',
          '&:hover': { color: 'text.primary' }
        }}
        component={RouterLink}
        to="/control-panel/analytics/sequences"
        style={{ textDecoration: 'none' }}
      >
        <IconArrowLeft size={16} stroke={1.75} />
        <Typography variant="body2" sx={{ color: 'inherit' }}>
          Back to sequences
        </Typography>
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        {sequence?.imageUrl ? (
          <Box
            component="img"
            src={sequence.imageUrl}
            alt=""
            sx={{
              width: 64,
              height: 64,
              borderRadius: 1,
              objectFit: 'cover',
              flexShrink: 0
            }}
          />
        ) : (
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              bgcolor: (t) =>
                t.palette.mode === 'dark' ? 'rgba(255,167,38,0.16)' : 'rgba(255,152,0,0.14)',
              color: 'warning.main',
              flexShrink: 0
            }}
          >
            <IconMusic size={32} stroke={1.5} />
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', display: 'block' }}>
            Sequence · {presetLabel}
          </Typography>
          <Typography variant="h1" sx={{ fontWeight: 600, fontSize: 28, lineHeight: 1.2 }}>
            {displayName}
          </Typography>
          {sequence && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {sequence.artist || 'Unknown artist'}
              {sequence.category && ` · ${sequence.category}`}
              {sequence.active === false && ' · Inactive'}
            </Typography>
          )}
        </Box>
      </Stack>

      {totalsInRange === 0 ? (
        <MainCard>
          <EmptyState
            icon={<IconMusic size={32} stroke={1.5} />}
            title={`No ${verb} activity for "${displayName}" in this range`}
            description="Try a wider date range or come back after a few show nights."
          />
        </MainCard>
      ) : (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <StatTile
                label={isJukebox ? 'Total requests' : 'Total votes'}
                value={totalsInRange}
                sub={`across ${dailySeries.length} ${dailySeries.length === 1 ? 'day' : 'days'} in range`}
                icon={<IconTrendingUp size={28} stroke={1.5} />}
                accent="primary.main"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatTile
                label="Peak day"
                value={peakDay && peakDay.value > 0 ? peakDay.value : '—'}
                sub={
                  peakDay && peakDay.value > 0
                    ? moment.tz(peakDay.date, timezone).format('ddd MMM D')
                    : 'no peak yet'
                }
                icon={<IconCalendar size={28} stroke={1.5} />}
                accent="warning.main"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatTile
                label="Active days"
                value={activeDays}
                sub={`of ${dailySeries.length} in range`}
                icon={<IconCalendar size={28} stroke={1.5} />}
                accent="success.main"
              />
            </Grid>
          </Grid>

          <MainCard
            title={isJukebox ? 'Requests over time' : 'Votes over time'}
            secondary={
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {dailySeries.length} {dailySeries.length === 1 ? 'day' : 'days'} in range
              </Typography>
            }
          >
            <TimeSeriesSparkline days={dailySeries} timezone={timezone} />
          </MainCard>
        </Stack>
      )}
    </Box>
  );
};

export default SequenceDetail;
