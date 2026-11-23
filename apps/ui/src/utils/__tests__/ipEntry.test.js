import { describe, it, expect } from 'vitest';

import {
  classifyIpEntry,
  describeRejectedIpEntries,
  describePrivateIpEntries,
  IP_ENTRY_FORMAT_HINT,
  isPrivateIpEntry,
  isValidIpEntry,
  partitionIpEntries,
  stripUnusableIpRules
} from '../ipEntry';

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

  it('rejects a stray single colon next to the compression (#181)', () => {
    // The server's IpMatcher rejects an empty group anywhere but inside the
    // '::' itself. These passed here and were then dropped on save.
    expect(classifyIpEntry(':::')).toBe('invalid');
    expect(classifyIpEntry(':1:2::3')).toBe('invalid');
    expect(classifyIpEntry('1:2::3:')).toBe('invalid');
  });

  it('does not read the zone id as part of the address (#181)', () => {
    // The server strips everything after '%' before parsing, leaving "2001"
    // here, which is not an address.
    expect(classifyIpEntry('2001%eth0::255')).toBe('invalid');
    expect(classifyIpEntry('%eth0::')).toBe('invalid');
    expect(classifyIpEntry('fe80::1%eth0')).toBe('ipv6');
  });

  it('still accepts compression at either end', () => {
    expect(classifyIpEntry('::')).toBe('ipv6');
    expect(classifyIpEntry('2001:db8::')).toBe('ipv6');
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

  it('caps an IPv4-mapped IPv6 block at /32, as the server does (#181)', () => {
    // IpMatcher collapses ::ffff:a.b.c.d to its four IPv4 bytes before
    // checking the prefix, so anything past /32 was dropped on save.
    expect(classifyIpEntry('::ffff:192.168.1.0/120')).toBe('invalid');
    expect(classifyIpEntry('0:0:0:0:0:ffff:c0a8:100/33')).toBe('invalid');
    expect(classifyIpEntry('::ffff:192.168.1.0/24')).toBe('cidr');
    // Not mapped (wrong marker), so the full IPv6 length still applies.
    expect(classifyIpEntry('::fffe:192.168.1.0/120')).toBe('cidr');
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

// #181: the server drops IP-list entries its matcher can't use. These helpers
// let the save path drop the same ones itself and say which, so a rule never
// vanishes without the operator hearing about it.
describe('stripUnusableIpRules', () => {
  it('keeps usable entries in all three lists and collects the rejected ones', () => {
    const { preferences, rejected } = stripUnusableIpRules({
      jukeboxEnabled: true,
      blockedViewerIps: ['10.0.0.1', '192.168.1.*'],
      votingExemptIps: ['my office', '203.0.113.0/24'],
      statsExcludedIps: [' 2001:db8::1 ']
    });
    expect(preferences).toEqual({
      jukeboxEnabled: true,
      blockedViewerIps: ['10.0.0.1'],
      votingExemptIps: ['203.0.113.0/24'],
      statsExcludedIps: ['2001:db8::1']
    });
    expect(rejected).toEqual(['192.168.1.*', 'my office']);
  });

  it('leaves absent and null lists alone so "not supplied" stays distinguishable', () => {
    const { preferences, rejected } = stripUnusableIpRules({ jukeboxEnabled: true, votingExemptIps: null });
    expect(preferences).toEqual({ jukeboxEnabled: true, votingExemptIps: null });
    expect(preferences).not.toHaveProperty('blockedViewerIps');
    expect(rejected).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = { blockedViewerIps: ['bogus', '10.0.0.1'] };
    stripUnusableIpRules(input);
    expect(input.blockedViewerIps).toEqual(['bogus', '10.0.0.1']);
  });

  it('tolerates a missing preferences object', () => {
    expect(stripUnusableIpRules(undefined)).toEqual({ preferences: undefined, rejected: [] });
  });
});

describe('describeRejectedIpEntries', () => {
  it('returns null when nothing was rejected', () => {
    expect(describeRejectedIpEntries([])).toBeNull();
    expect(describeRejectedIpEntries(undefined)).toBeNull();
  });

  it('counts and names the rejected entries', () => {
    expect(describeRejectedIpEntries(['192.168.1.*'])).toMatch(/^1 IP entry was not saved: 192\.168\.1\.\*\./);
    expect(describeRejectedIpEntries(['a', 'b'])).toMatch(/^2 IP entries were not saved: a, b\./);
  });

  it('says what a valid entry looks like', () => {
    expect(describeRejectedIpEntries(['a'])).toMatch(/CIDR block/);
  });
});

// #211: Remote Falcon only ever sees a viewer's public IP, so a home-network
// address in any of the lists can never match. The hint used to suggest one.
describe('IP_ENTRY_FORMAT_HINT', () => {
  it('does not use a private address as its example', () => {
    expect(IP_ENTRY_FORMAT_HINT).not.toMatch(/192\.168|(^|\D)10\.\d|172\.(1[6-9]|2\d|3[01])\./);
    expect(IP_ENTRY_FORMAT_HINT).toMatch(/203\.0\.113\.50/);
  });
});

describe('isPrivateIpEntry', () => {
  it.each([
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.50',
    '127.0.0.1',
    '169.254.10.20',
    '192.168.1.0/24',
    '10.0.0.0/8',
    '192.168.1.10-192.168.1.40',
    '::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'fe80::1',
    'fe80::1%eth0',
    'fd00::/8',
    '::ffff:192.168.1.50'
  ])('flags %s', (entry) => {
    expect(isPrivateIpEntry(entry)).toBe(true);
  });

  it.each([
    '203.0.113.50',
    '8.8.8.8',
    '172.15.255.255',
    '172.32.0.1',
    '11.0.0.1',
    '203.0.113.0/24',
    '203.0.113.10-203.0.113.40',
    '2001:db8::1',
    '2001:db8::/64',
    '::ffff:203.0.113.50',
    'not an ip',
    ''
  ])('does not flag %s', (entry) => {
    expect(isPrivateIpEntry(entry)).toBe(false);
  });

  it('flags a block or range that only partly overlaps a private range', () => {
    expect(isPrivateIpEntry('0.0.0.0/0')).toBe(true);
    expect(isPrivateIpEntry('9.255.255.250-10.0.0.5')).toBe(true);
  });
});

describe('describePrivateIpEntries', () => {
  it('returns null when nothing is private', () => {
    expect(describePrivateIpEntries([])).toBeNull();
    expect(describePrivateIpEntries(['203.0.113.50'])).toBeNull();
  });

  it('names the home-network entries and says they will not match', () => {
    const message = describePrivateIpEntries(['203.0.113.50', '192.168.1.50']);
    expect(message).toMatch(/192\.168\.1\.50 is an address inside a home network/);
    expect(message).toMatch(/public IP/);
    expect(message).not.toMatch(/203\.0\.113\.50/);
  });

  it('uses the plural for several entries', () => {
    expect(describePrivateIpEntries(['10.0.0.1', '192.168.1.50'])).toMatch(/^10\.0\.0\.1 and 192\.168\.1\.50 are addresses inside a home network/);
  });
});
