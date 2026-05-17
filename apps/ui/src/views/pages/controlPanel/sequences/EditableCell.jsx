import { useEffect, useRef, useState } from 'react';
import * as React from 'react';

import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import PropTypes from 'prop-types';

// Inline-editable cell for the Sequences list.
//
// Renders the value as plain text by default; click (or focus via Tab)
// turns the cell into a TextField (or Autocomplete for select-like
// fields). On blur:
//   • if the value changed, calls onCommit(newValue)
//   • if not, silently exits edit mode without firing onCommit
// Escape cancels and reverts to the original value.
//
// onCommit is responsible for queuing the save (typically via
// useCoalescedSave's enqueue) — this component is intentionally agnostic
// to the persistence layer.
//
// Variants:
//   text   — single-line TextField
//   select — Autocomplete (controlled via `options` + `freeSolo`)

const EditableCell = ({
  value,
  onCommit,
  variant = 'text',
  options,
  freeSolo = false,
  placeholder,
  disabled = false,
  multiline = false,
  inputType = 'text',
  emptyLabel = '—'
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  // Keep the local draft in sync when the upstream value changes
  // (e.g., after a successful save the parent may pass a new prop).
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Auto-focus the input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // Select all text so typing replaces the whole value
      try {
        inputRef.current.select();
      } catch {
        /* Autocomplete inputs may not support .select() */
      }
    }
  }, [editing]);

  const enter = (e) => {
    if (disabled) return;
    e.stopPropagation();
    setDraft(value ?? '');
    setEditing(true);
  };

  const commitAndExit = (next) => {
    setEditing(false);
    if (next !== (value ?? '') && next !== value) {
      onCommit(next);
    }
  };

  const cancelAndExit = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  if (!editing) {
    return (
      <Box
        onClick={enter}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.key === ' ') e.preventDefault();
            enter(e);
          }
        }}
        sx={{
          cursor: disabled ? 'default' : 'text',
          px: 0.75,
          py: 0.5,
          mx: -0.75,
          my: -0.5,
          borderRadius: 1,
          minHeight: 28,
          display: 'flex',
          alignItems: 'center',
          transition: 'background-color 100ms ease',
          '&:hover': disabled
            ? {}
            : {
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
              }
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: value ? 'text.primary' : 'text.disabled',
            fontStyle: value ? 'normal' : 'italic'
          }}
          noWrap
        >
          {value || emptyLabel}
        </Typography>
      </Box>
    );
  }

  if (variant === 'select') {
    const selected = (options || []).find((o) => o.value === value) || (freeSolo ? { value, label: value } : null);
    return (
      <Autocomplete
        size="small"
        options={options || []}
        value={selected}
        freeSolo={freeSolo}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o?.label || '')}
        isOptionEqualToValue={(o, v) => o?.value === v?.value}
        onChange={(_e, picked) => {
          const next = picked && typeof picked === 'object' ? picked.value : picked || '';
          commitAndExit(next);
        }}
        onBlur={() => commitAndExit(draft)}
        renderInput={(params) => (
          <TextField
            {...params}
            inputRef={inputRef}
            placeholder={placeholder}
            variant="standard"
            sx={{ minWidth: 120 }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                cancelAndExit();
              }
            }}
          />
        )}
      />
    );
  }

  return (
    <TextField
      inputRef={inputRef}
      value={draft}
      type={inputType}
      placeholder={placeholder}
      variant="standard"
      multiline={multiline}
      fullWidth
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commitAndExit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          cancelAndExit();
        }
      }}
    />
  );
};

EditableCell.propTypes = {
  value: PropTypes.any,
  onCommit: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['text', 'select']),
  options: PropTypes.array,
  freeSolo: PropTypes.bool,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  multiline: PropTypes.bool,
  inputType: PropTypes.string,
  emptyLabel: PropTypes.string
};

export default EditableCell;
