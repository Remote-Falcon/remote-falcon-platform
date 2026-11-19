import { useState } from 'react';

import { useLazyQuery } from '@apollo/client';
import { Button, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

import { CURRENT_NETWORK_IP } from '../utils/graphql/controlPanel/queries';

const FAMILY_LABEL = { IPV4: 'IPv4', IPV6: 'IPv6' };

const READ_FAILED = "Couldn't read this network's address. Search \"what is my IP\" and add it by hand.";

// #211: adds the rule for the network the owner is on right now, as Remote
// Falcon sees it: the public IPv4 address, or the IPv6 /64 so every device on
// the network is covered. Each request reaches us over one family only, so an
// IPv6 result says how to cover a device that falls back to IPv4.
const ExcludeThisNetworkButton = ({ value, onChange }) => {
  // Options on the hook, not the execute call: Apollo 3.14 drops execute-level
  // options. network-only so a phone on another network never reuses a cached
  // answer.
  const [fetchNetworkIp, { loading }] = useLazyQuery(CURRENT_NETWORK_IP, { fetchPolicy: 'network-only' });
  const [status, setStatus] = useState(null);

  const handleClick = async () => {
    setStatus(null);
    let network;
    try {
      const result = await fetchNetworkIp();
      network = result?.data?.currentNetworkIp;
    } catch {
      network = null;
    }
    const rule = network?.suggestedRule;
    if (!rule) {
      setStatus({ color: 'error', message: READ_FAILED });
      return;
    }
    const current = value ?? [];
    if (current.includes(rule)) {
      setStatus({ color: 'text.secondary', message: `${rule} (this network) is already in the list.` });
      return;
    }
    onChange([...current, rule]);
    const family = FAMILY_LABEL[network.family] ?? network.family;
    const fallback =
      network.family === 'IPV6' ? ' If a phone on this network connects over IPv4, press this again from that phone to add that address too.' : '';
    setStatus({ color: 'success.dark', message: `Added ${rule} (this network, ${family}).${fallback}` });
  };

  return (
    <Stack spacing={0.5} alignItems="flex-start">
      <Button variant="outlined" size="small" onClick={handleClick} disabled={loading}>
        Exclude this network
      </Button>
      {status && (
        <Typography variant="caption" color={status.color} role="status">
          {status.message}
        </Typography>
      )}
    </Stack>
  );
};

ExcludeThisNetworkButton.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired
};

export default ExcludeThisNetworkButton;
