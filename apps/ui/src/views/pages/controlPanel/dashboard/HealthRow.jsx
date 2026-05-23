import { useMemo, useState } from 'react';
import * as React from 'react';

import { Box, Chip, Divider, Popover, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { IconActivityHeartbeat, IconHistory, IconPlugConnected, IconPlugConnectedX } from '@tabler/icons-react';
import moment from 'moment';

import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { useSelector } from '../../../../store';
import MainCard from '../../../../ui-component/cards/MainCard';

// Dashboard Health row (V17 + V18-lite).
//
// Pulls FPP heartbeat health and current plugin/FPP versions from the
// shared `useDashboardLiveStats` hook (5s poll, single source of truth
// across the dashboard). Renders:
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
  // V18 — popover anchor for the version-change timeline
  const [versionAnchor, setVersionAnchor] = useState(null);

  const { data: stats, loading } = useDashboardLiveStats();

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
      contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }}
      data-testid="dashboard-show-health"
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
              {isConnected ? <IconPlugConnected size={18} stroke={1.75} /> : <IconPlugConnectedX size={18} stroke={1.75} />}
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
                      icon={<IconHistory size={16} stroke={1.75} />}
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
              <IconActivityHeartbeat size={16} stroke={1.75} />
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
        slotProps={{ paper: { sx: { maxWidth: 360, minWidth: 280, borderRadius: 2 } } }}
      >
        {/* All content padding lives on this inner Box rather than the
            Paper's sx — `slotProps.paper` in this MUI version was emitting
            visibly thinner padding than the spacing prop suggested, so
            we apply it where we can verify it from the DOM. */}
        <Box sx={{ px: 3, py: 2.5 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}>
            Version history
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1.5 }}>
            Logged when the plugin reports a different version. Last 365 days.
          </Typography>
          {/* Cap height + scroll the list, not the whole popover, so the
              "Version history" header and caption stay visible while the
              user scrolls long histories. 320px fits ~10 rows comfortably;
              past that, the slim themed scrollbar kicks in. */}
          <Box
            sx={{
              maxHeight: 320,
              overflowY: 'auto',
              // Pull the scrollbar out to the popover edge so it doesn't
              // crowd the right-side timestamps. Symmetric `mr` keeps the
              // row content horizontally aligned with the header above it.
              mr: -1.5,
              pr: 1.5,
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)',
                borderRadius: 3
              },
              scrollbarWidth: 'thin'
            }}
          >
            {versionChanges.map((v, i) => (
              <Box key={i}>
                {i > 0 && <Divider sx={{ my: 0.5 }} />}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75, gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12, fontFamily: 'monospace' }} noWrap>
                      Plugin {v.pluginVersion || '—'}
                    </Typography>
                    <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary' }} noWrap>
                      FPP {v.fppVersion || '—'}
                    </Typography>
                  </Box>
                  <Tooltip title={moment(v.atMs).format('ddd MMM D, h:mm a')} placement="left">
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11, cursor: 'help', flexShrink: 0 }}>
                      {formatAgo(v.atMs)}
                    </Typography>
                  </Tooltip>
                </Stack>
              </Box>
            ))}
          </Box>
        </Box>
      </Popover>
    </MainCard>
  );
};

export default HealthRow;
