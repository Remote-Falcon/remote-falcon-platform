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
    const { valid, invalid } = partitionIpEntries(next);
    setRejected(invalid);
    // Drop the unusable ones rather than saving them: a chip that is visibly
    // present but silently inert is what caused the original confusion.
    onChange(valid);
  };

  const hasRejected = rejected.length > 0;

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
          error={hasRejected}
          helperText={hasRejected ? `Not added: ${rejected.join(', ')}. ${IP_ENTRY_FORMAT_HINT}` : ' '}
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
