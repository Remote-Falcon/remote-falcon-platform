import { useEffect, useRef, useState } from 'react';
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

import { estimateBulkLookupMinutes, runBulkLookup } from '../../../../utils/bulkMetadataLookup';
import ArtworkThumb from './ArtworkThumb';

// Bulk metadata lookup dialog (PRD-remote-falcon-003, bulk flow).
//
// Two phases: a rate-limited lookup pass with live progress (Apple caps the
// iTunes Search API at ~20 calls/minute, so ~100 sequences take ~6 minutes —
// hence progress + cancel, not a spinner), then a review table proposing the
// FIRST match per sequence. Nothing commits until the owner applies; rows
// default checked only when a match came back. Cancel mid-run keeps what was
// fetched and drops straight into review. Apply hands back [{ key, match }]
// — the parent resolves keys against the CURRENT sequences and owns the
// fill-only commit (never overwrite an existing artist/art), so edits made
// while the lookup ran are respected.
//
// The review header summarizes outcomes as clickable filter chips and the
// columns sort, because at real catalog sizes (100+ sequences) a handful of
// dimmed no-match rows disappear into the scroll — the owner needs to see
// what the run did NOT find before applying.

const STATUS_RANK = { matched: 0, nomatch: 1, failed: 2 };
const rowStatus = (row) => (row.error ? 'failed' : row.match ? 'matched' : 'nomatch');

const BulkMetadataLookupDialog = ({ open, targets, onClose, onApply }) => {
  const [phase, setPhase] = useState('running'); // 'running' | 'review'
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [cancelled, setCancelled] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'matched' | 'nomatch' | 'failed'
  const [orderBy, setOrderBy] = useState(null); // null (lookup order) | 'query' | 'match'
  const [order, setOrder] = useState('asc');
  const abortRef = useRef(null);

  // Reset once the close transition finishes, so a reopen never paints a
  // frame of the previous run's review table before the open-effect fires.
  const resetForNextRun = () => {
    setPhase('running');
    setProgress({ done: 0, total: 0 });
    setRows([]);
    setChecked(new Set());
    setCancelled(false);
    setStatusFilter('all');
    setOrderBy(null);
    setOrder('asc');
  };

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    abortRef.current = controller;
    resetForNextRun();
    setProgress({ done: 0, total: targets.length });

    runBulkLookup(
      targets.map(({ key, query }) => ({ key, query })),
      {
        signal: controller.signal,
        onProgress: ({ done, total }) => setProgress({ done, total })
      }
    ).then((result) => {
      setRows(result);
      setChecked(new Set(result.filter((r) => r.match && !r.error).map((r) => r.key)));
      setPhase('review');
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currentQuery = phase === 'running' ? targets[progress.done]?.query || '' : '';
  const matchedRows = rows.filter((r) => r.match);
  const applyCount = matchedRows.filter((r) => checked.has(r.key)).length;
  const estimatedMinutes = estimateBulkLookupMinutes(targets.length);

  const counts = { all: rows.length, matched: 0, nomatch: 0, failed: 0 };
  rows.forEach((r) => {
    counts[rowStatus(r)] += 1;
  });

  const visibleRows = rows
    .filter((r) => statusFilter === 'all' || rowStatus(r) === statusFilter)
    .sort((a, b) => {
      if (!orderBy) return 0; // lookup order
      const dir = order === 'asc' ? 1 : -1;
      if (orderBy === 'query') return dir * a.query.localeCompare(b.query);
      // 'match': matched first, then alphabetical by proposed title
      const rank = STATUS_RANK[rowStatus(a)] - STATUS_RANK[rowStatus(b)];
      if (rank !== 0) return dir * rank;
      return dir * (a.match?.title || '').localeCompare(b.match?.title || '');
    });
  const visibleMatched = visibleRows.filter((r) => r.match);
  const visibleChecked = visibleMatched.filter((r) => checked.has(r.key)).length;

  const handleSort = (column) => {
    if (orderBy === column) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(column);
      setOrder('asc');
    }
  };

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

  return (
    <Dialog
      open={open}
      onClose={phase === 'running' ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onExited: resetForNextRun }}
    >
      <DialogTitle>Look up missing metadata</DialogTitle>

      {phase === 'running' && (
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Searching iTunes for {progress.total} {progress.total === 1 ? 'sequence' : 'sequences'}… Lookups are paced to respect
            Apple&apos;s rate limit (~{estimatedMinutes} min total). You can keep working — just leave this open.
          </Typography>
          <LinearProgress variant="determinate" value={progress.total ? (progress.done / progress.total) * 100 : 0} sx={{ mb: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {progress.done}/{progress.total}
            {currentQuery ? ` — looking up “${currentQuery}”` : ''}
          </Typography>
        </DialogContent>
      )}

      {phase === 'review' && (
        <DialogContent sx={{ pt: 0 }}>
          <Typography variant="body2" sx={{ my: 1.5 }}>
            {cancelled ? `You cancelled early — here's what was found before stopping. ` : ''}
            Found matches for {counts.matched} of {rows.length} {rows.length === 1 ? 'sequence' : 'sequences'}. Keep the ones that look
            right — only blank artist and album art fields are filled in, and anything you&apos;ve already entered stays untouched.
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
                            onClick={() => handleSort('query')}
                          >
                            Sequence
                          </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={orderBy === 'match' ? order : false}>
                          <TableSortLabel
                            active={orderBy === 'match'}
                            direction={orderBy === 'match' ? order : 'asc'}
                            onClick={() => handleSort('match')}
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
