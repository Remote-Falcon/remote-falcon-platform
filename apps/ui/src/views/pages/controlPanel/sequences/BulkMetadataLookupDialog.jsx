import { useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography
} from '@mui/material';
import PropTypes from 'prop-types';

import useTableSort from '../../../../hooks/useTableSort';
import { estimateBulkLookupMinutes, runBulkLookup } from '../../../../utils/bulkMetadataLookup';
import ArtworkThumb from './ArtworkThumb';

// Bulk metadata lookup dialog (PRD-remote-falcon-003, bulk flow).
//
// Two phases: a rate-limited lookup pass with live progress (Apple caps the
// iTunes Search API at ~20 calls/minute, so ~100 sequences take ~6 minutes,
// hence progress + cancel, not a spinner), then a review table proposing the
// FIRST match per sequence. Nothing commits until the owner applies; rows
// default checked only when a match came back. Cancel mid-run keeps what was
// fetched and drops straight into review. Apply hands back [{ key, match }];
// the parent resolves keys against the CURRENT sequences and owns the
// fill-only commit (never overwrite an existing artist/art).
//
// The review header summarizes outcomes as clickable filter chips and the
// columns sort, because at real catalog sizes (100+ sequences) a handful of
// dimmed no-match rows disappear into the scroll. The owner needs to see
// what the run did NOT find before applying.

const STATUS_RANK = { matched: 0, nomatch: 1, failed: 2 };
const rowStatus = (row) => (row.error ? 'failed' : row.match ? 'matched' : 'nomatch');

