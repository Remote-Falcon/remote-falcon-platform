import { useMemo } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { IconMusic, IconX } from '@tabler/icons-react';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { ViewerControlMode } from '../../../../utils/enum';
import { DELETE_ALL_REQUESTS, DELETE_SINGLE_REQUEST, RESET_ALL_VOTES } from '../../../../utils/graphql/controlPanel/mutations';
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
  const { data: liveStats, refetch: refetchLiveStats } = useDashboardLiveStats();
  const stats = {
    playingNow: liveStats?.playingNow || '--',
    playingNext: liveStats?.playingNext || '--'
  };
  const [deleteSingleRequestMutation] = useMutation(DELETE_SINGLE_REQUEST);
  const [deleteAllRequestsMutation] = useMutation(DELETE_ALL_REQUESTS);
  const [resetAllVotesMutation] = useMutation(RESET_ALL_VOTES);

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

  // Voting-mode equivalent of jukebox's "Clear all" — wipes the votes array
  // (and resets sequence visibility counts) via resetAllVotes. Relocated from
  // the dashboard PageHead into the card header so the control sits next to
  // the votes it clears, matching the jukebox queue's inline clear affordance.
  const resetAllVotes = () => {
    trackPosthogEvent('dashboard_quick_action', { action: 'reset_votes' });
    resetAllVotesMutation({
      context: { headers: { Route: 'Control-Panel' } },
      onCompleted: () => {
        dispatch(setShow({ ...show, votes: [] }));
        showAlert(dispatch, { message: 'All Votes Reset' });
        refetchLiveStats();
      },
      onError: () => showAlert(dispatch, { alert: 'error' })
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
    : // Exclude system-injected votes (PSA/leader/override priority sentinels,
      // votes >= 2000) — they aren't viewer actions and shouldn't appear in the
      // "Top votes" list. Mirrors the backend Active Votes filter.
      _.orderBy(
        (show?.votes || []).filter((v) => !v?.systemInjected && (v?.votes || 0) < 2000),
        ['votes'],
        ['desc']
      )
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
          {/* Clear all (jukebox) / Reset votes (voting): same red button, shown
              only when there's something displayed to clear. Gating on `upNext`
              (the mode-aware displayed list) keeps it consistent across modes —
              voting's raw show.votes can still hold system/PSA entries with no
              viewer votes, which previously left the button visible. */}
          {upNext.length > 0 &&
            (isJukebox ? (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={deleteAllRequests}
                sx={{ py: 0.25, px: 1.25, minWidth: 0, fontSize: 11, lineHeight: 1.6 }}
                data-testid="now-playing-clear-all"
              >
                Clear all
              </Button>
            ) : (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={resetAllVotes}
                sx={{ py: 0.25, px: 1.25, minWidth: 0, fontSize: 11, lineHeight: 1.6 }}
                data-testid="now-playing-reset-votes"
              >
                Reset votes
              </Button>
            ))}
        </Stack>
        {upNext.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
            {isJukebox ? 'No requests in the queue.' : 'No votes yet tonight.'}
          </Typography>
        ) : (
          // Start shallow, grow with the number of songs/votes: the list is its
          // natural height (no min) up to a max (~14 rows) then scrolls. A quiet
          // show stays compact so Pre-show readiness sits higher / above the
          // fold; the card grows as votes/requests come in. The PSA card
          // stretches to match this column's height.
          <Box sx={{ maxHeight: { xs: 420, lg: 600 }, overflowY: 'auto', pr: 0.5 }}>
            <Stack spacing={0.5}>
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
