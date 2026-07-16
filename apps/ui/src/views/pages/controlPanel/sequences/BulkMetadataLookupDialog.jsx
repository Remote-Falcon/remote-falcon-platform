import { useEffect, useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  Button,
  Checkbox,
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
  Typography
} from '@mui/material';
import { IconMusic } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import { BULK_LOOKUP_INTERVAL_MS, runBulkLookup } from '../../../../utils/bulkMetadataLookup';

// Bulk metadata lookup dialog (PRD-remote-falcon-003, bulk flow).
//
// Two phases: a rate-limited lookup pass with live progress (Apple caps the
// iTunes Search API at ~20 calls/minute, so ~100 sequences take ~6 minutes —
// hence progress + cancel, not a spinner), then a review table proposing the
// FIRST match per sequence. Nothing commits until the owner applies; rows
// default checked only when a match came back. Cancel mid-run keeps what was
// fetched and drops straight into review. The parent owns the commit and the
// fill-only semantics (never overwrite an existing artist/art).

const Thumb = ({ src, alt }) => {
  if (!src) {
    return (
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
          color: 'text.disabled',
          flexShrink: 0
        }}
      >
        <IconMusic size={16} stroke={1.5} />
      </Box>
    );
  }
  return <Box component="img" src={src} alt={alt} loading="lazy" sx={{ width: 36, height: 36, borderRadius: 1, objectFit: 'cover' }} />;
};

Thumb.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string
};

const BulkMetadataLookupDialog = ({ open, targets, onClose, onApply }) => {
  const [phase, setPhase] = useState('running'); // 'running' | 'review'
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [currentQuery, setCurrentQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [cancelled, setCancelled] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setRows([]);
    setChecked(new Set());
    setCancelled(false);
    setProgress({ done: 0, total: targets.length });
    setCurrentQuery(targets[0]?.query || '');

    runBulkLookup(
      targets.map(({ key, query }) => ({ key, query })),
      {
        signal: controller.signal,
        onProgress: ({ done, total }) => {
          setProgress({ done, total });
          setCurrentQuery(targets[done]?.query || '');
        }
      }
    ).then((result) => {
      setRows(result);
      setChecked(new Set(result.filter((r) => r.match && !r.error).map((r) => r.key)));
      setPhase('review');
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targetByKey = new Map(targets.map((t) => [t.key, t]));
  const matchedRows = rows.filter((r) => r.match);
  const applyCount = matchedRows.filter((r) => checked.has(r.key)).length;
  const estimatedMinutes = Math.max(1, Math.round((targets.length * BULK_LOOKUP_INTERVAL_MS) / 60000));

  const toggle = (key) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    const picked = matchedRows
      .filter((r) => checked.has(r.key))
      .map((r) => ({ sequence: targetByKey.get(r.key)?.sequence, match: r.match }))
      .filter((r) => r.sequence);
    onApply(picked);
    onClose();
  };

  return (
    <Dialog open={open} onClose={phase === 'running' ? undefined : onClose} maxWidth="sm" fullWidth>
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
            {cancelled ? `Cancelled early — reviewing the ${rows.length} fetched so far. ` : ''}
            First match per sequence. Uncheck anything that looks wrong; only missing fields are filled, existing values are never
            overwritten.
          </Typography>
          {rows.length === 0 && (
            <Typography variant="body2" sx={{ py: 2, textAlign: 'center', color: 'text.secondary' }}>
              Nothing was looked up.
            </Typography>
          )}
          {rows.length > 0 && (
            <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        indeterminate={applyCount > 0 && applyCount < matchedRows.length}
                        checked={matchedRows.length > 0 && applyCount === matchedRows.length}
                        onChange={(e) =>
                          setChecked(e.target.checked ? new Set(matchedRows.map((r) => r.key)) : new Set())
                        }
                        inputProps={{ 'aria-label': 'Select all matches' }}
                      />
                    </TableCell>
                    <TableCell>Sequence</TableCell>
                    <TableCell>Proposed match</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key} hover={Boolean(row.match)} sx={{ opacity: row.match ? 1 : 0.55 }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          disabled={!row.match}
                          checked={checked.has(row.key)}
                          onChange={() => toggle(row.key)}
                          inputProps={{ 'aria-label': `Apply match for ${row.query}` }}
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
                            <Thumb src={row.match.thumbnailUrl} alt={row.match.title} />
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
      query: PropTypes.string.isRequired,
      sequence: PropTypes.object.isRequired
    })
  ).isRequired,
  onClose: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired
};

export default BulkMetadataLookupDialog;
