import { useEffect, useMemo, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  IconCheck,
  IconChevronDown,
  IconCommand,
  IconExclamationCircle,
  IconGripVertical,
  IconLoader2,
  IconMovie,
  IconPlayerPlay,
  IconPlaylist,
  IconSearch,
  IconTrash,
  IconX
} from '@tabler/icons-react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import _ from 'lodash';
import { useSearchParams } from 'react-router-dom';

import {
  playSequenceFromControlPanelService,
  saveSequencesService
} from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import useCoalescedSave from '../../../../hooks/useCoalescedSave';
import {
  PLAY_SEQUENCE_FROM_CONTROL_PANEL,
  UPDATE_SEQUENCES
} from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

import EditableCell from './EditableCell';

// Status chip palette helper. Keeps the JSX tight.
const STATUS_CHIP = {
  active: { label: 'Active', color: 'success' },
  inactive: { label: 'Inactive', color: 'error' }
};

// FPP playlist entries can be SEQUENCE / COMMAND / MEDIA. The Type column
// was removed because nearly every row is SEQUENCE in practice — but when
// a row ISN'T a sequence, owners need to know (a "Set Brightness" command
// silently exposed to viewers is a footgun). This inline icon flags the
// non-SEQUENCE rows next to the Name without burning a column for the
// 99% case where everything is SEQUENCE.
const NON_SEQUENCE_BADGE = {
  COMMAND: {
    icon: IconCommand,
    label: 'FPP command',
    detail:
      'This is an FPP system command (e.g. "Set Brightness"), not a sequence. ' +
      'Viewers can still request it — deactivate or hide it if that\'s not intended.'
  },
  MEDIA: {
    icon: IconMovie,
    label: 'Media file',
    detail:
      'This is a standalone audio/video file (no LED show), not a sequence. ' +
      'Common for welcome announcements; deactivate or hide if not intended for viewers.'
  }
};

const TypeBadge = ({ type }) => {
  const cfg = NON_SEQUENCE_BADGE[type];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <Tooltip title={`${cfg.label} — ${cfg.detail}`} placement="top">
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          color: 'warning.main',
          cursor: 'help'
        }}
      >
        <Icon size={14} stroke={1.75} />
      </Box>
    </Tooltip>
  );
};

const FILTERS = {
  all: { label: 'All', test: () => true },
  active: { label: 'Active', test: (s) => s.active },
  inactive: { label: 'Inactive', test: (s) => !s.active },
  hidden: { label: 'Hidden', test: (s) => s.active && !s.visible }
};

const SORTABLE_COLUMNS = [
  { key: 'active', label: 'Status' },
  { key: 'index', label: 'Index', align: 'center' },
  { key: 'name', label: 'Name' },
  { key: 'displayName', label: 'Display name' },
  { key: 'artist', label: 'Artist' },
  { key: 'group', label: 'Group' },
  { key: 'category', label: 'Category' }
];

// Tiny inline status pill for the per-row autosave indicator.
const SaveIndicator = ({ status }) => {
  const map = {
    dirty: { icon: <IconLoader2 size={12} />, color: 'text.disabled', label: 'Pending' },
    saving: { icon: <IconLoader2 size={12} />, color: 'warning.main', label: 'Saving' },
    saved: { icon: <IconCheck size={12} />, color: 'success.main', label: 'Saved' },
    error: { icon: <IconExclamationCircle size={12} />, color: 'error.main', label: 'Save failed' }
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <Tooltip title={cfg.label}>
      <Box
        sx={{
          width: 14,
          height: 14,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: cfg.color
        }}
      >
        {cfg.icon}
      </Box>
    </Tooltip>
  );
};

