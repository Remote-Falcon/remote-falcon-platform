import { useMemo, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import {
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
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
import { IconGripVertical, IconPlus, IconStack2, IconTrash } from '@tabler/icons-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import {
  saveSequenceGroupsService,
  saveSequencesService
} from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import ConfirmDialog from '../../../../ui-component/ConfirmDialog';
import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import {
  UPDATE_SEQUENCES,
  UPDATE_SEQUENCE_GROUPS
} from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

import { reorderSequenceGroups } from './sequenceGroupsReorder';
import EditableCell from './EditableCell';

// Sequence Groups tab. Replaces the old "Manage Sequence Groups" modal +
// "Create New Sequence Group" modal — both are merged into this list view
// with inline rename and an inline "+ New group" row at the bottom.
//
// Renaming a group also patches every sequence whose `group` field
// references the old name, so existing memberships don't get orphaned.
const SequenceGroups = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { show } = useSelector((state) => state.show);

  const [updateSequenceGroupsMutation] = useMutation(UPDATE_SEQUENCE_GROUPS);
  const [updateSequencesMutation] = useMutation(UPDATE_SEQUENCES);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [newName, setNewName] = useState('');

  const groups = show?.sequenceGroups || [];
  const sequences = show?.sequences || [];

  // Pre-aggregate sequences by group for the per-row member-count chip
  // and the preview text — single pass, O(N).
  const membersByGroup = useMemo(() => {
    const map = new Map();
    sequences.forEach((s) => {
      if (!s?.group) return;
      if (!map.has(s.group)) map.set(s.group, []);
      map.get(s.group).push(s);
    });
    return map;
  }, [sequences]);

  const persistGroups = (updated, message) => {
    setBusy(true);
    saveSequenceGroupsService(updated, updateSequenceGroupsMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, sequenceGroups: [...updated] }));
        if (message) showAlert(dispatch, { message });
      } else {
        showAlert(dispatch, response?.toast);
      }
      setBusy(false);
    });
  };

  const reorder = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = reorderSequenceGroups(groups, result.source.index, result.destination.index);
    // Optimistic dispatch so @hello-pangea/dnd settles the row in its new spot
    // instead of snapping it back while the save round-trips.
    dispatch(setShow({ ...show, sequenceGroups: reordered }));
    setBusy(true);
    saveSequenceGroupsService(reordered, updateSequenceGroupsMutation, (response) => {
      if (response?.success) {
        showAlert(dispatch, { message: 'Group order updated' });
      } else {
        showAlert(dispatch, response?.toast);
      }
      setBusy(false);
    });
  };

  const persistSequences = (updated) => new Promise((resolve, reject) => {
    saveSequencesService(updated, updateSequencesMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, sequences: [...updated] }));
        resolve();
      } else {
        showAlert(dispatch, response?.toast);
        reject(new Error('save failed'));
      }
    });
  });

  const renameGroup = async (oldName, nextName) => {
    const trimmed = (nextName || '').trim();
    if (!trimmed || trimmed === oldName) return;
    if (groups.some((g) => g?.name === trimmed)) {
      showAlert(dispatch, { alert: 'error', message: `A group named "${trimmed}" already exists.` });
      return;
    }
    setBusy(true);
    // Group rename is a 2-step write: patch the group entry, then patch
    // every sequence whose `group` field referenced the old name. We do
    // them sequentially so a partial failure doesn't leave members
    // pointing at a deleted group name.
    const updatedGroups = groups.map((g) => (g?.name === oldName ? { ...g, name: trimmed } : g));
    const updatedSequences = sequences.map((s) => (s?.group === oldName ? { ...s, group: trimmed } : s));

    try {
      await new Promise((resolve, reject) => {
        saveSequenceGroupsService(updatedGroups, updateSequenceGroupsMutation, (response) => {
          if (response?.success) resolve();
          else reject(new Error('group save failed'));
        });
      });
      await persistSequences(updatedSequences);
      dispatch(setShow({ ...show, sequenceGroups: updatedGroups, sequences: updatedSequences }));
      showAlert(dispatch, { message: `Renamed to "${trimmed}"` });
    } catch {
      showAlert(dispatch, { alert: 'error', message: 'Rename failed' });
    } finally {
      setBusy(false);
    }
  };

  const addGroup = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (groups.some((g) => g?.name === trimmed)) {
      showAlert(dispatch, { alert: 'error', message: `A group named "${trimmed}" already exists.` });
      return;
    }
    const updated = [...groups, { name: trimmed, visibilityCount: 0 }];
    persistGroups(updated, `Group "${trimmed}" created`);
    setNewName('');
  };

  const deleteGroup = (group) => {
    const updatedGroups = groups.filter((g) => g?.name !== group?.name);
    // The server cascades on delete (updateSequenceGroups clears sequence.group
    // for the removed group, so its songs become ungrouped instead of vanishing
    // from the viewer). Mirror it optimistically so the UI stays in sync.
    const updatedSequences = sequences.map((s) => (s?.group === group?.name ? { ...s, group: null } : s));
    setBusy(true);
    saveSequenceGroupsService(updatedGroups, updateSequenceGroupsMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, sequenceGroups: [...updatedGroups], sequences: [...updatedSequences] }));
        showAlert(dispatch, { message: `Group "${group?.name}" deleted` });
      } else {
        showAlert(dispatch, response?.toast);
      }
      setBusy(false);
    });
  };

  const filterListByGroup = (groupName) => {
    navigate(`/control-panel/sequences/list?group=${encodeURIComponent(groupName)}`);
  };

  const isEmpty = !busy && groups.length === 0;

  return (
    <Box data-testid="sequences-groups-root">
      <MainCard content={false}>
        {busy && <LinearProgress />}

        {isEmpty ? (
          <EmptyState
            icon={<IconStack2 size={32} stroke={1.5} />}
            title="No sequence groups yet"
            description="Groups let you bundle several sequences into one selectable item on the viewer page (e.g., 'Frosty Trio' that plays three songs in order)."
          />
        ) : (
          <TableContainer>
            <Table size="small" aria-label="sequence groups">
              <TableHead sx={{ '& th,& td': { whiteSpace: 'nowrap' } }}>
                <TableRow>
                  <TableCell sx={{ width: 28, p: 0 }} />
                  <TableCell>Group name</TableCell>
                  <TableCell>Members</TableCell>
                  <TableCell>Sequences</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <DragDropContext onDragEnd={reorder}>
                <Droppable droppableId="sequence-groups" isDropDisabled={busy}>
                  {(provided) => (
                    <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                      {groups.map((group, index) => {
                        const members = membersByGroup.get(group?.name) || [];
                        const previewNames = members.slice(0, 3).map((m) => m?.displayName || m?.name).join(', ');
                        const more = members.length > 3 ? ` +${members.length - 3} more` : '';
                        return (
                          <Draggable
                            key={group?.name}
                            draggableId={String(group?.name)}
                            index={index}
                            isDragDisabled={busy}
                          >
                            {(dragProvided) => (
                              <TableRow ref={dragProvided.innerRef} {...dragProvided.draggableProps} hover>
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
                                <TableCell sx={{ minWidth: 200 }}>
                                  <EditableCell
                                    value={group?.name}
                                    onCommit={(v) => renameGroup(group?.name, v)}
                                    placeholder="Group name"
                                  />
                                </TableCell>
                                <TableCell sx={{ minWidth: 100 }}>
                                  <Chip
                                    label={`${members.length} ${members.length === 1 ? 'sequence' : 'sequences'}`}
                                    size="small"
                                    variant="outlined"
                                    color={members.length > 0 ? 'primary' : 'default'}
                                    onClick={members.length > 0 ? () => filterListByGroup(group?.name) : undefined}
                                    sx={{ cursor: members.length > 0 ? 'pointer' : 'default' }}
                                  />
                                </TableCell>
                                <TableCell sx={{ minWidth: 240, color: 'text.secondary' }}>
                                  {members.length > 0 ? (
                                    <Typography variant="body2" noWrap>
                                      {previewNames}
                                      {more}
                                    </Typography>
                                  ) : (
                                    <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                      No sequences in this group yet
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  <Tooltip
                                    title={
                                      members.length > 0
                                        ? 'Remove all members from this group before deleting'
                                        : 'Delete group'
                                    }
                                  >
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() =>
                                          setConfirm({
                                            title: `Delete "${group?.name}"?`,
                                            message: 'Deletes the group. Songs in it become ungrouped (they show individually on the viewer page).',
                                            confirmLabel: 'Delete',
                                            action: () => deleteGroup(group)
                                          })
                                        }
                                        sx={{ color: 'error.main' }}
                                      >
                                        <IconTrash size={16} stroke={1.75} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
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
              <TableBody>
                {/* Inline add row — last row in the table for natural eye flow */}
                <TableRow>
                  <TableCell sx={{ borderBottom: 'none' }} />
                  <TableCell sx={{ borderBottom: 'none' }}>
                    <TextField
                      size="small"
                      placeholder="New group name…"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addGroup();
                      }}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell colSpan={2} sx={{ borderBottom: 'none' }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      Press Enter or click Add
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ borderBottom: 'none' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<IconPlus size={14} stroke={1.75} />}
                      disabled={!newName.trim()}
                      onClick={addGroup}
                    >
                      Add
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </MainCard>

      {!isEmpty && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, ml: 1 }}>
          Drag rows to reorder this list. This organizes the dashboard only — on your viewer page a
          group appears at the position of its first song in the Sequences order, not the order set here.
        </Typography>
      )}

      {!isEmpty && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, ml: 1 }}>
          To add sequences to a group, edit the Group cell on the{' '}
          <RouterLink to="/control-panel/sequences/list" style={{ color: 'inherit' }}>
            Sequences
          </RouterLink>{' '}
          tab — or use the Set group… bulk action there.
        </Typography>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </Box>
  );
};

export default SequenceGroups;
