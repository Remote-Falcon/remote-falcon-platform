import { useMemo, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
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
  TableSortLabel,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { IconGripVertical, IconPlus, IconTags, IconTrash } from '@tabler/icons-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import {
  saveCategoriesService,
  saveSequencesService
} from '../../../../services/controlPanel/mutations.service';
import useTableSort from '../../../../hooks/useTableSort';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import ConfirmDialog from '../../../../ui-component/ConfirmDialog';
import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import {
  UPDATE_CATEGORIES,
  UPDATE_SEQUENCES
} from '../../../../utils/graphql/controlPanel/mutations';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { showAlert } from '../../globalPageHelpers';

import { reorderCategories, sortCategoriesAlphabetically } from './categoriesReorder';
import EditableCell from './EditableCell';

// Categories tab (PRD-009 #128). First-class categories carry the Cluster A
// fairness attributes: a collective request limit (#72 — throttles all members
// of the category together) and anti-consecutive (#109 flag). Renaming a
// category patches every sequence whose `category` field referenced the old
// name so memberships stay intact.
// What a category's nightly-play-limit cell means, spelled out under the
// field. Blank and 0 look almost identical in a number input but do opposite
// things (inherit vs never capped), so neither is left to be guessed at.
export const nightlyLimitHint = (categoryLimit, showLimit) => {
  if (categoryLimit === null || categoryLimit === undefined || categoryLimit === '') {
    return showLimit > 0 ? `Using show limit (${showLimit})` : 'No limit set';
  }
  if (categoryLimit === 0) return 'Never capped';
  return `${categoryLimit} per night`;
};

