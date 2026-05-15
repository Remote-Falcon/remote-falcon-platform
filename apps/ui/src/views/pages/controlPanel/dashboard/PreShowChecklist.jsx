import { useMemo, useState } from 'react';
import * as React from 'react';

import { Box, Collapse, IconButton, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheck,
  IconCircleX
} from '@tabler/icons-react';

import MainCard from '../../../../ui-component/cards/MainCard';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { useSelector } from '../../../../store';
import { LocationCheckMethod } from '../../../../utils/enum';

// Plugin is "connected" if a heartbeat landed within this window. Matches
// HealthRow's HEARTBEAT_FRESH_MS and the backend's HEARTBEAT_GAP_THRESHOLD_MINUTES
// so the readiness checklist and the live status widget can never disagree.
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;

// Operational readiness card for the Dashboard. "Is my show ready to run
// tonight?" — sister to the live stats. Sits above LiveStatsRow.
//
// Behavior:
//   • Has blockers → expanded by default, red header
//   • Has only warnings → expanded by default, amber header
//   • All passing → collapsed by default, green header summary
//
// All checks derive from `show.preferences` and `show.pages` — no
// schema additions required.
const STATUS = {
  ok: {
    icon: <IconCheck size={18} stroke={2} />,
    color: 'success.main',
    bg: (t) => alpha(t.palette.success.main, t.palette.mode === 'dark' ? 0.1 : 0.08)
  },
  warn: {
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    color: 'warning.main',
    bg: (t) => alpha(t.palette.warning.main, t.palette.mode === 'dark' ? 0.12 : 0.1)
  },
  blocker: {
    icon: <IconCircleX size={18} stroke={1.75} />,
    color: 'error.main',
    bg: (t) => alpha(t.palette.error.main, t.palette.mode === 'dark' ? 0.12 : 0.1)
  }
};

