import { useMemo, useState } from 'react';
import * as React from 'react';

import { Box, Chip, Divider, IconButton, Popover, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { IconActivityHeartbeat, IconInfoCircle, IconPlugConnected, IconPlugConnectedX } from '@tabler/icons-react';
import moment from 'moment';

import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { useSelector } from '../../../../store';
import MainCard from '../../../../ui-component/cards/MainCard';

// Dashboard FPP-plugin status card (V17 + V18-lite, PSA-v2 dashboard restructure).
//
// Compact tile that sits in the "Right now" stats band: it shows just the
// connection status + last heartbeat at a glance. The heavier data — plugin/FPP
// versions, last-7-days uptime strip, and version-change history — moved behind
// an info-button popover so the card stays tile-sized and doesn't crowd the row.

const STRIP_DAYS = 7;
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000; // matches plugins-api gap threshold

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
  // Popover anchor for the details (versions + uptime + history).
  const [detailsAnchor, setDetailsAnchor] = useState(null);

  const { data: stats, loading } = useDashboardLiveStats();

  const stripWindow = useMemo(() => {
    const now = Date.now();
    return { start: now - STRIP_DAYS * 24 * 60 * 60 * 1000, end: now };
  }, [stats]); // eslint-disable-line react-hooks/exhaustive-deps

  const isConnected = useMemo(
    () => !!stats?.lastHeartbeatMs && Date.now() - stats.lastHeartbeatMs < HEARTBEAT_FRESH_MS,
    [stats]
  );

  if (loading) {
    return <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />;
  }

  const hasEverConnected = !!stats?.lastHeartbeatMs;
  const gaps = stats?.heartbeatGaps || [];
  const versionChanges = stats?.versionChanges || [];
  const lastUpgrade = versionChanges[0]; // backend pre-sorts most-recent-first

  const statusColor = isConnected ? 'success.main' : hasEverConnected ? 'error.main' : 'text.disabled';
  const statusLabel = isConnected ? 'Connected' : hasEverConnected ? 'Offline' : 'Never connected';

  return (
    <>
      <MainCard sx={{ height: '100%' }} contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }} data-testid="dashboard-show-health">
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ height: '100%' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
              <Box sx={{ color: statusColor, display: 'inline-flex' }}>
                {isConnected ? <IconPlugConnected size={16} stroke={1.75} /> : <IconPlugConnectedX size={16} stroke={1.75} />}
              </Box>
              <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                FPP plugin
              </Typography>
            </Stack>
            <Typography variant="h4" sx={{ fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>
              {statusLabel}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12, mt: 0.25 }} noWrap>
              {hasEverConnected ? `Last heartbeat ${formatAgo(stats.lastHeartbeatMs)}` : 'Install the plugin to start syncing'}
            </Typography>
          </Box>
          {hasEverConnected && (
            <Tooltip title="Versions & 7-day uptime">
              <IconButton
                size="small"
                onClick={(e) => setDetailsAnchor(e.currentTarget)}
                aria-label="Plugin details"
                data-testid="dashboard-health-details"
                sx={{ color: 'text.secondary', mt: -0.5, mr: -0.5, flexShrink: 0 }}
              >
                <IconInfoCircle size={18} stroke={1.75} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </MainCard>

      <Popover
        open={Boolean(detailsAnchor)}
        anchorEl={detailsAnchor}
        onClose={() => setDetailsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { borderRadius: 2 } } }}
      >
        <Box sx={{ p: 2.5, width: 340 }}>
          {/* Versions */}
          <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}>
            Versions
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5, mb: lastUpgrade ? 0.5 : 1.5, alignItems: 'center' }}>
            {show?.pluginVersion && (
              <Chip size="small" label={`Plugin ${show.pluginVersion}`} sx={{ height: 22, fontSize: 11, fontFamily: 'monospace' }} />
            )}
            {show?.fppVersion && (
              <Chip size="small" label={`FPP ${show.fppVersion}`} sx={{ height: 22, fontSize: 11, fontFamily: 'monospace' }} />
            )}
            {!show?.pluginVersion && !show?.fppVersion && (
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                No version reported yet
              </Typography>
            )}
          </Box>
          {lastUpgrade && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
              Last upgraded {formatAgo(lastUpgrade.atMs)}
            </Typography>
          )}

          {/* 7-day uptime strip */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <IconActivityHeartbeat size={16} stroke={1.75} />
              <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                Last {STRIP_DAYS} days
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
              {gaps.length === 0 ? 'No outages' : `${gaps.length} gap${gaps.length === 1 ? '' : 's'}`}
            </Typography>
          </Stack>
          <Box
            sx={{
              position: 'relative',
              height: 24,
              borderRadius: 1,
              overflow: 'hidden',
              bgcolor: 'success.main',
              opacity: 0.85
            }}
          >
            {gaps.map((g, i) => (
              <GapSegment key={i} stripStartMs={stripWindow.start} stripEndMs={stripWindow.end} gap={g} />
            ))}
          </Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
              {moment(stripWindow.start).format('MMM D')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
              now
            </Typography>
          </Stack>

          {/* Version history */}
          {versionChanges.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}>
                Version history
              </Typography>
              <Box
                sx={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  mt: 0.5,
                  mr: -1.5,
                  pr: 1.5,
                  '&::-webkit-scrollbar': { width: 6 },
                  '&::-webkit-scrollbar-thumb': {
                    bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)'),
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
            </>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default HealthRow;
