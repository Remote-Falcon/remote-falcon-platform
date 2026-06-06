import { useEffect, useMemo, useRef } from 'react';
import * as React from 'react';

import { useLazyQuery, useMutation } from '@apollo/client';
import { Box, Button, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { IconPlayerPlay, IconSpeakerphone, IconX } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { setNextPsaOverrideService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import MainCard from '../../../../ui-component/cards/MainCard';
import { visibleEnabledPsas } from './psaQuickPlay.helpers';
import { SET_NEXT_PSA_OVERRIDE } from '../../../../utils/graphql/controlPanel/mutations';
import { GET_SHOW } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

// Matches plugins-api's heartbeat-fresh window / HealthRow's "Connected" pill.
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;

// Dashboard "PSAs" quick-play card. Lets the operator fire a PSA at the next
// sequence boundary straight from the dashboard — the same Q7 "Play Next"
// override Special Roles exposes (setNextPsaOverride), so no new backend.
// Works in both jukebox and voting modes (handlePsaOverride injects for both).
//
// Mobile is the primary surface: the operator taps this from their phone
// mid-show, so rows are big touch targets on small screens and tighten up on
// desktop. The dashboard promotes this card to the top of the stack on mobile.
const PsaQuickPlayCard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { show } = useSelector((state) => state.show);
  const { data: liveStats } = useDashboardLiveStats();

  const [setNextPsaOverrideMutation] = useMutation(SET_NEXT_PSA_OVERRIDE);
  const [refetchShowQuery] = useLazyQuery(GET_SHOW, { fetchPolicy: 'network-only' });

  const pendingOverride = show?.nextPsaOverride || '';

  // FPP heartbeat freshness — same logic as HealthRow's Connected/Offline pill.
  const isConnected =
    !!liveStats?.lastHeartbeatMs && Date.now() - liveStats.lastHeartbeatMs < HEARTBEAT_FRESH_MS;
  const hasEverConnected = !!liveStats?.lastHeartbeatMs;

  // Only enabled PSAs are playable, sorted by order — see visibleEnabledPsas.
  const psas = useMemo(() => visibleEnabledPsas(show?.psaSequences), [show?.psaSequences]);

  // Poll for the override clearing while one is pending. FPP consumes it at the
  // next sequence boundary and PluginService persists nextPsaOverride=null;
  // we just surface that. Merge (don't replace) so GET_SHOW's omitted fields
  // (e.g. timezone) don't blank out other dashboard surfaces. Mirrors
  // SpecialRoles' poll. The ref guards onCompleted from closing over a stale show.
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  }, [show]);
  useEffect(() => {
    if (!pendingOverride) return undefined;
    const id = setInterval(() => {
      refetchShowQuery({
        onCompleted: (data) => {
          if (data?.getShow) {
            dispatch(setShow({ ...showRef.current, ...data.getShow }));
          }
        }
      });
    }, 10000);
    return () => clearInterval(id);
  }, [pendingOverride, refetchShowQuery, dispatch]);

  const playNext = (name) => {
    const prev = show?.nextPsaOverride || null;
    dispatch(setShow({ ...show, nextPsaOverride: name }));
    setNextPsaOverrideService(name, setNextPsaOverrideMutation, (response) => {
      if (!response?.success) {
        dispatch(setShow({ ...show, nextPsaOverride: prev }));
      }
      showAlert(dispatch, response?.toast);
    });
  };

  const clearOverride = () => {
    const prev = show?.nextPsaOverride || null;
    dispatch(setShow({ ...show, nextPsaOverride: null }));
    setNextPsaOverrideService(null, setNextPsaOverrideMutation, (response) => {
      if (!response?.success) {
        dispatch(setShow({ ...show, nextPsaOverride: prev }));
      }
      showAlert(dispatch, response?.toast);
    });
  };

  // The pending PSA might not be in the visible (enabled) list — e.g. it was
  // disabled after being queued. Surface a standalone banner in that case so
  // the operator can still see/cancel it.
  const pendingInList = !!pendingOverride && psas.some((p) => p.name?.toLowerCase() === pendingOverride.toLowerCase());

  const header = (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: psas.length || pendingOverride ? 1.25 : 0 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ color: 'warning.main', display: 'inline-flex' }}>
          <IconSpeakerphone size={16} stroke={1.75} />
        </Box>
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em', lineHeight: 1.2 }}>
          PSAs
        </Typography>
      </Stack>
      <MuiLink
        component="button"
        onClick={() => navigate('/control-panel/sequences/special-roles')}
        sx={{
          fontSize: 11,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          '&:hover': { color: 'primary.main' }
        }}
      >
        Manage
      </MuiLink>
    </Stack>
  );

  const offlineNote =
    psas.length > 0 && hasEverConnected && !isConnected ? (
      <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', mb: 1 }}>
        Plugin offline — a PSA you pick will fire once it reconnects.
      </Typography>
    ) : null;

  const pendingBanner = (name) => (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        py: { xs: 1.25, lg: 0.75 },
        px: 1,
        borderRadius: 1,
        border: (t) => `1px dashed ${t.palette.warning.main}`,
        bgcolor: (t) => alpha(t.palette.warning.main, t.palette.mode === 'dark' ? 0.1 : 0.07),
        '&:hover .psa-cancel': { opacity: 1 }
      }}
      data-testid={`psa-pending-${name}`}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
          flexShrink: 0
        }}
      >
        <IconPlayerPlay size={14} stroke={2.25} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {name}
        </Typography>
        <Typography variant="caption" sx={{ color: 'warning.main' }}>
          Queued — plays next
        </Typography>
      </Box>
      <Tooltip title="Cancel">
        <IconButton
          className="psa-cancel"
          onClick={clearOverride}
          aria-label={`Cancel ${name}`}
          sx={{
            color: 'text.secondary',
            opacity: { xs: 1, lg: 0 },
            transition: 'opacity 120ms ease',
            minWidth: { xs: 44, lg: 32 },
            minHeight: { xs: 44, lg: 32 },
            '&:hover': { color: 'error.main' }
          }}
        >
          <IconX size={16} stroke={1.75} />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  return (
    <MainCard sx={{ height: '100%' }} contentSX={{ p: 2.25, '&:last-child': { pb: 2.25 } }} data-testid="dashboard-psa-quick-play">
      {header}

      {psas.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No PSAs configured.{' '}
          <MuiLink component="button" onClick={() => navigate('/control-panel/sequences/special-roles')} sx={{ verticalAlign: 'baseline' }}>
            Add some in Special Roles
          </MuiLink>
          .
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {offlineNote}
          {/* Pending PSA isn't in the enabled list (got disabled after queueing) — show a standalone banner. */}
          {pendingOverride && !pendingInList && pendingBanner(pendingOverride)}
          {psas.map((psa) => {
            const isPending = pendingOverride && psa.name?.toLowerCase() === pendingOverride.toLowerCase();
            if (isPending) {
              return <React.Fragment key={psa.name}>{pendingBanner(psa.name)}</React.Fragment>;
            }
            return (
              <Stack
                key={psa.name}
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  py: { xs: 0.75, lg: 0.5 },
                  px: 1,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, minWidth: 0 }} noWrap>
                  {psa.name}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<IconPlayerPlay size={16} stroke={1.75} />}
                  onClick={() => playNext(psa.name)}
                  data-testid={`psa-play-${psa.name}`}
                  sx={{
                    flexShrink: 0,
                    minHeight: { xs: 44, lg: 30 },
                    px: { xs: 1.75, lg: 1.25 },
                    fontSize: { xs: 13, lg: 11 }
                  }}
                >
                  Play next
                </Button>
              </Stack>
            );
          })}
        </Stack>
      )}
    </MainCard>
  );
};

export default PsaQuickPlayCard;
