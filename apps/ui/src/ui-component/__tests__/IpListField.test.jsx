import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import IpListField from '../IpListField';

// #175: these fields used to accept anything. The operator entered a CIDR
// block, saw a chip, saved successfully, and nothing was excluded. The field
// must now refuse what the matcher can't act on, and say why.

const type = async (user, text) => {
  const input = screen.getByRole('combobox');
  await user.click(input);
  await user.type(input, `${text}{enter}`);
};

describe('IpListField', () => {
  it('accepts a plain address and reports it to the parent', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IpListField value={[]} onChange={onChange} />);

    await type(user, '192.168.1.50');
    expect(onChange).toHaveBeenCalledWith(['192.168.1.50']);
  });

  it('accepts a CIDR block — the case from the report', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IpListField value={[]} onChange={onChange} />);

    await type(user, '203.0.113.0/24');
    expect(onChange).toHaveBeenCalledWith(['203.0.113.0/24']);
  });

  it('accepts a range', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IpListField value={[]} onChange={onChange} />);

    await type(user, '203.0.113.10-203.0.113.40');
    expect(onChange).toHaveBeenCalledWith(['203.0.113.10-203.0.113.40']);
  });

  it('refuses junk instead of silently saving it, and explains why', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IpListField value={[]} onChange={onChange} />);

    await type(user, 'my office');

    // Nothing usable was produced, so the parent gets an empty list rather
    // than an inert entry.
    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.getByText(/Not added: my office/i)).toBeInTheDocument();
    expect(screen.getByText(/CIDR block/i)).toBeInTheDocument();
  });

  it('keeps already-valid entries when a new one is rejected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IpListField value={['10.0.0.1']} onChange={onChange} />);

    await type(user, '999.999.999.999');
    expect(onChange).toHaveBeenCalledWith(['10.0.0.1']);
  });

  // #181: an entry stored before entry-time validation existed (or posted
  // straight to the API) arrives as a value, not through typing. The server
  // drops it on the next save, so say so up front instead of letting the list
  // quietly shrink.
  it('flags stored entries that will not be saved', () => {
    render(<IpListField value={['10.0.0.1', '192.168.1.*']} onChange={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/1 IP entry will not be saved: 192\.168\.1\.\*/);
    expect(alert).toHaveTextContent(/CIDR block/);
  });

  it('keeps a stored unusable entry flagged when a new one is added', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IpListField value={['192.168.1.*']} onChange={onChange} />);

    await type(user, '10.0.0.1');
    // Not reported as "Not added": the operator didn't just type it. It stays
    // in the list so the save can report it, rather than vanishing here.
    expect(onChange).toHaveBeenCalledWith(['192.168.1.*', '10.0.0.1']);
    expect(screen.queryByText(/Not added/i)).not.toBeInTheDocument();
  });

  it('shows no error for a clean field', () => {
    render(<IpListField value={['10.0.0.1']} onChange={vi.fn()} />);
    expect(screen.queryByText(/Not added/i)).not.toBeInTheDocument();
  });
});
