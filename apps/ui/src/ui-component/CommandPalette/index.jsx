import { useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  Dialog,
  InputAdornment,
  TextField,
  Typography
} from '@mui/material';
import { IconCornerDownLeft, IconSearch } from '@tabler/icons-react';

import { trackPosthogEvent } from '../../utils/analytics/posthog';

import useCommands from './useCommands';

// Custom event the topbar SearchTrigger and any other "open palette"
// affordance can dispatch — keeps the palette decoupled from where the
// click came from.
export const COMMAND_PALETTE_OPEN_EVENT = 'rf:open-command-palette';

const score = (label, query) => {
  if (!query) return 1;
  const lowerLabel = label.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerLabel === lowerQuery) return 100;
  if (lowerLabel.startsWith(lowerQuery)) return 50;
  const idx = lowerLabel.indexOf(lowerQuery);
  if (idx >= 0) return 10 - idx * 0.1;
  // Fallback: every query char appears in order somewhere in label
  let li = 0;
  for (let qi = 0; qi < lowerQuery.length; qi += 1) {
    li = lowerLabel.indexOf(lowerQuery[qi], li);
    if (li === -1) return 0;
    li += 1;
  }
  return 1;
};

const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const itemRefs = useRef([]);

  const allCommands = useCommands();

  // Global open shortcuts — Cmd/Ctrl+K and the custom event.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    };
  }, []);

  // Reset state on open so the palette feels fresh each time.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // Filter + sort by score; cap to a reasonable list length.
  const filtered = useMemo(() => {
    const scored = allCommands
      .map((cmd) => ({ cmd, s: score(cmd.label, query) }))
      .filter((entry) => entry.s > 0);
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 40).map((entry) => entry.cmd);
  }, [allCommands, query]);

  // Group preserving the filtered order so highest-relevance items still
  // appear first within each group.
  const grouped = useMemo(() => {
    const groups = new Map();
    filtered.forEach((cmd) => {
      if (!groups.has(cmd.group)) groups.set(cmd.group, []);
      groups.get(cmd.group).push(cmd);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  // Flat ordered list to power keyboard navigation across groups.
  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  // Reset selection + reset scroll when results shrink/grow.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the active item scrolled into view as user navigates.
  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const close = () => setOpen(false);

  const runActive = () => {
    const cmd = flat[activeIndex];
    if (!cmd) return;
    trackPosthogEvent('command_palette_used', {
      command_id: cmd.id,
      command_group: cmd.group,
      query_length: query.length
    });
    close();
    // defer so the dialog has a chance to unmount before any nav
    setTimeout(() => cmd.run(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          mt: { xs: 4, md: 12 },
          borderRadius: 2,
          overflow: 'hidden'
        }
      }}
      // Anchor near the top so it visually aligns with the topbar trigger
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
    >
      <TextField
        inputRef={inputRef}
        autoFocus
        fullWidth
        placeholder="Search pages, sequences, actions…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <IconSearch size={18} stroke={1.75} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Esc
              </Typography>
            </InputAdornment>
          ),
          sx: { px: 2, py: 1.25, fontSize: 16 }
        }}
        variant="standard"
        // Hide the standard underline; the dialog provides the chrome
        sx={{
          '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
          borderBottom: (t) => `1px solid ${t.palette.divider}`
        }}
      />
      <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
        {flat.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">No matches.</Typography>
          </Box>
        ) : (
          (() => {
            let runningIdx = -1;
            return grouped.map(([groupName, items]) => (
              <Box key={groupName}>
                <Typography
                  variant="overline"
                  sx={{
                    display: 'block',
                    px: 2,
                    pt: 1.5,
                    pb: 0.5,
                    color: 'text.secondary',
                    letterSpacing: '0.08em'
                  }}
                >
                  {groupName}
                </Typography>
                {items.map((cmd) => {
                  runningIdx += 1;
                  const idx = runningIdx;
                  const active = idx === activeIndex;
                  return (
                    <Box
                      key={cmd.id}
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        setActiveIndex(idx);
                        runActive();
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1,
                        cursor: 'pointer',
                        bgcolor: active
                          ? (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)')
                          : 'transparent'
                      }}
                    >
                      <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}>{cmd.icon}</Box>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }} noWrap>
                          {cmd.label}
                        </Typography>
                        {cmd.hint && (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                            {cmd.hint}
                          </Typography>
                        )}
                      </Box>
                      {active && (
                        <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}>
                          <IconCornerDownLeft size={14} stroke={1.75} />
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ));
          })()
        )}
      </Box>
    </Dialog>
  );
};

export default CommandPalette;
