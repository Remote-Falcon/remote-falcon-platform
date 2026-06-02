import { useMemo } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import { Box, Chip, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { IconMusic, IconPlayerPlay, IconX } from '@tabler/icons-react';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { setNextPsaOverrideService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { ViewerControlMode } from '../../../../utils/enum';
import { DELETE_ALL_REQUESTS, DELETE_SINGLE_REQUEST, SET_NEXT_PSA_OVERRIDE } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

// Mockup `.now-playing` + full queue list. Renders the currently playing
// sequence as a hero row, then the full queue (jukebox) or top votes
// (voting) below. Per-row delete + Clear all inline — replaces what the
// View Queue modal used to do, so the SplitButton no longer needs that
// option. The "Now playing" section label + clear-all-icon live in
// dashboard/index.jsx so they align horizontally with the "Right now"
// section header on the left column.
const NowPlayingCard = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const { data: liveStats } = useDashboardLiveStats();
  const stats = {
    playingNow: liveStats?.playingNow || '--',
    playingNext: liveStats?.playingNext || '--'
  };
  const [deleteSingleRequestMutation] = useMutation(DELETE_SINGLE_REQUEST);
  const [deleteAllRequestsMutation] = useMutation(DELETE_ALL_REQUESTS);
  const [setNextPsaOverrideMutation] = useMutation(SET_NEXT_PSA_OVERRIDE);

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;

  // PSA-v2: surface what *kind* of thing is playing right now AND what's
  // queued. Operator looks at this widget for situational awareness; without
  // a type tag, a PSA name and a song name look identical and you can't tell
  // why the queue feels stuck. Memoize the name sets once and reuse them for
  // the "Now Playing" title and every queue row.
  const psaNameSet = useMemo(() => {
    return new Set(
      (show?.psaSequences || [])
        .map((p) => p?.name?.toLowerCase())
        .filter(Boolean)
    );
  }, [show?.psaSequences]);
  const leaderNameSet = useMemo(() => {
    const set = new Set();
    if (show?.requestLeaderSequence) set.add(show.requestLeaderSequence.toLowerCase());
    if (show?.voteLeaderSequence) set.add(show.voteLeaderSequence.toLowerCase());
    return set;
  }, [show?.requestLeaderSequence, show?.voteLeaderSequence]);

  const classifyName = (name) => {
    if (!name || name === '--') return null;
    const lower = name.toLowerCase();
    if (psaNameSet.has(lower)) return 'psa';
    if (leaderNameSet.has(lower)) return 'leader';
    return null;
  };

  const playingKind = classifyName(stats.playingNow);
  const isPlayingPsa = playingKind === 'psa';
  const isPlayingLeader = playingKind === 'leader';
  const playingNextKind = classifyName(stats.playingNext);

  // Q7 override that's been set but hasn't fired yet (FPP only consumes
  // it on the next updateWhatsPlaying call — between sequences). Surface
  // it as a visually distinct pseudo-row above the real queue so the
  // operator can see their click took effect. Hides itself the moment
  // the override fires (nextPsaOverride clears, PSA lands in requests
  // as a real queue row with its PSA chip).
  const pendingOverride = show?.nextPsaOverride || '';
  const pendingOverrideAlreadyQueued = !!pendingOverride && (show?.requests || []).some(
    (r) => r?.sequence?.name && r.sequence.name.toLowerCase() === pendingOverride.toLowerCase()
  );
  const showPendingOverride = !!pendingOverride && !pendingOverrideAlreadyQueued && isJukebox;

  const deleteSingleRequest = (sequenceName, position) => {
    deleteSingleRequestMutation({
      context: { headers: { Route: 'Control-Panel' } },
      variables: { sequence: sequenceName, position },
      onCompleted: () => {
        const remaining = (show?.requests || []).filter(
          (r) => !(r?.sequence?.name === sequenceName && r?.position === position)
        );
        dispatch(setShow({ ...show, requests: remaining }));
        showAlert(dispatch, { message: `${sequenceName} request deleted` });
      },
      onError: () => showAlert(dispatch, { alert: 'error' })
    });
  };

  const deleteAllRequests = () => {
    deleteAllRequestsMutation({
      context: { headers: { Route: 'Control-Panel' } },
      onCompleted: () => {
        dispatch(setShow({ ...show, requests: [] }));
        showAlert(dispatch, { message: 'Queue cleared' });
      },
      onError: () => showAlert(dispatch, { alert: 'error' })
    });
  };

  // Clear the pending Q7 override from the dashboard so the operator
  // doesn't have to bounce to Sequences → Special Roles just to undo
  // their click. Mirrors SpecialRoles.handleClearOverride: optimistic
  // Redux update, mutation rolls back on failure.
  const clearPendingOverride = () => {
    dispatch(setShow({ ...show, nextPsaOverride: null }));
    setNextPsaOverrideService(null, setNextPsaOverrideMutation, (response) => {
      if (!response?.success) {
        dispatch(setShow({ ...show, nextPsaOverride: show?.nextPsaOverride || null }));
      }
      showAlert(dispatch, response?.toast);
    });
  };

  // Full queue (jukebox) or top 10 votes (voting). Inline-scrolls past
  // ~6 rows so the card height stays bounded; the dashboard layout
  // doesn't try to grow with every viewer-added request.
  const upNext = isJukebox
    ? _.orderBy(show?.requests || [], ['position'], ['asc']).map((r) => ({
        name: r?.sequence?.name,
        position: r?.position,
        value: '',
        sub: r?.ownerRequested ? 'Owner' : null,
        canDelete: true
      }))
    : _.orderBy(show?.votes || [], ['votes'], ['desc'])
        .slice(0, 10)
        .map((v) => ({
          name: v?.sequence?.name,
          value: `${v?.votes || 0} ${(v?.votes || 0) === 1 ? 'vote' : 'votes'}`,
          sub: null,
          canDelete: false
        }));

  return (
    <MainCard
      sx={{ height: '100%' }}
      contentSX={{ p: 0, '&:last-child': { pb: 0 } }}
      data-testid="dashboard-now-playing"
    >
      <Stack direction="row" spacing={2} alignItems="center" sx={{ px: 2.25, py: 2.25 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            bgcolor: (t) => alpha(t.palette.warning.main, t.palette.mode === 'dark' ? 0.18 : 0.16),
            color: 'warning.main',
            flexShrink: 0
          }}
        >
          <IconMusic size={28} stroke={1.5} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
              {stats.playingNow}
            </Typography>
            {isPlayingPsa && (
              <Chip
                label="PSA"
                size="small"
                color="warning"
                sx={{ height: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}
                data-testid="now-playing-psa-chip"
              />
            )}
            {isPlayingLeader && (
              <Chip
                label="Leader"
                size="small"
                color="info"
                sx={{ height: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}
                data-testid="now-playing-leader-chip"
              />
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 0 }} noWrap>
              Up next: {stats.playingNext}
            </Typography>
            {playingNextKind === 'psa' && (
              <Chip
                label="PSA"
                size="small"
                color="warning"
                sx={{ height: 16, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}
                data-testid="now-playing-next-psa-chip"
              />
            )}
            {playingNextKind === 'leader' && (
              <Chip
                label="Leader"
                size="small"
                color="info"
                sx={{ height: 16, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}
                data-testid="now-playing-next-leader-chip"
              />
            )}
          </Stack>
        </Box>
      </Stack>

      <Box sx={{ px: 2.25, pb: 2.25 }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography
            variant="overline"
            sx={{
              color: 'text.disabled',
              letterSpacing: '0.08em'
            }}
          >
            {isJukebox ? `Queue${upNext.length > 0 ? ` (${upNext.length})` : ''}` : 'Top votes'}
          </Typography>
          {isJukebox && upNext.length > 0 && (
            <MuiLink
              component="button"
              onClick={deleteAllRequests}
              sx={{
                fontSize: 11,
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                '&:hover': { color: 'error.main' }
              }}
            >
              Clear all
            </MuiLink>
          )}
        </Stack>
        {upNext.length === 0 && !showPendingOverride ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
            {isJukebox ? 'No requests in the queue.' : 'No votes yet tonight.'}
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
            <Stack spacing={0.5}>
              {showPendingOverride && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    border: (t) => `1px dashed ${t.palette.warning.main}`,
                    bgcolor: (t) => alpha(t.palette.warning.main, t.palette.mode === 'dark' ? 0.08 : 0.06),
                    '&:hover .pending-clear': { opacity: 1 }
                  }}
                  data-testid="now-playing-pending-override"
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'warning.main',
                      color: 'warning.contrastText',
                      flexShrink: 0
                    }}
                  >
                    <IconPlayerPlay size={12} stroke={2.5} />
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }} noWrap>
                    {pendingOverride}
                  </Typography>
                  <Chip
                    label="PSA"
                    size="small"
                    color="warning"
                    sx={{ height: 18, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}
                  />
                  <Chip
                    label="Pending"
                    size="small"
                    variant="outlined"
                    color="warning"
                    sx={{ height: 18, fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', flexShrink: 0 }}
                  />
                  <Tooltip title="Cancel pending override">
                    <IconButton
                      size="small"
                      className="pending-clear"
                      onClick={clearPendingOverride}
                      sx={{
                        opacity: 0,
                        color: 'text.secondary',
                        transition: 'opacity 120ms ease',
                        '&:hover': { color: 'error.main' }
                      }}
                      aria-label="Cancel pending PSA override"
                      data-testid="now-playing-pending-override-clear"
                    >
                      <IconX size={14} stroke={1.75} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}
              {upNext.map((item, i) => {
                const rowKind = classifyName(item.name);
                return (
                <Stack
                  key={`${item.name}-${item.position ?? i}`}
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: 'action.hover',
                      '& .row-delete': { opacity: 1 }
                    }
                  }}
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'action.selected',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'text.secondary',
                      flexShrink: 0
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }} noWrap>
                    {item.name || '—'}
                  </Typography>
                  {rowKind === 'psa' && (
                    <Chip
                      label="PSA"
                      size="small"
                      color="warning"
                      sx={{ height: 18, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}
                      data-testid={`queue-row-psa-chip-${item.position ?? i}`}
                    />
                  )}
                  {rowKind === 'leader' && (
                    <Chip
                      label="Leader"
                      size="small"
                      color="info"
                      sx={{ height: 18, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}
                      data-testid={`queue-row-leader-chip-${item.position ?? i}`}
                    />
                  )}
                  {item.value && (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {item.value}
                    </Typography>
                  )}
                  {item.sub && (
                    <Typography variant="caption" sx={{ color: 'warning.main' }}>
                      {item.sub}
                    </Typography>
                  )}
                  {item.canDelete && (
                    <Tooltip title="Remove from queue">
                      <IconButton
                        size="small"
                        className="row-delete"
                        onClick={() => deleteSingleRequest(item.name, item.position)}
                        sx={{
                          opacity: 0,
                          color: 'text.secondary',
                          transition: 'opacity 120ms ease',
                          '&:hover': { color: 'error.main' }
                        }}
                      >
                        <IconX size={14} stroke={1.75} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
                );
              })}
            </Stack>
          </Box>
        )}
      </Box>
    </MainCard>
  );
};

export default NowPlayingCard;
