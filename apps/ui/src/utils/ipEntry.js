// Validation for the operator-entered IP lists (blocked viewers, voting
// exempt, stats excluded).
//
// These fields are freeSolo autocompletes, so before this they accepted any
// string and saved it happily. An operator who typed a CIDR block got no
// error and no effect — the matcher compared whole strings, so the entry
// simply never matched anything (issue #175).
//
// Kept as pure classification rather than a boolean so callers can tell
// "malformed" apart from "well-formed but not a plain address", and report
// each differently.

/** @typedef {'ipv4'|'ipv6'|'cidr'|'range'|'invalid'} IpEntryType */

const isIpv4 = (value) => {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    // Reject leading zeros: "010" is ambiguous (octal in some parsers) and
    // never what an operator means.
    if (part.length > 1 && part[0] === '0') return false;
    return Number(part) <= 255;
  });
};

// Deliberately permissive about IPv6 shorthand (::, embedded IPv4) while
// still rejecting obvious junk. Viewer traffic does arrive over IPv6, and
// the proxy chain can hand us a compressed form.
const isIpv6 = (value) => {
  // Strip the zone id first: everything after '%' is an interface name, and
  // a '::' or ':' in it must not count toward the address (#181).
  const withoutZone = value.split('%')[0];
  if (!withoutZone.includes(':')) return false;
  const compressions = (withoutZone.match(/::/g) || []).length;
  if (compressions > 1) return false;
  const groups = withoutZone.split(':');
  if (groups.length > 8) return false;

  const embeddedV4Index = groups.findIndex((g) => g.includes('.'));
  if (embeddedV4Index !== -1) {
    if (embeddedV4Index !== groups.length - 1) return false;
    if (!isIpv4(groups[embeddedV4Index])) return false;
  }

  // An empty group is only legal as the '::' itself. A stray single colon at
  // either end (":1::2", "1::2:", ":::") passes the per-group check below but
  // the server-side matcher rejects it, so it would vanish on save (#181).
  const [head, tail = ''] = withoutZone.split('::');
  const sideWellFormed = (side) => side === '' || side.split(':').every((group) => group !== '');
  if (!sideWellFormed(head) || !sideWellFormed(tail)) return false;

  const groupsWellFormed = groups.every((group, i) => {
    if (group === '') return true; // from :: compression
    if (i === embeddedV4Index) return true;
    return /^[0-9a-fA-F]{1,4}$/.test(group);
  });
  if (!groupsWellFormed) return false;

  // Without '::' the address has to be complete. Otherwise "2001:db8:1" passes
  // here, saves with no error, and is then dropped by the stricter server-side
  // matcher — exactly the silent-save failure this validation exists to stop.
  // An embedded IPv4 tail occupies two groups, not one.
  if (compressions === 0) {
    const slots = embeddedV4Index === -1 ? groups.length : groups.length + 1;
    return slots === 8;
  }
  return true;
};

// The eight 16-bit words of an address that already passed isIpv6, with '::'
// expanded and an embedded IPv4 tail split into two words.
const toIpv6Words = (value) => {
  const withoutZone = value.split('%')[0];
  const toWords = (side) =>
    side
      ? side.split(':').flatMap((group) => {
          if (!group.includes('.')) return [parseInt(group, 16)];
          const [a, b, c, d] = group.split('.').map(Number);
          return [a * 256 + b, c * 256 + d];
        })
      : [];
  const [head, tail] = withoutZone.split('::');
  const headWords = toWords(head);
  const tailWords = toWords(tail);
  return tail === undefined ? headWords : [...headWords, ...Array(8 - headWords.length - tailWords.length).fill(0), ...tailWords];
};

// Whether an address that already passed isIpv6 is IPv4-mapped
// (::ffff:a.b.c.d, in any spelling). The server-side matcher collapses these
// to their four IPv4 bytes, so a block on one can't be longer than /32.
const isIpv4Mapped = (value) => {
  const words = toIpv6Words(value);
  return words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
};

/**
 * Classify a single entry. Whitespace is the caller's to trim.
 * @returns {IpEntryType}
 */
export const classifyIpEntry = (value) => {
  const entry = String(value ?? '').trim();
  if (!entry) return 'invalid';

  if (entry.includes('/')) {
    const [addr, prefix, ...rest] = entry.split('/');
    if (rest.length) return 'invalid';
    if (!/^\d{1,3}$/.test(prefix)) return 'invalid';
    const bits = Number(prefix);
    if (isIpv4(addr)) return bits <= 32 ? 'cidr' : 'invalid';
    if (isIpv6(addr)) return bits <= (isIpv4Mapped(addr) ? 32 : 128) ? 'cidr' : 'invalid';
    return 'invalid';
  }

  // Ranges are IPv4-only: an IPv6 range is unreadable by hand and nobody has
  // asked for one. The '-' can't collide with IPv6 syntax.
  if (entry.includes('-')) {
    const [start, end, ...rest] = entry.split('-');
    if (rest.length) return 'invalid';
    if (!isIpv4(start.trim()) || !isIpv4(end.trim())) return 'invalid';
    return 'range';
  }

  if (isIpv4(entry)) return 'ipv4';
  if (isIpv6(entry)) return 'ipv6';
  return 'invalid';
};

/** True when the entry is a well-formed single address, block, or range. */
export const isValidIpEntry = (value) => classifyIpEntry(value) !== 'invalid';

/**
 * Split a list of entries into the ones we can use and the ones we can't,
 * preserving order. Entries are trimmed; blanks are dropped silently since
 * they come from stray whitespace rather than operator intent.
 */
export const partitionIpEntries = (entries) => {
  const valid = [];
  const invalid = [];
  (entries ?? []).forEach((raw) => {
    const entry = String(raw ?? '').trim();
    if (!entry) return;
    if (isValidIpEntry(entry)) valid.push(entry);
    else invalid.push(entry);
  });
  return { valid, invalid };
};