const BulkMetadataLookupDialog = ({ open, targets, onClose, onApply }) => {
  const [phase, setPhase] = useState('running'); // 'running' | 'review'
  const [progress, setProgress] = useState({ done: 0, current: null });
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [cancelled, setCancelled] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'matched' | 'nomatch' | 'failed'
  const { orderBy, order, requestSort, resetSort } = useTableSort(); // null orderBy = lookup order
  const abortRef = useRef(null);
  // Monotonic run id: a superseded run's promise settling late (StrictMode
  // double-mount, a hung request finally timing out after cancel + reopen)
  // must not clobber the active run's state.
  const runIdRef = useRef(0);

  // Reset once the close transition finishes, so a reopen never paints a
  // frame of the previous run's review table before the open-effect fires.
  const resetForNextRun = () => {
    setPhase('running');
    setProgress({ done: 0, current: null });
    setRows([]);
    setChecked(new Set());
    setCancelled(false);
    setStatusFilter('all');
    resetSort();
  };

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;
    resetForNextRun();

    runBulkLookup(
      targets.map(({ key, query }) => ({ key, query })),
      {
        signal: controller.signal,
        onProgress: ({ done, current }) => {
          if (runIdRef.current === runId) setProgress({ done, current });
        }
      }
    ).then((result) => {
      if (runIdRef.current !== runId) return;
      setRows(result);
      setChecked(new Set(result.filter((r) => r.match && !r.error).map((r) => r.key)));
      setPhase('review');
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matchedRows = useMemo(() => rows.filter((r) => r.match), [rows]);
  const applyCount = useMemo(() => matchedRows.filter((r) => checked.has(r.key)).length, [matchedRows, checked]);
  const estimatedMinutes = estimateBulkLookupMinutes(targets.length);

  const counts = useMemo(() => {
    const next = { all: rows.length, matched: 0, nomatch: 0, failed: 0 };
    rows.forEach((r) => {
      next[rowStatus(r)] += 1;
    });
    return next;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((r) => statusFilter === 'all' || rowStatus(r) === statusFilter);
    if (!orderBy) return filtered; // lookup order
    const dir = order === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (orderBy === 'query') return dir * a.query.localeCompare(b.query);
      // 'match': matched first, then alphabetical by proposed title
      const rank = STATUS_RANK[rowStatus(a)] - STATUS_RANK[rowStatus(b)];
      if (rank !== 0) return dir * rank;
      return dir * (a.match?.title || '').localeCompare(b.match?.title || '');
    });
  }, [rows, statusFilter, orderBy, order]);
  const visibleMatched = useMemo(() => visibleRows.filter((r) => r.match), [visibleRows]);
  const visibleChecked = useMemo(() => visibleMatched.filter((r) => checked.has(r.key)).length, [visibleMatched, checked]);

  const filterChips = [
    { value: 'all', label: 'All' },
    { value: 'matched', label: 'Matched' },
    { value: 'nomatch', label: 'No match' },
    { value: 'failed', label: 'Failed' }
  ].filter((c) => c.value === 'all' || counts[c.value] > 0);

  const toggle = (key) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    onApply(matchedRows.filter((r) => checked.has(r.key)).map((r) => ({ key: r.key, match: r.match })));
    onClose();
  };

  // Backdrop clicks and Escape must never discard a run's work: while
  // running they are ignored outright, and in review they are ignored
  // whenever unapplied matches are on the table (a stray click after a
  // multi-minute pass would silently throw everything away). The explicit
  // Close/Apply buttons call onClose directly, without a reason.
  const handleDialogClose = (event, reason) => {
    if (phase === 'running') return;
    if (reason && matchedRows.length > 0) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} maxWidth="sm" fullWidth TransitionProps={{ onExited: resetForNextRun }}>
      <DialogTitle>Look up missing metadata</DialogTitle>

      {phase === 'running' && (
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Searching iTunes for {targets.length} {targets.length === 1 ? 'sequence' : 'sequences'}… Lookups are paced to respect
            Apple&apos;s rate limit (~{estimatedMinutes} min total). Leave this dialog open until it finishes; closing it or navigating
            away cancels the run.
          </Typography>
          <LinearProgress variant="determinate" value={targets.length ? (progress.done / targets.length) * 100 : 0} sx={{ mb: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {progress.done}/{targets.length}
            {progress.current ? ` (looking up “${progress.current}”)` : ''}
          </Typography>
        </DialogContent>
      )}

      {phase === 'review' && (
        <DialogContent sx={{ pt: 0 }}>
          <Typography variant="body2" sx={{ my: 1.5 }}>
            {cancelled ? `You cancelled early, so this is what was found before stopping. ` : ''}
            Found matches for {counts.matched} of {rows.length} {rows.length === 1 ? 'sequence' : 'sequences'}. Keep the ones that look
            right. Only blank artist and album art fields are filled in, and anything you&apos;ve already entered stays untouched.
          </Typography>
          {rows.length === 0 && (
            <Typography variant="body2" sx={{ py: 2, textAlign: 'center', color: 'text.secondary' }}>
              Nothing was looked up.
            </Typography>
          )}
          {rows.length > 0 && (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                {filterChips.map((chip) => (
                  <Chip
                    key={chip.value}
                    size="small"
                    label={`${chip.label} (${chip.value === 'all' ? counts.all : counts[chip.value]})`}
                    color={chip.value === 'failed' && counts.failed > 0 ? 'error' : chip.value === 'nomatch' ? 'warning' : 'default'}
                    variant={statusFilter === chip.value ? 'filled' : 'outlined'}
                    onClick={() => setStatusFilter(chip.value)}
                  />
                ))}
              </Stack>
              {visibleRows.length === 0 && (
                <Typography variant="body2" sx={{ py: 2, textAlign: 'center', color: 'text.secondary' }}>
                  No sequences in this filter.
                </Typography>
              )}
              {visibleRows.length > 0 && (
                <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            disabled={visibleMatched.length === 0}
                            indeterminate={visibleChecked > 0 && visibleChecked < visibleMatched.length}
                            checked={visibleMatched.length > 0 && visibleChecked === visibleMatched.length}
                            onChange={(e) =>
                              // Scoped to the filtered view: selections outside the
                              // current filter are preserved either way.
                              setChecked((prev) => {
                                const next = new Set(prev);
                                visibleMatched.forEach((r) => (e.target.checked ? next.add(r.key) : next.delete(r.key)));
                                return next;
                              })
                            }
                            inputProps={{ 'aria-label': 'Select all matches' }}
                          />
                        </TableCell>
                        <TableCell sortDirection={orderBy === 'query' ? order : false}>
                          <TableSortLabel
                            active={orderBy === 'query'}
                            direction={orderBy === 'query' ? order : 'asc'}
                            onClick={() => requestSort('query')}
                          >
                            Sequence
                          </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={orderBy === 'match' ? order : false}>
                          <TableSortLabel
                            active={orderBy === 'match'}
                            direction={orderBy === 'match' ? order : 'asc'}
                            onClick={() => requestSort('match')}
                          >
                            Proposed match
                          </TableSortLabel>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleRows.map((row) => (
                        <TableRow key={row.key} hover={Boolean(row.match)} sx={{ opacity: row.match ? 1 : 0.55 }}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              disabled={!row.match}
                              checked={checked.has(row.key)}
                              onChange={() => toggle(row.key)}
                              inputProps={{
                                'aria-label': `Apply match for ${row.query}`
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 180 }}>
                            <Typography variant="body2" noWrap>
                              {row.query}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {row.match ? (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <ArtworkThumb src={row.match.thumbnailUrl} alt={row.match.title} size={36} />
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" noWrap>
                                    {row.match.title}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                                    {row.match.artist}
                                  </Typography>
                                </Box>
                              </Stack>
                            ) : (
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {row.error ? 'Lookup failed' : 'No match found'}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </>
          )}
        </DialogContent>
      )}

      <DialogActions>
        {phase === 'running' && (
          <Button
            onClick={() => {
              setCancelled(true);
              abortRef.current?.abort();
            }}
          >
            Cancel lookup
          </Button>
        )}
        {phase === 'review' && (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="contained" disabled={applyCount === 0} onClick={apply}>
              Apply {applyCount} {applyCount === 1 ? 'match' : 'matches'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

BulkMetadataLookupDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  targets: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      query: PropTypes.string.isRequired
    })
  ).isRequired,
  onClose: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired
};

export default BulkMetadataLookupDialog;
