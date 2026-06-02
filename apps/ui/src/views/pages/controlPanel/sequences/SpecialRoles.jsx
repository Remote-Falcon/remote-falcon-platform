import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';

import { useLazyQuery, useMutation } from '@apollo/client';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { IconChevronRight, IconGripVertical, IconPlayerPlay, IconPlus, IconTrash } from '@tabler/icons-react';
import _ from 'lodash';
import moment from 'moment/moment';

import {
  savePsaSequencesService,
  setNextPsaOverrideService,
  setRequestLeaderSequenceService,
  setVoteLeaderSequenceService,
  updatePsaEnabledService
} from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import {
  SET_NEXT_PSA_OVERRIDE,
  SET_REQUEST_LEADER_SEQUENCE,
  SET_VOTE_LEADER_SEQUENCE,
  UPDATE_PSA_ENABLED,
  UPDATE_PSA_SEQUENCES
} from '../../../../utils/graphql/controlPanel/mutations';
import { GET_SHOW } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

// PSA-v2 PR-5 — "Special Roles" tab on the Sequences page. Houses PSAs
// + Leaders, relocated out of Show Settings per the PSA-v2 PRD's UI
// relocation decision. Frequency/burst behavior stays in Show Settings.
//
// Mobile is a primary surface here — Q7's "Play Next" button is
// expected to be tapped from the operator's phone while standing
// outside in show mode. Table columns collapse via responsive breakpoints
// and the Play-Next button is a full IconButton with adequate hit area.
//
// TODO (ship-day, not in code): post a global admin notification via
// the existing bell (PRD-002, shipped) — "PSA management has moved to
// the Sequences page → Special Roles tab." See the redirect helper on
// Show Settings → Safeguards for the user-visible breadcrumb.
const formatLastPlayed = (raw) => {
  if (!raw) return 'Never';
  const m = moment(raw);
  if (!m.isValid()) return 'Never';
  return m.fromNow();
};

