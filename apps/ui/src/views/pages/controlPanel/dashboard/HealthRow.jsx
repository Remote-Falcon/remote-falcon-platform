import { useCallback, useEffect, useMemo, useState } from 'react';
import * as React from 'react';

import { useLazyQuery } from '@apollo/client';
import { Box, Chip, Popover, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { IconActivityHeartbeat, IconHistory, IconPlugConnected, IconPlugConnectedX } from '@tabler/icons-react';
import moment from 'moment';

import useInterval from '../../../../hooks/useInterval';
import { useSelector } from '../../../../store';
import MainCard from '../../../../ui-component/cards/MainCard';
import { DASHBOARD_LIVE_STATS } from '../../../../utils/graphql/controlPanel/queries';

// Dashboard Health row (V17 + V18-lite).
//
// Pulls FPP heartbeat health and current plugin/FPP versions from the
// already-polled dashboardLiveStats query. Renders:
//   • Status pill — Connected / Disconnected (with how-long-ago)
//   • Version chips — plugin / FPP versions reported by the most recent connect
//   • Heartbeat strip — last 7 days as a horizontal bar; green for healthy,
//     red for gap windows (>5 min without a heartbeat). Hover for details.

const STRIP_DAYS = 7;
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;  // matches plugins-api gap threshold

const formatAgo = (ms) => {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.round(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.round(diff / (60 * 60 * 1000))}h ago`;
  return `${Math.round(diff / (24 * 60 * 60 * 1000))}d ago`;
};

const formatGapDuration = (startMs, endMs) => {
  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

// Render a single gap segment as an absolutely-positioned red band on the strip.
const GapSegment = ({ stripStartMs, stripEndMs, gap }) => {
  const totalMs = stripEndMs - stripStartMs;
  // Clip the gap to the strip's window, in case the gap predates STRIP_DAYS.
  const clippedStart = Math.max(stripStartMs, gap.startedAtMs);
  const clippedEnd = Math.min(stripEndMs, gap.endedAtMs);
  if (clippedEnd <= clippedStart) return null;
  const leftPct = ((clippedStart - stripStartMs) / totalMs) * 100;
  const widthPct = Math.max(0.3, ((clippedEnd - clippedStart) / totalMs) * 100);
  return (
    <Tooltip
      title={`Plugin offline for ${formatGapDuration(gap.startedAtMs, gap.endedAtMs)} (${moment(gap.startedAtMs).format('ddd h:mm a')} → ${moment(gap.endedAtMs).format('h:mm a')})`}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          bgcolor: 'error.main',
          opacity: 0.85,
          transition: 'opacity 150ms ease',
          '&:hover': { opacity: 1 }
        }}
      />
    </Tooltip>
  );
};

const HealthRow = () => {
  const { show } = useSelector((state) => state.show);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  // V18 — popover anchor for the version-change timeline
  const [versionAnchor, setVersionAnchor] = useState(null);

  const [liveStatsQuery] = useLazyQuery(DASHBOARD_LIVE_STATS);

  const fetch = useCallback(async () => {
    if (!show?.timezone) return;
    await liveStatsQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: {
        startDate: new Date().setHours(0, 0, 0),
        endDate: new Date().setHours(23, 59, 59),
        timezone: show.timezone
      },
      onCompleted: (data) => {
        setStats(data?.dashboardLiveStats || {});
        setLoading(false);
      },
      onError: () => setLoading(false)
    });
  }, [liveStatsQuery, show?.timezone]);

  useEffect(() => {
    setLoading(true);
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.timezone]);

  // Heartbeat health doesn't change minute-to-minute; 30s is fine here even
  // though LiveStatsRow polls dashboardLiveStats at 5s.
  useInterval(fetch, 30 * 1000);

  const stripWindow = useMemo(() => {
    const now = Date.now();
    return { start: now - STRIP_DAYS * 24 * 60 * 60 * 1000, end: now };
  }, [stats]);  // eslint-disable-line react-hooks/exhaustive-deps

  const isConnected = useMemo(
    () => !!stats?.lastHeartbeatMs && Date.now() - stats.lastHeartbeatMs < HEARTBEAT_FRESH_MS,
    [stats]
  );

  if (loading) {
    return (
      <Skeleton variant="rectangular" height={108} sx={{ borderRadius: 1 }} />
    );
  }

  const hasEverConnected = !!stats?.lastHeartbeatMs;
  const gaps = stats?.heartbeatGaps || [];
  const versionChanges = stats?.versionChanges || [];
  const lastUpgrade = versionChanges[0]; // backend pre-sorts most-recent-first

  return (
    <MainCard
      sx={{
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
      }}
      contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 2, md: 3 }}
        alignItems={{ xs: 'stretch', md: 'center' }}
      >
        {/* Status + versions */}
        <Box sx={{ minWidth: { md: 260 } }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Box
              sx={{
                color: isConnected ? 'success.main' : hasEverConnected ? 'error.main' : 'text.disabled',
                display: 'inline-flex'
              }}
            >
              {isConnected ? <IconPlugConnected size={20} stroke={1.75} /> : <IconPlugConnectedX size={20} stroke={1.75} />}
            </Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.2 }}>
              FPP plugin
            </Typography>
          </Stack>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>
            {isConnected ? 'Connected' : hasEverConnected ? 'Offline' : 'Never connected'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12, mt: 0.25 }}>
            {hasEverConnected ? `Last heartbeat ${formatAgo(stats.lastHeartbeatMs)}` : 'Install the Remote Falcon FPP plugin to start syncing'}
          </Typography>
          {(show?.pluginVersion || show?.fppVersion) && (
            <>
              <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {show?.pluginVersion && (
                  <Chip
                    size="small"
                    label={`Plugin ${show.pluginVersion}`}
                    sx={{ height: 22, fontSize: 11, fontFamily: 'monospace' }}
                  />
                )}
                {show?.fppVersion && (
                  <Chip
                    size="small"
                    label={`FPP ${show.fppVersion}`}
                    sx={{ height: 22, fontSize: 11, fontFamily: 'monospace' }}
                  />
                )}
                {versionChanges.length > 0 && (
                  <Tooltip title="View version history">
                    <Chip
                      size="small"
                      icon={<IconHistory size={12} stroke={1.75} />}
                      label={`${versionChanges.length}`}
                      onClick={(e) => setVersionAnchor(e.currentTarget)}
                      sx={{ height: 22, fontSize: 11, cursor: 'pointer', '& .MuiChip-icon': { ml: 0.5 } }}
                    />
                  </Tooltip>
                )}
              </Stack>
              {lastUpgrade && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 11 }}>
                  Last upgraded {formatAgo(lastUpgrade.atMs)}
                </Typography>
              )}
            </>
          )}
        </Box>

        {/* Heartbeat strip */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <IconActivityHeartbeat size={14} stroke={1.75} />
              <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                Last {STRIP_DAYS} days
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
              {gaps.length === 0
                ? hasEverConnected
                  ? 'No outages'
                  : '—'
                : `${gaps.length} gap${gaps.length === 1 ? '' : 's'}`}
            </Typography>
          </Stack>
          <Tooltip title={hasEverConnected ? '' : 'Strip will populate after the plugin sends its first heartbeat'}>
            <Box
              sx={{
                position: 'relative',
                height: 24,
                borderRadius: 1,
                overflow: 'hidden',
                bgcolor: hasEverConnected ? 'success.main' : 'action.disabledBackground',
                opacity: hasEverConnected ? 0.85 : 0.4
              }}
            >
              {gaps.map((g, i) => (
                <GapSegment
                  key={i}
                  stripStartMs={stripWindow.start}
                  stripEndMs={stripWindow.end}
                  gap={g}
                />
              ))}
            </Box>
          </Tooltip>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
              {moment(stripWindow.start).format('MMM D')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
              now
            </Typography>
          </Stack>
        </Box>
      </Stack>

      <Popover
        open={Boolean(versionAnchor)}
        anchorEl={versionAnchor}
        onClose={() => setVersionAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 360, minWidth: 280 } } }}
      >
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}>
          Version history
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1.5 }}>
          Logged when the plugin reports a different version. Last 365 days.
        </Typography>
        <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
          {versionChanges.map((v, i) => (
            <Stack key={i} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75 }}>
              <Box>
                <Typography sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                  Plugin {v.pluginVersion || '—'}
                </Typography>
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary' }}>
                  FPP {v.fppVersion || '—'}
                </Typography>
              </Box>
              <Tooltip title={moment(v.atMs).format('ddd MMM D, h:mm a')} placement="left">
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11, cursor: 'help' }}>
                  {formatAgo(v.atMs)}
                </Typography>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      </Popover>
    </MainCard>
  );
};

export default HealthRow;
