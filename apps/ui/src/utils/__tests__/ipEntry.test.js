import { describe, it, expect } from 'vitest';

import { classifyIpEntry, isValidIpEntry, partitionIpEntries } from '../ipEntry';

// The reported bug (#175) was silent acceptance: an operator entered a CIDR
// block, the field saved it without complaint, and nothing was ever excluded
// because matching compared whole strings. These pin what the field will and
// won't take, so "it saved" means "it will work".

describe('classifyIpEntry', () => {
  it('accepts plain IPv4', () => {
    expect(classifyIpEntry('192.168.1.50')).toBe('ipv4');
    expect(classifyIpEntry('0.0.0.0')).toBe('ipv4');
    expect(classifyIpEntry('255.255.255.255')).toBe('ipv4');
  });

  it('rejects out-of-range and malformed IPv4', () => {
    expect(classifyIpEntry('256.1.1.1')).toBe('invalid');
    expect(classifyIpEntry('192.168.1')).toBe('invalid');
    expect(classifyIpEntry('192.168.1.1.1')).toBe('invalid');
    expect(classifyIpEntry('192.168.1.a')).toBe('invalid');
  });

  it('rejects leading-zero octets as ambiguous', () => {
    // "010" reads as octal to some parsers; never what an operator means.
    expect(classifyIpEntry('192.168.01.1')).toBe('invalid');
  });

  it('accepts IPv6, including compressed and zone forms', () => {
    expect(classifyIpEntry('2001:db8::1')).toBe('ipv6');
    expect(classifyIpEntry('::1')).toBe('ipv6');
    expect(classifyIpEntry('fe80::1%eth0')).toBe('ipv6');
    expect(classifyIpEntry('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('ipv6');
  });

  it('accepts IPv6 with an embedded IPv4 tail', () => {
    expect(classifyIpEntry('::ffff:192.168.1.1')).toBe('ipv6');
  });

  it('rejects an incomplete uncompressed IPv6 address', () => {
    // Without '::' the address must be complete. These used to pass here,
    // save with no error, and then be dropped by the stricter server-side
    // matcher — the silent-save failure this validation exists to stop.
    expect(classifyIpEntry('2001:db8:1')).toBe('invalid');
    expect(classifyIpEntry('2001:db8:85a3:0:0:8a2e:370')).toBe('invalid');
  });

  it('still accepts a complete uncompressed IPv6 address', () => {
    expect(classifyIpEntry('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('ipv6');
  });

  it('rejects malformed IPv6', () => {
    expect(classifyIpEntry('2001:db8::1::2')).toBe('invalid'); // two '::'
    expect(classifyIpEntry('2001:db8:zzzz::1')).toBe('invalid');
    expect(classifyIpEntry('1:2:3:4:5:6:7:8:9')).toBe('invalid');
  });

  it('accepts CIDR blocks for both families', () => {
    // The operator's actual ask: a whole office block.
    expect(classifyIpEntry('203.0.113.0/24')).toBe('cidr');
    expect(classifyIpEntry('10.0.0.0/8')).toBe('cidr');
    expect(classifyIpEntry('192.168.1.1/32')).toBe('cidr');
    expect(classifyIpEntry('2001:db8::/32')).toBe('cidr');
  });

  it('rejects CIDR with an impossible prefix length', () => {
    expect(classifyIpEntry('192.168.1.0/33')).toBe('invalid');
    expect(classifyIpEntry('2001:db8::/129')).toBe('invalid');
    expect(classifyIpEntry('192.168.1.0/abc')).toBe('invalid');
    expect(classifyIpEntry('192.168.1.0/24/8')).toBe('invalid');
  });

  it('accepts IPv4 ranges', () => {
    expect(classifyIpEntry('203.0.113.10-203.0.113.40')).toBe('range');
  });

  it('rejects malformed ranges', () => {
    expect(classifyIpEntry('203.0.113.10-')).toBe('invalid');
    expect(classifyIpEntry('203.0.113.10-999.0.0.1')).toBe('invalid');
    expect(classifyIpEntry('1.1.1.1-2.2.2.2-3.3.3.3')).toBe('invalid');
  });

  it('rejects the things that used to save silently', () => {
    expect(classifyIpEntry('my office')).toBe('invalid');
    expect(classifyIpEntry('192.168.1.*')).toBe('invalid');
    expect(classifyIpEntry('')).toBe('invalid');
    expect(classifyIpEntry(null)).toBe('invalid');
    expect(classifyIpEntry(undefined)).toBe('invalid');
  });

  it('tolerates surrounding whitespace', () => {
    expect(classifyIpEntry('  192.168.1.50  ')).toBe('ipv4');
  });
});

describe('isValidIpEntry', () => {
  it('is true for every well-formed shape', () => {
    ['192.168.1.50', '2001:db8::1', '203.0.113.0/24', '203.0.113.10-203.0.113.40'].forEach((entry) => {
      expect(isValidIpEntry(entry)).toBe(true);
    });
  });

  it('is false for junk', () => {
    expect(isValidIpEntry('not an ip')).toBe(false);
  });
});

describe('partitionIpEntries', () => {
  it('separates usable entries from junk, preserving order', () => {
    const { valid, invalid } = partitionIpEntries(['192.168.1.1', 'nope', '10.0.0.0/8', '256.256.256.256']);
    expect(valid).toEqual(['192.168.1.1', '10.0.0.0/8']);
    expect(invalid).toEqual(['nope', '256.256.256.256']);
  });

  it('trims entries and drops blanks without reporting them', () => {
    // Blanks come from stray whitespace, not operator intent — flagging them
    // would be noise.
    const { valid, invalid } = partitionIpEntries([' 192.168.1.1 ', '', '   ']);
    expect(valid).toEqual(['192.168.1.1']);
    expect(invalid).toEqual([]);
  });

  it('handles null/undefined input', () => {
    expect(partitionIpEntries(null)).toEqual({ valid: [], invalid: [] });
    expect(partitionIpEntries(undefined)).toEqual({ valid: [], invalid: [] });
  });
});