const Categories = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { show } = useSelector((state) => state.show);

  const [updateCategoriesMutation] = useMutation(UPDATE_CATEGORIES);
  const [updateSequencesMutation] = useMutation(UPDATE_SEQUENCES);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [newName, setNewName] = useState('');

  // Column sort mirrors the Sequences tab: clicking the header previews the
  // sort, and the preview is only committed on save. Both tabs persist a
  // hand-dragged order, so neither can silently overwrite it on a click.
  const { orderBy, order, requestSort, resetSort } = useTableSort(null, 'asc');
  const sortIsPreview = orderBy !== null;

  const categories = show?.categories || [];
  const sequences = show?.sequences || [];
  // Shown beside each row's input so an operator can see what "blank"
  // resolves to without going back to the settings screen.
  const showNightlyPlayLimit = show?.preferences?.nightlyPlayLimit ?? 0;

  // What the table renders: the saved (drag) order, or the previewed sort.
  const visibleCategories = useMemo(
    () => (sortIsPreview ? sortCategoriesAlphabetically(categories, order) : categories),
    [sortIsPreview, categories, order]
  );
  // Same mutual exclusion as the Sequences tab — dragging a previewed order
  // would be reordering something that isn't what's saved.
  const dndEnabled = !busy && !sortIsPreview;

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

  const reorder = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = reorderCategories(categories, result.source.index, result.destination.index);
    // Optimistic dispatch so @hello-pangea/dnd settles the row in its new spot
    // instead of snapping it back while the save round-trips.
    dispatch(setShow({ ...show, categories: reordered }));
    setBusy(true);
    saveCategoriesService(reordered, updateCategoriesMutation, (response) => {
      if (response?.success) {
        showAlert(dispatch, { message: 'Category order updated' });
      } else {
        showAlert(dispatch, response?.toast);
      }
      setBusy(false);
    });
  };

  // Commit the previewed column sort as the saved category order. This is
  // where an alphabetical ordering has to live: displayOrder — what the viewer
  // page sorts category sections by — is owned by this tab, not by the
  // Sequences tab's column sort, which only ever writes sequence.order.
  const applySortToOrder = () => {
    // Nothing has physically moved (unlike a drag), so persistCategories's own
    // dispatch on success is enough; no optimistic dispatch needed.
    const sorted = sortCategoriesAlphabetically(categories, order);
    persistCategories(sorted, 'Category order updated');
    // Mirrors sequence_order_applied_from_sort on the Sequences tab — without
    // it there is no way to tell whether operators use this at all.
    trackPosthogEvent('category_order_applied_from_sort', {
      direction: order,
      category_count: sorted.length
    });
    resetSort();
  };

  const confirmApplySortToOrder = () => {
    setConfirm({
      title: 'Save this order to your viewer page?',
      message:
        `All ${categories.length} ${categories.length === 1 ? 'category' : 'categories'} will be reordered by ` +
        `name (${order === 'asc' ? 'A→Z' : 'Z→A'}), replacing the order category sections currently appear in ` +
        'on your viewer page. You can still drag individual categories afterward.',
      confirmLabel: 'Save order',
      confirmColor: 'primary',
      action: applySortToOrder
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
    // nightlyPlayLimit is deliberately absent, not 0: absent means "inherit
    // the show limit", while 0 would exempt every newly created category from
    // the nightly cap.
    const updated = [...categories, { name: trimmed, requestLimit: 0, antiConsecutive: false, displayOrder: categories.length }];
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
            {/* Same preview-then-save flow as the Sequences tab: a click on the
                header shows what the sort would look like without overwriting
                the order the operator dragged into place. */}
            {sortIsPreview && (
              <Box
                data-testid="categories-sort-banner"
                role="status"
                aria-live="polite"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1,
                  mb: 0.5,
                  mx: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(244,169,58,0.10)' : 'rgba(244,169,58,0.12)')
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, minWidth: 240 }}>
                  Sorted by <strong>Category name</strong> ({order === 'asc' ? 'A→Z' : 'Z→A'}) — preview only. Your
                  viewer page still uses your saved order.
                </Typography>
                <Tooltip title="Reorder every category to match this sort, and save it as your viewer page's category order">
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      disabled={busy || categories.length === 0}
                      onClick={confirmApplySortToOrder}
                    >
                      Save as category order
                    </Button>
                  </span>
                </Tooltip>
                <Button size="small" onClick={resetSort}>
                  Cancel sort
                </Button>
              </Box>
            )}
            <Table size="small" aria-label="categories">
              <TableHead sx={{ '& th,& td': { whiteSpace: 'nowrap' } }}>
                <TableRow>
                  <TableCell sx={{ width: 28, p: 0 }} />
                  <TableCell sortDirection={orderBy === 'name' ? order : false}>
                    <TableSortLabel
                      data-testid="categories-sort-header-name"
                      active={orderBy === 'name'}
                      direction={orderBy === 'name' ? order : 'asc'}
                      onClick={() => requestSort('name')}
                    >
                      Category name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Members</TableCell>
                  <TableCell>Request limit</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                      Nightly play limit
                      <InfoTwoToneIcon
                        data-testid="categories-nightly-limit-docs"
                        onClick={() =>
                          window.open(
                            'https://docs.remotefalcon.com/docs/docs/control-panel/show/sequences#nightly-play-limit',
                            '_blank',
                            'noreferrer'
                          )
                        }
                        fontSize="small"
                        sx={{ cursor: 'pointer' }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>No back-to-back</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <DragDropContext onDragEnd={reorder}>
                <Droppable droppableId="categories" isDropDisabled={!dndEnabled}>
                  {(provided) => (
                    <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                      {visibleCategories.map((category, index) => {
                        const members = membersByCategory.get(category?.name) || [];
                        return (
                          <Draggable
                            key={category?.name}
                            draggableId={String(category?.name)}
                            index={index}
                            isDragDisabled={!dndEnabled}
                          >
                            {(dragProvided) => (
                              <TableRow ref={dragProvided.innerRef} {...dragProvided.draggableProps} hover>
                                <TableCell sx={{ width: 28, p: 0, color: 'text.disabled' }}>
                                  <Tooltip
                                    title={
                                      busy
                                        ? 'Saving…'
                                        : sortIsPreview
                                          ? 'Dragging is off while a column sort is previewing — save the sort as your order, or cancel it'
                                          : 'Drag to reorder'
                                    }
                                  >
                                    <Box
                                      {...(dndEnabled ? dragProvided.dragHandleProps : {})}
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        cursor: dndEnabled ? 'grab' : 'default',
                                        opacity: dndEnabled ? 1 : 0.3
                                      }}
                                    >
                                      <IconGripVertical size={14} />
                                    </Box>
                                  </Tooltip>
                                </TableCell>
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
                                      inputProps={{ 'aria-label': `Request limit for ${category?.name ?? 'category'}` }}
                                      defaultValue={category?.requestLimit ?? 0}
                                      onBlur={(e) =>
                                        updateCategory(category?.name, { requestLimit: parseInt(e.target.value, 10) || 0 })
                                      }
                                      sx={{ width: 90 }}
                                    />
                                  </Tooltip>
                                </TableCell>
                                <TableCell sx={{ minWidth: 220 }}>
                                  {/* Hint sits BESIDE the input, not in helperText:
                                      helperText renders on its own line under every
                                      row (taller rows than the Sequences tab) and
                                      wraps inside the input's width, which split
                                      "Using show limit (3)" across two lines. */}
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Tooltip title="How many times a song in this category can play per night. Leave blank to use the show's nightly play limit, or enter 0 to exempt this category from it.">
                                      <TextField
                                        size="small"
                                        type="number"
                                        placeholder="Show limit"
                                        // The visible label is a column header, not a
                                        // <label>, and the Tooltip's title lands on MUI's
                                        // wrapper rather than the input — so without this
                                        // the field has no accessible name at all.
                                        inputProps={{
                                          min: 0,
                                          'aria-label': `Nightly play limit for ${category?.name ?? 'category'}`
                                        }}
                                        defaultValue={category?.nightlyPlayLimit ?? ''}
                                        // Blank means "inherit the show limit", which is a
                                        // different thing from 0 ("never capped"), so this
                                        // can't use the `|| 0` coercion the request limit
                                        // above uses — that would turn inherit into exempt.
                                        onBlur={(e) => {
                                          const raw = e.target.value.trim();
                                          const parsed = raw === '' ? null : parseInt(raw, 10);
                                          // A negative parses cleanly but reads as "<= 0"
                                          // downstream, which would silently exempt the
                                          // category while the hint claimed a real limit.
                                          // Anything that isn't a usable count means inherit.
                                          const usable =
                                            parsed === null || Number.isNaN(parsed) || parsed < 0 ? null : parsed;
                                          // Uncontrolled input: without this a rejected value
                                          // stays on screen ("-1") while the hint beside it
                                          // reports the value we actually stored.
                                          if (String(usable ?? '') !== raw) {
                                            e.target.value = usable ?? '';
                                          }
                                          updateCategory(category?.name, { nightlyPlayLimit: usable });
                                        }}
                                        sx={{ width: 90 }}
                                      />
                                    </Tooltip>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                      {nightlyLimitHint(category?.nightlyPlayLimit, showNightlyPlayLimit)}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <TableCell sx={{ minWidth: 100 }}>
                                  <Tooltip title="Don't let two songs from this category play back-to-back.">
                                    <Switch
                                      color="primary"
                                      inputProps={{ 'aria-label': `No back-to-back for ${category?.name ?? 'category'}` }}
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
                {/* Inline add row */}
                <TableRow>
                  <TableCell sx={{ borderBottom: 'none' }} />
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
                  <TableCell colSpan={4} sx={{ borderBottom: 'none' }}>
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
          Drag rows to reorder — category sections appear on your viewer page in this order. Or sort the Category name
          column and save that sort as your order.
        </Typography>
      )}

      {!isEmpty && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, ml: 1 }}>
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