// #211: the example used to be 192.168.1.50, a home-network address that can
// never match anything. Every example here is from the documentation range.
export const IP_ENTRY_FORMAT_HINT =
  'Enter a single address (203.0.113.50), a CIDR block (203.0.113.0/24), or a range (203.0.113.10-203.0.113.40).';

/** Shown under an IP list field when there's nothing to warn about (#211). */
export const PUBLIC_IP_HINT =
  'Use your public IP (search "what is my IP" from that network), not a home-network address like 192.168.x.x.';

// #211: Remote Falcon only ever sees a viewer's public IP (read from the
// proxy headers behind Cloudflare). Addresses in these ranges never leave the
// local network, so a rule built on one can never match.
const ipv4ToInt = (value) => value.split('.').reduce((n, part) => n * 256 + Number(part), 0);

const PRIVATE_IPV4_RANGES = [
  ['10.0.0.0', 8], // RFC 1918
  ['172.16.0.0', 12], // RFC 1918
  ['192.168.0.0', 16], // RFC 1918
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16] // link-local
].map(([base, bits]) => {
  const start = ipv4ToInt(base);
  return [start, start + 2 ** (32 - bits) - 1];
});

const ipv6WordsToBigInt = (words) => words.reduce((n, word) => (n << 16n) | BigInt(word), 0n);

const PRIVATE_IPV6_PREFIXES = [
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['::1', 128] // loopback
].map(([base, bits]) => [ipv6WordsToBigInt(toIpv6Words(base)), bits]);

const overlapsPrivateIpv4 = (low, high) => PRIVATE_IPV4_RANGES.some(([start, end]) => low <= end && high >= start);

const ipv4Block = (base, bits) => {
  const size = 2 ** (32 - bits);
  const low = Math.floor(base / size) * size;
  return [low, low + size - 1];
};

// Two prefixes overlap when they agree on the bits the shorter one fixes.
const overlapsPrivateIpv6 = (value, bits) =>
  PRIVATE_IPV6_PREFIXES.some(([prefix, prefixBits]) => {
    const shift = BigInt(128 - Math.min(bits, prefixBits));
    return value >> shift === prefix >> shift;
  });

// An IPv4-mapped IPv6 address is matched as its IPv4 bytes, so check those.
const mappedIpv4Int = (words) => words[6] * 65536 + words[7];

/**
 * True when a well-formed entry is, or reaches into, a home-network or
 * otherwise non-public range (RFC 1918, loopback, link-local, IPv6 unique
 * local). Such an entry saves but can never match a viewer (#211).
 */
export const isPrivateIpEntry = (value) => {
  const entry = String(value ?? '').trim();
  const type = classifyIpEntry(entry);
  if (type === 'invalid') return false;
  if (type === 'range') {
    const [start, end] = entry.split('-').map((part) => ipv4ToInt(part.trim()));
    return overlapsPrivateIpv4(Math.min(start, end), Math.max(start, end));
  }
  // A single address is a block of one: /32 for IPv4, /128 for IPv6.
  const [addr, prefix] = entry.split('/');
  const bits = prefix === undefined ? null : Number(prefix);
  if (isIpv4(addr)) return overlapsPrivateIpv4(...ipv4Block(ipv4ToInt(addr), bits ?? 32));
  const words = toIpv6Words(addr);
  if (isIpv4Mapped(addr)) return overlapsPrivateIpv4(...ipv4Block(mappedIpv4Int(words), bits ?? 32));
  return overlapsPrivateIpv6(ipv6WordsToBigInt(words), bits ?? 128);
};

const joinNames = (names) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * Warning for entries that are well-formed but can never match because they
 * are home-network addresses, or null when there are none (#211).
 */
export const describePrivateIpEntries = (entries) => {
  const privateEntries = (entries ?? []).filter(isPrivateIpEntry);
  if (!privateEntries.length) return null;
  const one = privateEntries.length === 1;
  return `${joinNames(privateEntries)} ${one ? 'is an address' : 'are addresses'} inside a home network. Remote Falcon only sees each viewer's public IP, so ${one ? 'it' : 'they'} won't match anyone.`;
};

/** The preference keys holding operator-entered IP lists. */
export const IP_LIST_PREFERENCE_KEYS = ['blockedViewerIps', 'votingExemptIps', 'statsExcludedIps'];

/**
 * Drop the IP-list entries the server would drop on save, and say which (#181).
 *
 * The control-panel mutation keeps only the rules its matcher can evaluate and
 * discards the rest without telling the client. Applying the same rule here
 * means the client sends exactly what will persist and can name what it
 * removed. Absent or null lists are passed through untouched so "not
 * supplied" stays distinct from "emptied". The input is not mutated.
 */
export const stripUnusableIpRules = (preferences) => {
  if (!preferences) return { preferences, rejected: [] };
  const next = { ...preferences };
  const rejected = [];
  IP_LIST_PREFERENCE_KEYS.forEach((key) => {
    if (!Array.isArray(preferences[key])) return;
    const { valid, invalid } = partitionIpEntries(preferences[key]);
    next[key] = valid;
    rejected.push(...invalid);
  });
  return { preferences: next, rejected };
};

const countEntries = (count) => (count === 1 ? '1 IP entry was' : `${count} IP entries were`);

/**
 * Operator-facing message for entries dropped at save time, or null when
 * nothing was dropped.
 */
export const describeRejectedIpEntries = (rejected) => {
  if (!rejected?.length) return null;
  return `${countEntries(rejected.length)} not saved: ${rejected.join(', ')}. ${IP_ENTRY_FORMAT_HINT}`;
};
