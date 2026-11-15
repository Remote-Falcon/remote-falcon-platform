import { useState } from 'react';

import { Autocomplete, TextField } from '@mui/material';
import PropTypes from 'prop-types';

import { IP_ENTRY_FORMAT_HINT, partitionIpEntries } from '../utils/ipEntry';

// Shared entry field for the operator's IP lists (blocked viewers, voting
// exempt, stats excluded).
//
// These were bare freeSolo autocompletes, which accept any string. An
// operator who entered a CIDR block or a typo got a chip, a successful save,
// and no effect whatsoever — the entry just never matched (#175). Rejecting
// unusable entries at the point of entry is the actual fix for that report:
// whatever ends up saved here is something the matcher can act on.
const IpListField = ({ value, onChange, label }) => {
  const [rejected, setRejected] = useState([]);

  const handleChange = (_event, next) => {
    // Entries already in the list are not what the operator just typed, so
    // they aren't "not added". Keep them, still flagged below, so the warning
    // stays visible until the operator removes them or the save reports them.
    const stored = new Set(value);
    const { valid, invalid } = partitionIpEntries(next.filter((entry) => !stored.has(entry)));
    setRejected(invalid);
    // Drop newly typed unusable ones rather than adding them: a chip that is
    // visibly present but silently inert is what caused the original confusion.
    onChange([...next.filter((entry) => stored.has(entry)), ...valid]);
  };

  // #181: entries already in the list (saved before entry-time validation
  // existed, or posted straight to the API) never pass through handleChange.
  // The server drops them on the next save, so flag them now rather than let
  // the list quietly shrink.
  const unsavable = partitionIpEntries(value).invalid;

  let message = null;
  if (rejected.length > 0) {
    message = `Not added: ${rejected.join(', ')}. ${IP_ENTRY_FORMAT_HINT}`;
  } else if (unsavable.length > 0) {
    const count = unsavable.length === 1 ? '1 IP entry' : `${unsavable.length} IP entries`;
    message = `${count} will not be saved: ${unsavable.join(', ')}. ${IP_ENTRY_FORMAT_HINT}`;
  }
  const hasRejected = rejected.length > 0;
  const hasError = message !== null;

  return (
    <Autocomplete
      freeSolo
      multiple
      disableCloseOnSelect
      filterSelectedOptions
      options={[]}
      value={value}
      onChange={handleChange}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={hasError}
          // The message replaces itself under existing focus, so without a live
          // role a screen reader never hears why the entry vanished.
          FormHelperTextProps={hasError ? { role: 'alert' } : undefined}
          helperText={message ?? ' '}
          // Clear a stale rejection as soon as the operator edits again —
          // otherwise the red error outlives the mistake, surviving blur, a
          // successful add in the next field, and a save.
          onChange={(e) => {
            if (hasRejected) setRejected([]);
            params.inputProps?.onChange?.(e);
          }}
        />
      )}
    />
  );
};

IpListField.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string
};

export default IpListField;