const SpecialRoles = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updatePsaSequencesMutation] = useMutation(UPDATE_PSA_SEQUENCES);
  const [updatePsaEnabledMutation] = useMutation(UPDATE_PSA_ENABLED);
  const [setNextPsaOverrideMutation] = useMutation(SET_NEXT_PSA_OVERRIDE);
  const [setRequestLeaderSequenceMutation] = useMutation(SET_REQUEST_LEADER_SEQUENCE);
  const [setVoteLeaderSequenceMutation] = useMutation(SET_VOTE_LEADER_SEQUENCE);

  // Refetch the show so the Q7 "Next override" pill clears soon after FPP
  // consumes the override server-side. The plugin path's atomic update in
  // PluginService.updateWhatsPlaying persists nextPsaOverride = null when
  // handlePsaOverride fires; we just need to surface that on the client.
  // onCompleted is passed at call time (not as a hook option) to match the
  // pattern used elsewhere — Apollo warns about onCompleted in useLazyQuery
  // when it's set at hook construction.
  const [refetchShowQuery] = useLazyQuery(GET_SHOW, { fetchPolicy: 'network-only' });

  const [busy, setBusy] = useState(false);
  const [addPsaName, setAddPsaName] = useState(null);

  const psaSequences = useMemo(() => show?.psaSequences || [], [show]);
  const sequences = useMemo(() => show?.sequences || [], [show]);
  const requestLeader = show?.requestLeaderSequence || '';
  const voteLeader = show?.voteLeaderSequence || '';
  const nextOverride = show?.nextPsaOverride || '';

  // Poll for the override clearing while one is pending. FPP consumes the
  // override at its next sequence boundary; without polling, the operator
  // would see a stale pill until they manually refreshed. 10s is fast
  // enough to feel responsive and slow enough to be cheap.
  //
  // Merge, don't replace — GET_SHOW omits some fields (notably timezone)
  // that other surfaces depend on. Replacing the Redux show parks the
  // dashboard's useDashboardLiveStats in a permanent loading state when
  // the user navigates back. The ref guards against onCompleted closing
  // over a stale `show`.
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  }, [show]);
  useEffect(() => {
    if (!nextOverride) return undefined;
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
  }, [nextOverride, refetchShowQuery, dispatch]);

  // FPP sequence list — both PSAs and leaders pick from this.
  const sequenceOptions = useMemo(
    () => sequences.map((s) => ({ label: s.name, id: s.name })),
    [sequences]
  );

  // Add-a-PSA: only show sequences that aren't already in the PSA list,
  // so the dropdown doesn't tempt the operator into a no-op pick.
  const addPsaOptions = useMemo(() => {
    const existing = new Set(psaSequences.map((p) => p.name));
    return sequenceOptions.filter((o) => !existing.has(o.id));
  }, [sequenceOptions, psaSequences]);

  // Persist the full PSA list using the existing UPDATE_PSA_SEQUENCES
  // wholesale-update mutation. Mirrors InteractionSettings'
  // handlePsaSequencesChange shape — keeps backend behavior identical
  // for add/remove ops while the per-row toggles use the focused
  // updatePsaEnabled mutation below.
  const persistPsaSequences = useCallback(
    (next) => {
      setBusy(true);
      savePsaSequencesService(next, updatePsaSequencesMutation, (response) => {
        if (response?.success) {
          dispatch(setShow({ ...show, psaSequences: [...next] }));
        }
        showAlert(dispatch, response?.toast);
        setBusy(false);
      });
    },
    [dispatch, show, updatePsaSequencesMutation]
  );

  const handleAddPsa = () => {
    if (!addPsaName) return;
    const next = [
      ...psaSequences.map((p) => ({ ...p })),
      {
        name: addPsaName.id,
        order: psaSequences.length,
        lastPlayed: moment().format('YYYY-MM-DDTHH:mm:ss'),
        enabled: true
      }
    ];
    persistPsaSequences(next);
    setAddPsaName(null);
  };

  const handleRemovePsa = (name) => {
    const next = psaSequences
      .filter((p) => p.name !== name)
      .map((p, idx) => ({ ...p, order: idx }));
    persistPsaSequences(next);
  };

  // Drag-to-reorder PSA list. Mirrors SequencesList.reorderSequences:
  // optimistic Redux dispatch first so @hello-pangea/dnd's drop animation
  // sees the new order before the save round-trip finishes (otherwise the
  // dragged row snaps back to its origin then re-renders — visible flicker).
  // On save failure the toast surfaces and a refresh resyncs from server.
  const reorderPsas = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    const updated = _.cloneDeep(psaSequences);
    const [moved] = updated.splice(result.source.index, 1);
    updated.splice(result.destination.index, 0, moved);
    updated.forEach((p, i) => {
      p.order = i;
    });
    dispatch(setShow({ ...show, psaSequences: [...updated] }));
    setBusy(true);
    savePsaSequencesService(updated, updatePsaSequencesMutation, (response) => {
      if (!response?.success) {
        showAlert(dispatch, response?.toast);
      } else {
        showAlert(dispatch, { message: 'PSA Order Updated' });
      }
      setBusy(false);
    });
  };

  const handleToggleEnabled = (psa) => {
    const nextEnabled = !(psa.enabled !== false); // null/undefined treated as true
    // Optimistic redux update — bookkeeping for the rest of the UI.
    const optimistic = psaSequences.map((p) =>
      p.name === psa.name ? { ...p, enabled: nextEnabled } : p
    );
    dispatch(setShow({ ...show, psaSequences: optimistic }));
    setBusy(true);
    updatePsaEnabledService(psa.name, nextEnabled, updatePsaEnabledMutation, (response) => {
      if (!response?.success) {
        // Roll back on failure.
        dispatch(setShow({ ...show, psaSequences }));
      }
      showAlert(dispatch, response?.toast);
      setBusy(false);
    });
  };

  const handlePlayNext = (name) => {
    setBusy(true);
    // Optimistic indicator update.
    dispatch(setShow({ ...show, nextPsaOverride: name }));
    setNextPsaOverrideService(name, setNextPsaOverrideMutation, (response) => {
      if (!response?.success) {
        dispatch(setShow({ ...show, nextPsaOverride: show?.nextPsaOverride || null }));
      }
      showAlert(dispatch, response?.toast);
      setBusy(false);
    });
  };

  const handleClearOverride = () => {
    setBusy(true);
    dispatch(setShow({ ...show, nextPsaOverride: null }));
    setNextPsaOverrideService(null, setNextPsaOverrideMutation, (response) => {
      if (!response?.success) {
        dispatch(setShow({ ...show, nextPsaOverride: show?.nextPsaOverride || null }));
      }
      showAlert(dispatch, response?.toast);
      setBusy(false);
    });
  };

  const handleRequestLeaderChange = (_event, value) => {
    const name = value?.id || null;
    setBusy(true);
    dispatch(setShow({ ...show, requestLeaderSequence: name }));
    setRequestLeaderSequenceService(name, setRequestLeaderSequenceMutation, (response) => {
      if (!response?.success) {
        dispatch(setShow({ ...show, requestLeaderSequence: show?.requestLeaderSequence || null }));
      }
      showAlert(dispatch, response?.toast);
      setBusy(false);
    });
  };

  const handleVoteLeaderChange = (_event, value) => {
    const name = value?.id || null;
    setBusy(true);
    dispatch(setShow({ ...show, voteLeaderSequence: name }));
    setVoteLeaderSequenceService(name, setVoteLeaderSequenceMutation, (response) => {
      if (!response?.success) {
        dispatch(setShow({ ...show, voteLeaderSequence: show?.voteLeaderSequence || null }));
      }
      showAlert(dispatch, response?.toast);
      setBusy(false);
    });
  };

  const requestLeaderValue = requestLeader
    ? { label: requestLeader, id: requestLeader }
    : null;
  const voteLeaderValue = voteLeader ? { label: voteLeader, id: voteLeader } : null;

  return (
    <Box data-testid="special-roles-tab">
      {busy && <LinearProgress sx={{ mb: 2 }} />}
      {/* ---------------- PSAs section ---------------- */}
      <MainCard
        title={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h4">PSAs</Typography>
              {nextOverride && (
                <Chip
                  data-testid="next-override-chip"
                  color="warning"
                  size="small"
                  icon={<IconPlayerPlay size={14} />}
                  label={`Next override: ${nextOverride}`}
                  onDelete={handleClearOverride}
                />
              )}
            </Stack>
          </Stack>
        }
        contentSX={{ p: 0 }}
      >
        <Box sx={{ px: 3, pt: 2, pb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            PSAs are short interstitial sequences that play between viewer requests. Use{' '}
            <strong>Play Next</strong> to push a specific PSA at the next sequence boundary
            — handy for time-sensitive announcements from your phone.
          </Typography>
        </Box>

        {/* Add a PSA */}
        <Box sx={{ px: 3, pb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Autocomplete
              size="small"
              sx={{ minWidth: 240, flex: 1 }}
              options={addPsaOptions}
              value={addPsaName}
              getOptionLabel={(opt) => opt?.label || ''}
              isOptionEqualToValue={(o, v) => o.id === v?.id}
              onChange={(_e, v) => setAddPsaName(v)}
              renderInput={(params) => (
                <TextField {...params} label="Add a PSA from your sequences" />
              )}
            />
            <Button
              variant="contained"
              startIcon={<IconPlus size={16} />}
              disabled={!addPsaName || busy}
              onClick={handleAddPsa}
            >
              Add PSA
            </Button>
          </Stack>
        </Box>

        <Divider />

        {/* PSA list */}
        {psaSequences.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <EmptyState
              title="No PSAs yet"
              description="Pick a sequence above to add it as a PSA."
            />
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" data-testid="psa-table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 28, p: 0 }} />
                  <TableCell>Name</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Last Played</TableCell>
                  <TableCell align="center">Enabled</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <DragDropContext onDragEnd={reorderPsas}>
                <Droppable droppableId="psa-sequences" isDropDisabled={busy}>
                  {(provided) => (
                    <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                      {psaSequences.map((psa, index) => {
                        const enabled = psa.enabled !== false; // null/undefined → enabled
                        return (
                          <Draggable
                            key={psa.name}
                            draggableId={psa.name}
                            index={index}
                            isDragDisabled={busy}
                          >
                            {(dragProvided) => (
                              <TableRow
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                hover
                              >
                                <TableCell sx={{ width: 28, p: 0, color: 'text.disabled' }}>
                                  <Tooltip title={busy ? 'Saving…' : 'Drag to reorder'}>
                                    <Box
                                      {...(!busy ? dragProvided.dragHandleProps : {})}
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        cursor: busy ? 'default' : 'grab',
                                        opacity: busy ? 0.3 : 1
                                      }}
                                    >
                                      <IconGripVertical size={14} />
                                    </Box>
                                  </Tooltip>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={500}>
                                    {psa.name}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: { xs: 'block', md: 'none' } }}
                                  >
                                    {formatLastPlayed(psa.lastPlayed)}
                                  </Typography>
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                                  {formatLastPlayed(psa.lastPlayed)}
                                </TableCell>
                                <TableCell align="center">
                                  <Switch
                                    checked={enabled}
                                    onChange={() => handleToggleEnabled(psa)}
                                    disabled={busy}
                                    inputProps={{
                                      'aria-label': `Enable ${psa.name}`,
                                      'data-testid': `psa-enabled-${psa.name}`
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right">
                                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                    <Tooltip title="Play this PSA next">
                                      <span>
                                        <IconButton
                                          color="primary"
                                          size="medium"
                                          disabled={busy}
                                          onClick={() => handlePlayNext(psa.name)}
                                          // 44px minimum hit area for phone use (Q7 mobile use case).
                                          sx={{ minWidth: 44, minHeight: 44 }}
                                          aria-label={`Play ${psa.name} next`}
                                          data-testid={`psa-play-next-${psa.name}`}
                                        >
                                          <IconPlayerPlay size={18} />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title="Remove from PSAs">
                                      <span>
                                        <IconButton
                                          color="error"
                                          size="medium"
                                          disabled={busy}
                                          onClick={() => handleRemovePsa(psa.name)}
                                          sx={{ minWidth: 44, minHeight: 44 }}
                                          aria-label={`Remove ${psa.name}`}
                                        >
                                          <IconTrash size={18} />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </TableBody>
                  )}
                </Droppable>
              </DragDropContext>
            </Table>
          </TableContainer>
        )}

        <Divider />
        <Box sx={{ px: 3, py: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Frequency and burst settings live on{' '}
            <Box
              component="a"
              href="/control-panel/remote-falcon-settings/safeguards"
              sx={{ color: 'primary.main', textDecoration: 'underline' }}
            >
              Show Settings <IconChevronRight size={12} style={{ verticalAlign: 'middle' }} /> Safeguards
            </Box>
            .
          </Typography>
        </Box>
      </MainCard>

      {/* ---------------- Leaders section ---------------- */}
      <Box sx={{ mt: 3 }}>
        <MainCard
          title={
            <Typography variant="h4">Leaders</Typography>
          }
          contentSX={{ p: 0 }}
        >
          <Box sx={{ px: 3, pt: 2, pb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Leader sequences play right before viewer-requested or vote-winner songs —
              an inline "this one's yours!" announcement. Leave blank to skip.
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ px: 3, py: 2 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Request leader sequence
                </Typography>
                <Autocomplete
                  size="small"
                  options={sequenceOptions}
                  value={requestLeaderValue}
                  getOptionLabel={(opt) => opt?.label || ''}
                  isOptionEqualToValue={(o, v) => o.id === v?.id}
                  onChange={handleRequestLeaderChange}
                  disabled={busy}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="(none)"
                      inputProps={{
                        ...params.inputProps,
                        'data-testid': 'request-leader-input'
                      }}
                    />
                  )}
                />
                <Typography variant="caption" color="text.secondary">
                  Plays before each viewer-requested song.
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Vote leader sequence
                </Typography>
                <Autocomplete
                  size="small"
                  options={sequenceOptions}
                  value={voteLeaderValue}
                  getOptionLabel={(opt) => opt?.label || ''}
                  isOptionEqualToValue={(o, v) => o.id === v?.id}
                  onChange={handleVoteLeaderChange}
                  disabled={busy}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="(none)"
                      inputProps={{
                        ...params.inputProps,
                        'data-testid': 'vote-leader-input'
                      }}
                    />
                  )}
                />
                <Typography variant="caption" color="text.secondary">
                  Plays before each vote-winner song.
                </Typography>
              </Box>
            </Stack>
          </Box>
        </MainCard>
      </Box>
    </Box>
  );
};

export default SpecialRoles;