const SequencesList = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updateSequencesMutation] = useMutation(UPDATE_SEQUENCES);
  const [playSequenceFromControlPanelMutation] = useMutation(PLAY_SEQUENCE_FROM_CONTROL_PANEL);

  // View state. Group filter is URL-encoded so the Groups tab can deep-link
  // ("show me everything in group X") and the link is shareable / back-button-friendly.
  const [searchParams, setSearchParams] = useSearchParams();
  const groupFilter = searchParams.get('group') || null;
  const setGroupFilter = (next) => {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set('group', next);
    else sp.delete('group');
    setSearchParams(sp, { replace: true });
  };

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [orderBy, setOrderBy] = useState('order');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [busy, setBusy] = useState(false);

  // Per-row save status (rowKey → 'dirty' | 'saving' | 'saved' | 'error')
  const [rowStatus, setRowStatus] = useState({});

  // Bulk selection (set of `${name}-${index}` keys)
  const [selected, setSelected] = useState(new Set());

  // Confirm dialog + menu anchors. Distinct refs so the two menus
  // (page-level kebab + selection bar's "Set group" picker) don't open
  // simultaneously when the other is triggered.
  const [confirm, setConfirm] = useState(null);
  const [bulkAnchor, setBulkAnchor] = useState(null);
  const [groupMenuAnchor, setGroupMenuAnchor] = useState(null);

  const totalCount = show?.sequences?.length || 0;
  const sequenceGroups = show?.sequenceGroups || [];

  const groupOptions = useMemo(
    () => sequenceGroups.map((g) => ({ value: g?.name, label: g?.name })),
    [sequenceGroups]
  );

  const rowKey = (s) => `${s?.name}-${s?.index}`;

  // Coalesced autosave: each cell-blur enqueues a patch; we collapse
  // multiple patches per row into one before writing the full sequences[].
  // This is the on-blur + coalesce path the user picked over a debounced
  // keystroke save — see the notes in useCoalescedSave.jsx.
  const { status: saveStatus, enqueue } = useCoalescedSave(
    async (batch) => {
      // Collapse: per-rowKey, merge fields from all patches in arrival order.
      const merged = new Map();
      batch.forEach(({ key, patch }) => {
        const existing = merged.get(key) || {};
        merged.set(key, { ...existing, ...patch });
      });

      // Mark each affected row as 'saving' so the row indicator updates.
      setRowStatus((rs) => {
        const next = { ...rs };
        merged.forEach((_p, key) => {
          next[key] = 'saving';
        });
        return next;
      });

      const updated = _.cloneDeep(show?.sequences || []);
      updated.forEach((s) => {
        const k = rowKey(s);
        if (merged.has(k)) Object.assign(s, merged.get(k));
      });

      return new Promise((resolve, reject) => {
        saveSequencesService(updated, updateSequencesMutation, (response) => {
          if (response?.success) {
            dispatch(setShow({ ...show, sequences: [...updated] }));
            setRowStatus((rs) => {
              const next = { ...rs };
              merged.forEach((_p, key) => {
                next[key] = 'saved';
              });
              return next;
            });
            // Clear 'saved' status after a moment so rows return to neutral
            setTimeout(() => {
              setRowStatus((rs) => {
                const next = { ...rs };
                merged.forEach((_p, key) => {
                  if (next[key] === 'saved') delete next[key];
                });
                return next;
              });
            }, 1500);
            resolve();
          } else {
            showAlert(dispatch, response?.toast);
            setRowStatus((rs) => {
              const next = { ...rs };
              merged.forEach((_p, key) => {
                next[key] = 'error';
              });
              return next;
            });
            reject(new Error('save failed'));
          }
        });
      });
    },
    { coalesceMs: 600 }
  );

  // Field commit helper called by EditableCell + Switch. Marks row dirty
  // immediately for snappy feedback, then enqueues for the coalesced save.
  const commitField = (sequence, field, value) => {
    const k = rowKey(sequence);
    setRowStatus((rs) => ({ ...rs, [k]: 'dirty' }));
    enqueue({ key: k, patch: { [field]: value } });
  };

  // Filtered + sorted view
  const filteredSequences = useMemo(() => {
    let list = show?.sequences || [];
    if (filter !== 'all') list = list.filter(FILTERS[filter].test);
    if (groupFilter) list = list.filter((s) => s.group === groupFilter);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      list = list.filter((s) =>
        [s?.name, s?.displayName, s?.artist, s?.group, s?.category]
          .filter(Boolean)
          .some((v) => v.toString().toLowerCase().includes(needle))
      );
    }
    if (orderBy !== 'order') list = _.orderBy(list, [orderBy], [order]);
    else list = _.orderBy(list, ['order'], ['asc']);
    return list;
  }, [show?.sequences, filter, groupFilter, search, orderBy, order]);

  const pagedSequences = useMemo(
    () => filteredSequences.slice(page * rowsPerPage, (page + 1) * rowsPerPage),
    [filteredSequences, page, rowsPerPage]
  );

  // Drag is meaningful only when nothing is masking the canonical order.
  const dndEnabled = filter === 'all' && !groupFilter && !search && orderBy === 'order';

  useEffect(() => {
    setPage(0);
  }, [filter, groupFilter, search, rowsPerPage]);

  const handleRequestSort = (column) => {
    if (orderBy === column) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(column);
      setOrder('asc');
    }
  };

  // Save helpers (used for non-editable bulk operations: reorder, delete,
  // toggle visibility/active for many at once).
  const persistSequences = (updated, successMessage) => {
    setBusy(true);
    saveSequencesService(updated, updateSequencesMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, sequences: [...updated] }));
        if (successMessage) showAlert(dispatch, { message: successMessage });
      } else {
        showAlert(dispatch, response?.toast);
      }
      setBusy(false);
    });
  };

  const reorderSequences = (result) => {
    if (!result.destination) return;
    const absSrc = page * rowsPerPage + result.source.index;
    const absDest = page * rowsPerPage + result.destination.index;
    const updated = _.cloneDeep(show?.sequences);
    const [moved] = updated.splice(absSrc, 1);
    updated.splice(absDest, 0, moved);
    updated.forEach((s, i) => {
      s.order = i;
    });
    persistSequences(updated, 'Sequences Order Updated');
  };

  const deleteOne = (sequence) => {
    const updated = _.cloneDeep(show?.sequences || []);
    _.remove(updated, (s) => s.name === sequence.name && s.index === sequence.index);
    persistSequences(updated, `${sequence.name} Deleted`);
  };

  const playSequence = (sequence) => {
    setBusy(true);
    playSequenceFromControlPanelService(sequence, playSequenceFromControlPanelMutation, (response) => {
      showAlert(dispatch, response?.toast);
      setBusy(false);
    });
  };

  // Bulk operations on the selection
  const selectedSequences = useMemo(
    () => (show?.sequences || []).filter((s) => selected.has(rowKey(s))),
    [show?.sequences, selected]
  );

  const bulkSetActive = (active) => {
    const updated = _.cloneDeep(show?.sequences || []);
    updated.forEach((s) => {
      if (selected.has(rowKey(s))) s.active = active;
    });
    persistSequences(updated, `${selected.size} ${selected.size === 1 ? 'sequence' : 'sequences'} ${active ? 'activated' : 'deactivated'}`);
    setSelected(new Set());
  };

  const bulkSetGroup = (groupName) => {
    const updated = _.cloneDeep(show?.sequences || []);
    updated.forEach((s) => {
      if (selected.has(rowKey(s))) s.group = groupName || null;
    });
    persistSequences(updated, `${selected.size} ${selected.size === 1 ? 'sequence' : 'sequences'} updated`);
    setSelected(new Set());
  };

  const bulkDelete = () => {
    const updated = (show?.sequences || []).filter((s) => !selected.has(rowKey(s)));
    persistSequences(updated, `${selected.size} ${selected.size === 1 ? 'sequence' : 'sequences'} deleted`);
    setSelected(new Set());
  };

  const inactiveCount = (show?.sequences || []).filter((s) => !s.active).length;

  const deleteInactive = () => {
    const updated = (show?.sequences || []).filter((s) => s.active);
    persistSequences(updated, 'Inactive Sequences Deleted');
  };
  const deleteAll = () => persistSequences([], 'All Sequences Deleted');

  // Selection helpers
  const togglePageSelection = (allSelected) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pagedSequences.forEach((s) => next.delete(rowKey(s)));
      } else {
        pagedSequences.forEach((s) => next.add(rowKey(s)));
      }
      return next;
    });
  };
  const toggleRow = (s) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = rowKey(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const allOnPageSelected =
    pagedSequences.length > 0 && pagedSequences.every((s) => selected.has(rowKey(s)));
  const someOnPageSelected =
    !allOnPageSelected && pagedSequences.some((s) => selected.has(rowKey(s)));

  const isEmpty = !busy && totalCount === 0;
  const noFilteredResults = !isEmpty && filteredSequences.length === 0;

  const headerStatusLabel = {
    idle: '',
    dirty: 'Pending edits…',
    saving: 'Saving…',
    saved: 'All changes saved',
    error: 'Save failed'
  }[saveStatus];

  return (
    <Box>
      <MainCard content={false}>
        {busy && <LinearProgress />}

        {/* Search + filters + bulk-actions row */}
        {!isEmpty && (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            sx={{ p: 2 }}
          >
            <TextField
              size="small"
              placeholder="Search sequences…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <IconSearch size={16} stroke={1.75} />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}>
                      <IconX size={14} />
                    </IconButton>
                  </InputAdornment>
                ) : null
              }}
              sx={{ minWidth: { md: 280 } }}
            />

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
              {Object.entries(FILTERS).map(([key, { label, test }]) => {
                const count = key === 'all' ? totalCount : (show?.sequences || []).filter(test).length;
                return (
                  <Chip
                    key={key}
                    label={`${label} (${count})`}
                    onClick={() => setFilter(key)}
                    color={filter === key ? 'primary' : 'default'}
                    variant={filter === key ? 'filled' : 'outlined'}
                    size="small"
                  />
                );
              })}
              {groupFilter && (
                <Chip
                  label={`Group: ${groupFilter}`}
                  onDelete={() => setGroupFilter(null)}
                  size="small"
                  color="secondary"
                />
              )}
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 110, textAlign: 'right' }}>
                {headerStatusLabel}
              </Typography>
              <Tooltip title="More actions">
                <IconButton aria-label="More sequence actions" onClick={(e) => setBulkAnchor(e.currentTarget)}>
                  <IconChevronDown size={18} stroke={1.75} />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={bulkAnchor} open={Boolean(bulkAnchor)} onClose={() => setBulkAnchor(null)}>
                <MenuItem
                  disabled={inactiveCount === 0}
                  onClick={() => {
                    setBulkAnchor(null);
                    setConfirm({
                      title: 'Delete inactive sequences?',
                      message: `This will permanently delete ${inactiveCount} inactive ${inactiveCount === 1 ? 'sequence' : 'sequences'}. Active sequences are unaffected.`,
                      confirmLabel: 'Delete inactive',
                      action: deleteInactive
                    });
                  }}
                >
                  Delete inactive ({inactiveCount})
                </MenuItem>
                <MenuItem
                  disabled={totalCount === 0}
                  onClick={() => {
                    setBulkAnchor(null);
                    setConfirm({
                      title: 'Delete all sequences?',
                      message: `This will permanently delete all ${totalCount} ${totalCount === 1 ? 'sequence' : 'sequences'}. This cannot be undone.`,
                      confirmLabel: 'Delete all',
                      action: deleteAll
                    });
                  }}
                >
                  Delete all sequences
                </MenuItem>
              </Menu>
            </Stack>
          </Stack>
        )}

        {/* Bulk action bar — appears only when rows are selected */}
        {selected.size > 0 && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              px: 2,
              py: 1,
              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(244,169,58,0.10)' : 'rgba(244,169,58,0.12)'),
              borderTop: (t) => `1px solid ${t.palette.divider}`,
              borderBottom: (t) => `1px solid ${t.palette.divider}`
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {selected.size} selected
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => bulkSetActive(true)}>Activate</Button>
            <Button size="small" onClick={() => bulkSetActive(false)}>Deactivate</Button>
            <Tooltip title="Assign all selected to a group">
              <Button size="small" onClick={(e) => setGroupMenuAnchor(e.currentTarget)}>
                Set group…
              </Button>
            </Tooltip>
            <Menu
              open={Boolean(groupMenuAnchor)}
              anchorEl={groupMenuAnchor}
              onClose={() => setGroupMenuAnchor(null)}
            >
              <MenuItem onClick={() => { bulkSetGroup(null); setGroupMenuAnchor(null); }}>
                <em>None</em>
              </MenuItem>
              {sequenceGroups.map((g) => (
                <MenuItem key={g?.name} onClick={() => { bulkSetGroup(g?.name); setGroupMenuAnchor(null); }}>
                  {g?.name}
                </MenuItem>
              ))}
            </Menu>
            <Button
              size="small"
              color="error"
              startIcon={<IconTrash size={14} />}
              onClick={() =>
                setConfirm({
                  title: `Delete ${selected.size} ${selected.size === 1 ? 'sequence' : 'sequences'}?`,
                  message: 'This cannot be undone.',
                  confirmLabel: 'Delete',
                  action: bulkDelete
                })
              }
            >
              Delete
            </Button>
            <Button size="small" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </Stack>
        )}

        {isEmpty && (
          <EmptyState
            icon={<IconPlaylist size={32} stroke={1.5} />}
            title="No sequences yet"
            description="Import a CSV from your sequencer or add sequences from your show software's plugin to get started."
          />
        )}

        {noFilteredResults && (
          <EmptyState
            icon={<IconPlaylist size={32} stroke={1.5} />}
            title="No sequences match your filters"
            description="Try a different filter or clear your search to see all sequences."
            cta={{
              label: 'Clear filters',
              onClick: () => {
                setFilter('all');
                setGroupFilter(null);
                setSearch('');
              }
            }}
          />
        )}

        {!isEmpty && !noFilteredResults && (
          <>
            <TableContainer>
              <Table size="small" aria-label="sequences">
                <TableHead sx={{ '& th,& td': { whiteSpace: 'nowrap' } }}>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allOnPageSelected}
                        indeterminate={someOnPageSelected}
                        onChange={() => togglePageSelection(allOnPageSelected)}
                        inputProps={{ 'aria-label': 'Select all sequences on this page' }}
                      />
                    </TableCell>
                    {/* drag handle column has no header */}
                    <TableCell sx={{ width: 28, p: 0 }} />
                    {SORTABLE_COLUMNS.map((col) => (
                      <TableCell key={col.key} align={col.align || 'left'}>
                        <TableSortLabel
                          active={orderBy === col.key}
                          direction={orderBy === col.key ? order : 'asc'}
                          onClick={() => handleRequestSort(col.key)}
                        >
                          {col.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                    <TableCell>Visible</TableCell>
                    <TableCell>Image URL</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <DragDropContext onDragEnd={reorderSequences}>
                  <Droppable droppableId="sequences" isDropDisabled={!dndEnabled}>
                    {(provided) => (
                      <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                        {pagedSequences.map((sequence, index) => {
                          const k = rowKey(sequence);
                          const status = rowStatus[k];
                          const isSelected = selected.has(k);
                          return (
                            <Draggable
                              index={index}
                              draggableId={k}
                              key={k}
                              isDragDisabled={!dndEnabled || !sequence.active}
                            >
                              {(dragProvided) => (
                                <TableRow
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  hover
                                  selected={isSelected}
                                >
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={isSelected}
                                      onChange={() => toggleRow(sequence)}
                                      inputProps={{ 'aria-label': `Select ${sequence.name}` }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ width: 28, p: 0, color: 'text.disabled' }}>
                                    <Tooltip title={dndEnabled ? 'Drag to reorder' : 'Reordering disabled while filtering or sorting'}>
                                      <Box
                                        {...(dndEnabled ? dragProvided.dragHandleProps : {})}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          height: '100%',
                                          cursor: dndEnabled && sequence.active ? 'grab' : 'default',
                                          opacity: dndEnabled && sequence.active ? 1 : 0.3
                                        }}
                                      >
                                        <IconGripVertical size={14} />
                                      </Box>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      label={sequence.active ? STATUS_CHIP.active.label : STATUS_CHIP.inactive.label}
                                      color={sequence.active ? STATUS_CHIP.active.color : STATUS_CHIP.inactive.color}
                                      size="small"
                                      variant="outlined"
                                    />
                                  </TableCell>
                                  <TableCell align="center">
                                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                      {sequence.index ?? '—'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell sx={{ minWidth: 160 }}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                      <TypeBadge type={sequence.type} />
                                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                                        {sequence.name}
                                      </Typography>
                                      <SaveIndicator status={status} />
                                    </Stack>
                                  </TableCell>
                                  <TableCell sx={{ minWidth: 180 }}>
                                    <EditableCell
                                      value={sequence.displayName}
                                      onCommit={(v) => commitField(sequence, 'displayName', v)}
                                      placeholder="Display name"
                                    />
                                  </TableCell>
                                  <TableCell sx={{ minWidth: 140 }}>
                                    <EditableCell
                                      value={sequence.artist}
                                      onCommit={(v) => commitField(sequence, 'artist', v)}
                                      placeholder="Artist"
                                    />
                                  </TableCell>
                                  <TableCell sx={{ minWidth: 140 }}>
                                    {/* Group: read-only chip that filters on click; click-to-edit opens select */}
                                    {sequence.group ? (
                                      <Chip
                                        label={sequence.group}
                                        size="small"
                                        variant="outlined"
                                        onClick={() => setGroupFilter(sequence.group)}
                                        onDelete={() => commitField(sequence, 'group', null)}
                                        sx={{ cursor: 'pointer' }}
                                      />
                                    ) : (
                                      <EditableCell
                                        value={sequence.group}
                                        variant="select"
                                        options={groupOptions}
                                        emptyLabel="Add group…"
                                        onCommit={(v) => commitField(sequence, 'group', v || null)}
                                        disabled={!sequence.active}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell sx={{ minWidth: 120 }}>
                                    <EditableCell
                                      value={sequence.category}
                                      onCommit={(v) => commitField(sequence, 'category', v)}
                                      placeholder="Category"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Switch
                                      size="small"
                                      checked={!!sequence.visible}
                                      disabled={!sequence.active}
                                      onChange={(e) => commitField(sequence, 'visible', e.target.checked)}
                                      inputProps={{ 'aria-label': `Visibility for ${sequence.name}` }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ minWidth: 200 }}>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                      {sequence.imageUrl && (
                                        <Box
                                          component="img"
                                          src={sequence.imageUrl}
                                          alt=""
                                          loading="lazy"
                                          sx={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: 0.5,
                                            objectFit: 'cover',
                                            flexShrink: 0
                                          }}
                                        />
                                      )}
                                      <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <EditableCell
                                          value={sequence.imageUrl}
                                          onCommit={(v) => commitField(sequence, 'imageUrl', v)}
                                          placeholder="Image URL"
                                        />
                                      </Box>
                                    </Stack>
                                  </TableCell>
                                  <TableCell align="right">
                                    <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                                      <Tooltip title="Play now">
                                        <span>
                                          <IconButton
                                            size="small"
                                            onClick={() => playSequence(sequence)}
                                            disabled={!sequence.active}
                                            sx={{ color: 'success.main' }}
                                          >
                                            <IconPlayerPlay size={16} stroke={1.75} />
                                          </IconButton>
                                        </span>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton
                                          size="small"
                                          onClick={() =>
                                            setConfirm({
                                              title: `Delete ${sequence.name}?`,
                                              message: `This will permanently delete the sequence "${sequence.name}". This cannot be undone.`,
                                              confirmLabel: 'Delete',
                                              action: () => deleteOne(sequence)
                                            })
                                          }
                                          sx={{ color: 'error.main' }}
                                        >
                                          <IconTrash size={16} stroke={1.75} />
                                        </IconButton>
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
            <TablePagination
              component="div"
              count={filteredSequences.length}
              page={page}
              onPageChange={(_e, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </>
        )}
      </MainCard>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              confirm?.action?.();
              setConfirm(null);
            }}
          >
            {confirm?.confirmLabel || 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SequencesList;
