import { useCallback, useMemo, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheck,
  IconCircleX
} from '@tabler/icons-react';
import _ from 'lodash';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import MainCard from '../../../../ui-component/cards/MainCard';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { LocationCheckMethod } from '../../../../utils/enum';
import { UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

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

const StatusRow = ({ status, label, detail, action }) => {
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
      {action && (
        <Button size="small" variant="outlined" onClick={action.onClick} sx={{ flexShrink: 0 }}>
          {action.label}
        </Button>
      )}
    </Stack>
  );
};

const useChecks = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { show } = useSelector((state) => state.show);
  // Live-polled (5s) heartbeat — same source HealthRow uses. Reading the
  // frozen value off `show.lastFppHeartbeat` in Redux drifts stale the
  // longer the dashboard stays open, so we let the hook keep it fresh.
  const { data: liveStats } = useDashboardLiveStats();
  const lastHeartbeatMs = liveStats?.lastHeartbeatMs;

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  // Helper for nav-style actions ("take me to the setting that fixes
  // this"). Toggle actions live separately via togglePreference below
  // because they can fix the issue in place without a page change.
  const goTo = useCallback((path) => () => navigate(path), [navigate]);

  // Shared toggle handler for self-fixing warning rows. Same mutation +
  // setShow sync used by the dashboard header toggle and the Settings
  // page, so all three surfaces stay in lockstep. PostHog `source` tags
  // identify which surface fired the toggle for funnel analysis.
  const togglePreference = useCallback(
    (field, value, message, posthogEvent) => {
      const updatedPreferences = _.cloneDeep({ ...show?.preferences, [field]: value });
      savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
        if (response?.success) {
          dispatch(setShow({ ...show, preferences: updatedPreferences }));
          showAlert(dispatch, { message });
          if (posthogEvent) {
            trackPosthogEvent(posthogEvent, { enabled: value, source: 'preshow_checklist' });
          }
        } else {
          showAlert(dispatch, response?.toast);
        }
      });
    },
    [dispatch, show, updatePreferencesMutation]
  );

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
        detail: 'Create a viewer page in the Viewer Page section before going live.',
        action: { label: 'Open viewer page', onClick: goTo('/control-panel/viewer-page') }
      });
    } else if (activePages.length === 0) {
      out.push({
        status: 'blocker',
        label: 'No active viewer page selected',
        detail: 'Pick an active viewer page in Settings → Viewer Page.',
        action: { label: 'Open settings', onClick: goTo('/control-panel/remote-falcon-settings/viewer-page') }
      });
    } else {
      out.push({ status: 'ok', label: `Active viewer page: ${activePages[0].name}` });
    }

    if (sequences.length === 0) {
      out.push({
        status: 'blocker',
        label: 'No sequences imported',
        detail: 'Sync your sequences from FPP — the FPP plugin\'s "Sync Playlists" pushes them here.',
        action: { label: 'Open sequences', onClick: goTo('/control-panel/sequences/list') }
      });
    } else if (activeSequenceCount === 0) {
      out.push({
        status: 'warn',
        label: `${sequences.length} sequences imported, but none are active`,
        detail: 'Activate at least one sequence so it appears on the viewer page.',
        action: { label: 'Open sequences', onClick: goTo('/control-panel/sequences/list') }
      });
    } else {
      out.push({
        status: 'ok',
        label: `${activeSequenceCount} of ${sequences.length} sequences active`
      });
    }

    // Location check rows always lead with "Location check:" followed by
    // the chosen method's specifics, so all three modes (GPS / Code / off)
    // render in a consistent shape regardless of state.
    // Location check rows always lead with "Location check:" followed by
    // the chosen method's specifics, so all three modes (GPS / Code / off)
    // render in a consistent shape regardless of state.
    const safeguards = { label: 'Open safeguards', onClick: goTo('/control-panel/remote-falcon-settings/safeguards') };
    if (prefs.locationCheckMethod === LocationCheckMethod.GEO) {
      if (!prefs.allowedRadius || prefs.allowedRadius <= 0) {
        out.push({
          status: 'blocker',
          label: 'Location check: GPS (no radius set)',
          detail: 'Set a check radius in Settings → Interaction Safeguards.',
          action: safeguards
        });
      } else if (prefs.allowedRadius > 5) {
        out.push({
          status: 'warn',
          label: `Location check: GPS (${prefs.allowedRadius} mile geofence radius)`,
          detail: 'Wider than typical residential setups — most shows run at ≤2 miles to keep requests local.',
          action: safeguards
        });
      } else {
        out.push({
          status: 'ok',
          label: `Location check: GPS (${prefs.allowedRadius} mile geofence radius)`
        });
      }
    } else if (prefs.locationCheckMethod === LocationCheckMethod.CODE) {
      if (!prefs.locationCode || prefs.locationCode <= 0) {
        out.push({
          status: 'blocker',
          label: 'Location check: Code (no code set)',
          detail: 'Set a location code in Settings → Interaction Safeguards.',
          action: safeguards
        });
      } else {
        out.push({
          status: 'ok',
          label: `Location check: Code (${prefs.locationCode})`
        });
      }
    } else if (prefs.locationCheckMethod === LocationCheckMethod.NONE) {
      out.push({
        status: 'ok',
        label: 'Location check: off'
      });
    }

    if (!prefs.viewerControlEnabled) {
      out.push({
        status: 'warn',
        label: 'Viewer control is currently disabled',
        detail: 'Viewers can see the show page but cannot request or vote.',
        action: {
          label: 'Enable',
          onClick: () =>
            togglePreference(
              'viewerControlEnabled',
              true,
              'Viewer Control Enabled',
              'viewer_control_toggled'
            )
        }
      });
    } else {
      // Match the capitalization the user sees elsewhere (Settings page mode
      // toggle, dashboard eyebrow "Jukebox Mode / Voting Mode"). The enum
      // values are UPPERCASE, so titlecase the first letter only.
      const modeRaw = prefs.viewerControlMode || 'JUKEBOX';
      const modeLabel = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1).toLowerCase();
      out.push({
        status: 'ok',
        label: `Viewer control enabled (${modeLabel} Mode)`
      });
    }

    if (prefs.viewerPageViewOnly) {
      out.push({
        status: 'warn',
        label: 'Viewer page is in view-only mode',
        detail: 'Viewers cannot interact — they can only watch the page.',
        action: {
          label: 'Turn off',
          onClick: () =>
            togglePreference(
              'viewerPageViewOnly',
              false,
              'View Only Disabled',
              'view_only_toggled'
            )
        }
      });
    } else {
      out.push({
        status: 'ok',
        label: 'Viewer page accepts interaction'
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
  }, [show, lastHeartbeatMs, togglePreference, goTo]);
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
      data-testid="dashboard-checklist"
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
        {/* Decorative chevron — the parent Stack is the interactive control
            (role=button), so this stays a non-interactive Box (WCAG 4.1.2,
            avoid nested-interactive). */}
        <Box aria-hidden sx={{ color: 'text.secondary', display: 'inline-flex', p: 0.5 }}>
          {open ? <IconChevronUp size={18} stroke={1.75} /> : <IconChevronDown size={18} stroke={1.75} />}
        </Box>
      </Stack>
      <Collapse in={open}>
        <Stack spacing={1.5} sx={{ p: 2, pt: 0 }}>
          {checks.map((c, i) => (
            <StatusRow key={i} status={c.status} label={c.label} detail={c.detail} action={c.action} />
          ))}
        </Stack>
      </Collapse>
    </MainCard>
  );
};

export default PreShowChecklist;
