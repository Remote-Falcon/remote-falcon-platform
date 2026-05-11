import * as React from 'react';

import { useMutation } from '@apollo/client';
import { Box, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { IconMusic, IconX } from '@tabler/icons-react';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { ViewerControlMode } from '../../../../utils/enum';
import { DELETE_ALL_REQUESTS, DELETE_SINGLE_REQUEST } from '../../../../utils/graphql/controlPanel/mutations';
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

  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;

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
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
            {stats.playingNow}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
            Up next: {stats.playingNext}
          </Typography>
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
        {upNext.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
            {isJukebox ? 'No requests in the queue.' : 'No votes yet tonight.'}
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
            <Stack spacing={0.5}>
              {upNext.map((item, i) => (
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
              ))}
            </Stack>
          </Box>
        )}
      </Box>
    </MainCard>
  );
};

export default NowPlayingCard;
