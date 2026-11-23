import { MockedProvider } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { CURRENT_NETWORK_IP } from '../../utils/graphql/controlPanel/queries';
import ExcludeThisNetworkButton from '../ExcludeThisNetworkButton';

// #211: owners exclude the wrong address (a 192.168.x.x one, or a single
// IPv6 address that rotates). The button adds what Remote Falcon actually
// sees for their network.

const networkMock = (currentNetworkIp) => ({
  request: { query: CURRENT_NETWORK_IP },
  result: { data: { currentNetworkIp: { __typename: 'NetworkIp', ...currentNetworkIp } } }
});

const renderButton = (mocks, value = []) => {
  const onChange = vi.fn();
  render(
    <MockedProvider mocks={mocks}>
      <ExcludeThisNetworkButton value={value} onChange={onChange} />
    </MockedProvider>
  );
  return onChange;
};

const press = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /exclude this network/i }));
};

describe('ExcludeThisNetworkButton', () => {
  it('adds the IPv4 address and says what it added', async () => {
    const onChange = renderButton([networkMock({ ip: '203.0.113.50', family: 'IPV4', suggestedRule: '203.0.113.50' })], ['198.51.100.7']);
    await press();
    expect(await screen.findByText(/Added 203\.0\.113\.50 \(this network, IPv4\)/)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(['198.51.100.7', '203.0.113.50']);
  });

  it('adds the IPv6 /64 and explains the IPv4 fallback', async () => {
    const onChange = renderButton([
      networkMock({ ip: '2001:db8:1:2::9', family: 'IPV6', suggestedRule: '2001:db8:1:2::/64' })
    ]);
    await press();
    expect(await screen.findByText(/Added 2001:db8:1:2::\/64 \(this network, IPv6\)/)).toBeInTheDocument();
    expect(screen.getByText(/connects over IPv4/)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(['2001:db8:1:2::/64']);
  });

  it('does not add a duplicate', async () => {
    const onChange = renderButton([networkMock({ ip: '203.0.113.50', family: 'IPV4', suggestedRule: '203.0.113.50' })], ['203.0.113.50']);
    await press();
    expect(await screen.findByText(/203\.0\.113\.50 \(this network\) is already in the list/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when the address cannot be read', async () => {
    const onChange = renderButton([networkMock({ ip: null, family: null, suggestedRule: null })]);
    await press();
    expect(await screen.findByText(/Couldn't read this network's address/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when the request fails', async () => {
    const onChange = renderButton([{ request: { query: CURRENT_NETWORK_IP }, error: new Error('network down') }]);
    await press();
    expect(await screen.findByText(/Couldn't read this network's address/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
