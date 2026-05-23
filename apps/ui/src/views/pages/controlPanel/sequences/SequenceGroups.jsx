import { useMemo, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import {
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
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
import { IconPlus, IconStack2, IconTrash } from '@tabler/icons-react';
import _ from 'lodash';
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
    const updated = groups.filter((g) => g?.name !== group?.name);
    persistGroups(updated, `Group "${group?.name}" deleted`);
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
                  <TableCell>Group name</TableCell>
                  <TableCell>Members</TableCell>
                  <TableCell>Sequences</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((group) => {
                  const members = membersByGroup.get(group?.name) || [];
                  const previewNames = members.slice(0, 3).map((m) => m?.displayName || m?.name).join(', ');
                  const more = members.length > 3 ? ` +${members.length - 3} more` : '';
                  return (
                    <TableRow key={group?.name} hover>
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
                              disabled={members.length > 0}
                              onClick={() =>
                                setConfirm({
                                  title: `Delete "${group?.name}"?`,
                                  message: 'This deletes the group itself; sequences are not affected.',
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
                  );
                })}

                {/* Inline add row — last row in the table for natural eye flow */}
                <TableRow>
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