const StatusRow = ({ status, label, detail }) => {
  const cfg = STATUS[status];
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ px: 2, py: 1.5, borderRadius: 1, bgcolor: cfg.bg }}
    >
      <Box sx={{ color: cfg.color, display: 'inline-flex' }}>{cfg.icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        {detail && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {detail}
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

const useChecks = () => {
  const { show } = useSelector((state) => state.show);
  // Live-polled (5s) heartbeat — same source HealthRow uses. Reading the
  // frozen value off `show.lastFppHeartbeat` in Redux drifts stale the
  // longer the dashboard stays open, so we let the hook keep it fresh.
  const { data: liveStats } = useDashboardLiveStats();
  const lastHeartbeatMs = liveStats?.lastHeartbeatMs;

  return useMemo(() => {
    const out = [];
    const prefs = show?.preferences || {};
    const pages = show?.pages || [];
    const sequences = show?.sequences || [];
    const activeSequenceCount = sequences.filter((s) => s.active).length;
    const activePages = pages.filter((p) => p.active);

    if (pages.length === 0) {
      out.push({
        status: 'blocker',
        label: 'No viewer pages have been created',
        detail: 'Create a viewer page in the Viewer Page section before going live.'
      });
    } else if (activePages.length === 0) {
      out.push({
        status: 'blocker',
        label: 'No active viewer page selected',
        detail: 'Pick an active viewer page in Settings → Viewer Page.'
      });
    } else {
      out.push({ status: 'ok', label: `Active viewer page: ${activePages[0].name}` });
    }

    if (sequences.length === 0) {
      out.push({
        status: 'blocker',
        label: 'No sequences imported',
        detail: 'Import sequences from your sequencer before viewers can request anything.'
      });
    } else if (activeSequenceCount === 0) {
      out.push({
        status: 'warn',
        label: `${sequences.length} sequences imported, but none are active`,
        detail: 'Mark at least one sequence active for it to appear in the viewer page.'
      });
    } else {
      out.push({
        status: 'ok',
        label: `${activeSequenceCount} of ${sequences.length} sequences active`
      });
    }

    if (prefs.locationCheckMethod === LocationCheckMethod.GEO) {
      if (!prefs.allowedRadius || prefs.allowedRadius <= 0) {
        out.push({
          status: 'blocker',
          label: 'GPS check enabled but no radius set',
          detail: 'Set a check radius in Settings → Interaction Safeguards.'
        });
      } else if (prefs.allowedRadius > 5) {
        out.push({
          status: 'warn',
          label: `Geofence radius is ${prefs.allowedRadius} miles — wider than typical residential setups`,
          detail: 'Most shows run at ≤2 miles to keep requests local.'
        });
      } else {
        out.push({ status: 'ok', label: `Geofence radius: ${prefs.allowedRadius} miles` });
      }
    }

    if (!prefs.viewerControlEnabled) {
      out.push({
        status: 'warn',
        label: 'Viewer control is currently disabled',
        detail: 'Viewers can see the show page but cannot request or vote.'
      });
    } else {
      out.push({
        status: 'ok',
        label: `Viewer control enabled (${(prefs.viewerControlMode || 'JUKEBOX').toLowerCase()} mode)`
      });
    }

    if (prefs.viewerPageViewOnly) {
      out.push({
        status: 'warn',
        label: 'Viewer page is in view-only mode',
        detail: 'Viewers cannot interact. Disable in Settings → Viewer Page if unintended.'
      });
    }

    if (!lastHeartbeatMs) {
      out.push({
        status: 'warn',
        label: 'No FPP plugin heartbeat received yet',
        detail: 'Install or restart the Remote Falcon FPP plugin to start syncing.'
      });
    } else {
      const ageMs = Math.max(0, Date.now() - lastHeartbeatMs);
      const minutesAgo = Math.floor(ageMs / 60000);
      if (ageMs >= HEARTBEAT_FRESH_MS) {
        out.push({
          status: 'warn',
          label: `FPP plugin offline (last heartbeat ${minutesAgo} min ago)`,
          detail: 'Show may not be running. Check the FPP controller.'
        });
      } else {
        out.push({
          status: 'ok',
          label: `FPP plugin connected ${minutesAgo === 0 ? 'just now' : `${minutesAgo} min ago`}`
        });
      }
    }

    const order = { blocker: 0, warn: 1, ok: 2 };
    out.sort((a, b) => order[a.status] - order[b.status]);
    return out;
  }, [show, lastHeartbeatMs]);
};

const PreShowChecklist = () => {
  const checks = useChecks();
  const blockers = checks.filter((c) => c.status === 'blocker').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const passing = checks.filter((c) => c.status === 'ok').length;

  // Worst status drives the header treatment. Default-expand when there's
  // a blocker or warning; default-collapse when all passing so the
  // dashboard stays uncluttered.
  const worst = blockers > 0 ? 'blocker' : warnings > 0 ? 'warn' : 'ok';
  const [open, setOpen] = useState(worst !== 'ok');

  const headerCfg =
    worst === 'blocker'
      ? { icon: <IconCircleX size={18} stroke={1.75} />, color: 'error.main', label: `${blockers} blocker${blockers === 1 ? '' : 's'} · ${warnings} warning${warnings === 1 ? '' : 's'}` }
      : worst === 'warn'
        ? { icon: <IconAlertTriangle size={18} stroke={1.75} />, color: 'warning.main', label: `${warnings} warning${warnings === 1 ? '' : 's'}` }
        : { icon: <IconCircleCheck size={18} stroke={1.75} />, color: 'success.main', label: `All ${passing} pre-show checks passing` };

  return (
    <MainCard
      sx={{
        bgcolor: (t) =>
          worst === 'blocker'
            ? alpha(t.palette.error.main, t.palette.mode === 'dark' ? 0.06 : 0.04)
            : worst === 'warn'
              ? alpha(t.palette.warning.main, t.palette.mode === 'dark' ? 0.06 : 0.04)
              : 'transparent'
      }}
      contentSX={{ p: 0, '&:last-child': { pb: 0 } }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') }
        }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        aria-label="Toggle pre-show checklist"
      >
        <Box sx={{ color: headerCfg.color, display: 'inline-flex' }}>{headerCfg.icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Pre-show readiness
          </Typography>
          <Typography variant="caption" sx={{ color: headerCfg.color, fontWeight: 500 }}>
            {headerCfg.label}
          </Typography>
        </Box>
        <IconButton size="small" sx={{ color: 'text.secondary' }} aria-hidden tabIndex={-1}>
          {open ? <IconChevronUp size={18} stroke={1.75} /> : <IconChevronDown size={18} stroke={1.75} />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Stack spacing={1.5} sx={{ p: 2, pt: 0 }}>
          {checks.map((c, i) => (
            <StatusRow key={i} status={c.status} label={c.label} detail={c.detail} />
          ))}
        </Stack>
      </Collapse>
    </MainCard>
  );
};

export default PreShowChecklist;
