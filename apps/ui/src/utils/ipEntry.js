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
  if (!value.includes(':')) return false;
  const compressions = (value.match(/::/g) || []).length;
  if (compressions > 1) return false;
  const withoutZone = value.split('%')[0];
  const groups = withoutZone.split(':');
  if (groups.length > 8) return false;

  const embeddedV4Index = groups.findIndex((g) => g.includes('.'));
  if (embeddedV4Index !== -1) {
    if (embeddedV4Index !== groups.length - 1) return false;
    if (!isIpv4(groups[embeddedV4Index])) return false;
  }

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
    if (isIpv6(addr)) return bits <= 128 ? 'cidr' : 'invalid';
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

export const IP_ENTRY_FORMAT_HINT =
  'Enter a single address (192.168.1.50), a CIDR block (203.0.113.0/24), or a range (203.0.113.10-203.0.113.40).';
