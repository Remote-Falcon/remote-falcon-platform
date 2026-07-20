import { useEffect, useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  Popover,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { IconSearch } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { lookupITunes } from '../../../../utils/musicMetadata';
import ArtworkThumb from './ArtworkThumb';

// Metadata-lookup popover for the Sequences list (PRD-remote-falcon-003).
//
// Opens anchored to a row's lookup icon, pre-searches iTunes with the
// sequence's display name, and lets the owner pick a match. Selecting a
// result hands { artist, artworkUrl } back via onSelect — the parent owns
// the commit (same coalesced-save path as a manual cell edit), so this
// component stays persistence-agnostic like EditableCell.
//
// The search term is editable before/after the auto-search because raw
// sequence names are often cryptic ("XMAS_01.fseq") and return nothing.

const SequenceMetadataLookup = ({ anchorEl, defaultQuery, onClose, onSelect }) => {
  const open = Boolean(anchorEl);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = not searched yet
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Guards against a slow response landing after the user re-searched or
  // closed the popover.
  const searchIdRef = useRef(0);

  const runSearch = async (term) => {
    const searchId = ++searchIdRef.current;
    setLoading(true);
    setError(null);
    setSelectedIndex(-1);
    try {
      const found = await lookupITunes(term);
      if (searchIdRef.current !== searchId) return;
      setResults(found);
      setSelectedIndex(found.length > 0 ? 0 : -1);
    } catch {
      if (searchIdRef.current !== searchId) return;
      setError('Lookup failed. Check your connection and try again.');
      setResults(null);
    } finally {
      if (searchIdRef.current === searchId) setLoading(false);
    }
  };

  // Reset + auto-search each time the popover opens for a (new) row.
  // `loading` must reset too: closing mid-search invalidates the searchId,
  // which also skips the in-flight search's finally-reset, so a stale true
  // would otherwise stick to the next open.
  useEffect(() => {
    if (!open) return;
    const term = (defaultQuery || '').trim();
    setQuery(term);
    setResults(null);
    setError(null);
    setSelectedIndex(-1);
    setLoading(false);
    if (term) runSearch(term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultQuery]);

  const close = () => {
    searchIdRef.current += 1; // invalidate any in-flight search
    onClose();
  };

  // Single commit path for both "Use selected" and double-click, so the
  // analytics payload and the select-then-close sequence can never diverge.
  const pick = (index) => {
    const picked = results?.[index];
    if (!picked) return;
    trackPosthogEvent('sequence_metadata_lookup_used', {
      result_index: index,
      result_count: results.length,
      query_length: query.trim().length
    });
    onSelect(picked);
    close();
  };

  const useSelected = () => pick(selectedIndex);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 380, p: 2 } } }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Lookup artist &amp; album art
      </Typography>

      <TextField
        size="small"
        fullWidth
        autoFocus
        placeholder="Song title"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // Mirror the search button's guard: no blank searches (they
            // would render a misleading "No matches" for a search that
            // never ran) and no overlapping searches.
            if (query.trim() && !loading) runSearch(query);
          }
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label="Search"
                disabled={!query.trim() || loading}
                onClick={() => runSearch(query)}
              >
                <IconSearch size={16} stroke={1.75} />
              </IconButton>
            </InputAdornment>
          )
        }}
      />

      <Box sx={{ minHeight: 120, mt: 1 }}>
        {loading && (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 4 }}>
            <CircularProgress size={22} />
          </Stack>
        )}

        {!loading && error && (
          <Typography variant="body2" color="error" sx={{ py: 2, textAlign: 'center' }}>
            {error}
          </Typography>
        )}

        {!loading && !error && results?.length === 0 && (
          <Typography variant="body2" sx={{ py: 2, textAlign: 'center', color: 'text.secondary' }}>
            No matches. Try a different search term.
          </Typography>
        )}

        {!loading && !error && results?.length > 0 && (
          <List dense disablePadding>
            {results.map((result, index) => (
              <ListItemButton
                key={`${result.title}-${result.artist}-${index}`}
                selected={index === selectedIndex}
                onClick={() => setSelectedIndex(index)}
                onDoubleClick={() => {
                  // Double-click = pick this one; the state update above
                  // hasn't flushed yet, so commit via the row's own index.
                  setSelectedIndex(index);
                  pick(index);
                }}
                sx={{ borderRadius: 1, gap: 1.25, alignItems: 'flex-start', py: 0.75 }}
              >
                <ArtworkThumb src={result.thumbnailUrl} alt={result.title} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                    {result.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
                    {result.artist}
                    {result.album ? ` · ${result.album}` : ''}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
        <Button size="small" onClick={close}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={selectedIndex < 0 || !results?.length}
          onClick={useSelected}
        >
          Use selected
        </Button>
      </Stack>
    </Popover>
  );
};

SequenceMetadataLookup.propTypes = {
  anchorEl: PropTypes.object,
  defaultQuery: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired
};

export default SequenceMetadataLookup;
