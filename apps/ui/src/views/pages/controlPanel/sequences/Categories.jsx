import { useMemo, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import {
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
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
import { IconPlus, IconTags, IconTrash } from '@tabler/icons-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import {
  saveCategoriesService,
  saveSequencesService
} from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import ConfirmDialog from '../../../../ui-component/ConfirmDialog';
import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import {
  UPDATE_CATEGORIES,
  UPDATE_SEQUENCES
} from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

import EditableCell from './EditableCell';

// Categories tab (PRD-009 #128). First-class categories carry the Cluster A
// fairness attributes: a collective request limit (#72 — throttles all members
// of the category together) and anti-consecutive (#109 flag). Renaming a
// category patches every sequence whose `category` field referenced the old
// name so memberships stay intact.
const Categories = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { show } = useSelector((state) => state.show);

  const [updateCategoriesMutation] = useMutation(UPDATE_CATEGORIES);
  const [updateSequencesMutation] = useMutation(UPDATE_SEQUENCES);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [newName, setNewName] = useState('');

  const categories = show?.categories || [];
  const sequences = show?.sequences || [];

  const membersByCategory = useMemo(() => {
    const map = new Map();
    (show?.sequences || []).forEach((s) => {
      if (!s?.category) return;
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category).push(s);
    });
    return map;
  }, [show?.sequences]);

  const persistCategories = (updated, message) => {
    setBusy(true);
    saveCategoriesService(updated, updateCategoriesMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, categories: [...updated] }));
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

  const updateCategory = (name, patch) => {
    const updated = categories.map((c) => (c?.name === name ? { ...c, ...patch } : c));
    persistCategories(updated);
  };

  const renameCategory = async (oldName, nextName) => {
    const trimmed = (nextName || '').trim();
    if (!trimmed || trimmed === oldName) return;
    if (categories.some((c) => c?.name === trimmed)) {
      showAlert(dispatch, { alert: 'error', message: `A category named "${trimmed}" already exists.` });
      return;
    }
    setBusy(true);
    // Rename is a 2-step write: patch the category entry, then patch every
    // sequence whose `category` referenced the old name. Sequential so a
    // partial failure doesn't orphan memberships.
    const updatedCategories = categories.map((c) => (c?.name === oldName ? { ...c, name: trimmed } : c));
    const updatedSequences = sequences.map((s) => (s?.category === oldName ? { ...s, category: trimmed } : s));

    try {
      await new Promise((resolve, reject) => {
        saveCategoriesService(updatedCategories, updateCategoriesMutation, (response) => {
          if (response?.success) resolve();
          else reject(new Error('category save failed'));
        });
      });
      await persistSequences(updatedSequences);
      dispatch(setShow({ ...show, categories: updatedCategories, sequences: updatedSequences }));
      showAlert(dispatch, { message: `Renamed to "${trimmed}"` });
    } catch {
      showAlert(dispatch, { alert: 'error', message: 'Rename failed' });
    } finally {
      setBusy(false);
    }
  };

  const addCategory = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (categories.some((c) => c?.name === trimmed)) {
      showAlert(dispatch, { alert: 'error', message: `A category named "${trimmed}" already exists.` });
      return;
    }
    const updated = [...categories, { name: trimmed, requestLimit: 0, antiConsecutive: false }];
    persistCategories(updated, `Category "${trimmed}" created`);
    setNewName('');
  };

  const deleteCategory = (category) => {
    const updatedCategories = categories.filter((c) => c?.name !== category?.name);
    // The server cascades on delete (updateCategories clears sequence.category for
    // the removed category). Mirror it optimistically so the Sequences list +
    // member counts stay in sync without a refetch.
    const updatedSequences = sequences.map((s) => (s?.category === category?.name ? { ...s, category: null } : s));
    setBusy(true);
    saveCategoriesService(updatedCategories, updateCategoriesMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, categories: [...updatedCategories], sequences: [...updatedSequences] }));
        showAlert(dispatch, { message: `Category "${category?.name}" deleted` });
      } else {
        showAlert(dispatch, response?.toast);
      }
      setBusy(false);
    });
  };

  const filterListByCategory = (categoryName) => {
    navigate(`/control-panel/sequences/list?category=${encodeURIComponent(categoryName)}`);
  };

  const isEmpty = !busy && categories.length === 0;

  return (
    <Box data-testid="sequences-categories-root">
      <MainCard content={false}>
        {busy && <LinearProgress />}

        {isEmpty ? (
          <EmptyState
            icon={<IconTags size={32} stroke={1.5} />}
            title="No categories yet"
            description="Categories classify your sequences (e.g. 'Christmas', 'Non-Seasonal') and can carry a collective request limit so a whole group of songs is throttled together."
          />
        ) : (
          <TableContainer>
            <Table size="small" aria-label="categories">
              <TableHead sx={{ '& th,& td': { whiteSpace: 'nowrap' } }}>
                <TableRow>
                  <TableCell>Category name</TableCell>
                  <TableCell>Members</TableCell>
                  <TableCell>Request limit</TableCell>
                  <TableCell>No back-to-back</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((category) => {
                  const members = membersByCategory.get(category?.name) || [];
                  return (
                    <TableRow key={category?.name} hover>
                      <TableCell sx={{ minWidth: 200 }}>
                        <EditableCell
                          value={category?.name}
                          onCommit={(v) => renameCategory(category?.name, v)}
                          placeholder="Category name"
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 100 }}>
                        <Chip
                          label={`${members.length} ${members.length === 1 ? 'sequence' : 'sequences'}`}
                          size="small"
                          variant="outlined"
                          color={members.length > 0 ? 'primary' : 'default'}
                          onClick={members.length > 0 ? () => filterListByCategory(category?.name) : undefined}
                          sx={{ cursor: members.length > 0 ? 'pointer' : 'default' }}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <Tooltip title="Max requests for this whole category within the recent window. 0 = no limit.">
                          <TextField
                            size="small"
                            type="number"
                            defaultValue={category?.requestLimit ?? 0}
                            onBlur={(e) =>
                              updateCategory(category?.name, { requestLimit: parseInt(e.target.value, 10) || 0 })
                            }
                            sx={{ width: 90 }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ minWidth: 100 }}>
                        <Tooltip title="Don't let two songs from this category play back-to-back.">
                          <Switch
                            color="primary"
                            checked={!!category?.antiConsecutive}
                            onChange={(_e, v) => updateCategory(category?.name, { antiConsecutive: v })}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Delete category">
                          <IconButton
                            size="small"
                            onClick={() =>
                              setConfirm({
                                title: `Delete "${category?.name}"?`,
                                message:
                                  'This removes the category and its limit. Songs in it become uncategorized.',
                                confirmLabel: 'Delete',
                                action: () => deleteCategory(category)
                              })
                            }
                            sx={{ color: 'error.main' }}
                          >
                            <IconTrash size={16} stroke={1.75} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Inline add row */}
                <TableRow>
                  <TableCell sx={{ borderBottom: 'none' }}>
                    <TextField
                      size="small"
                      placeholder="New category name…"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCategory();
                      }}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell colSpan={3} sx={{ borderBottom: 'none' }}>
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
                      onClick={addCategory}
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
          To assign sequences to a category, edit the Category cell on the{' '}
          <RouterLink to="/control-panel/sequences/list" style={{ color: 'inherit' }}>
            Sequences
          </RouterLink>{' '}
          tab — or use the Set category… bulk action there.
        </Typography>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </Box>
  );
};

export default Categories;
