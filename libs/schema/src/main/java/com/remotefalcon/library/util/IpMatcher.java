package com.remotefalcon.library.util;

import java.util.Collection;

/**
 * Matches a client IP against an operator-entered rule.
 *
 * <p>Rules come from the three IP lists on {@code Preference}: blocked
 * viewers, voting exempt, and stats excluded. Historically these were
 * compared with {@code Set.contains}, i.e. whole-string equality, so an
 * operator who entered a CIDR block saw it save and do nothing (#175).
 *
 * <p>Supported rule forms:
 * <ul>
 *   <li>a single address, IPv4 or IPv6 ({@code 192.168.1.50}, {@code 2001:db8::1})</li>
 *   <li>a CIDR block of either family ({@code 203.0.113.0/24}, {@code 2001:db8::/32})</li>
 *   <li>an inclusive IPv4 range ({@code 203.0.113.10-203.0.113.40})</li>
 * </ul>
 *
 * <p>This lives in the shared schema lib so the control panel validates
 * exactly the grammar the viewer matches — the drift between those two is
 * what produced the original silent failure.
 *
 * <p>Addresses are parsed to bytes by hand rather than via
 * {@code InetAddress.getByName}, which can attempt name resolution on
 * anything that isn't a literal, and which pulls reflection config into the
 * viewer's GraalVM native image. Everything here is allocation-light and
 * safe to call on the request path.
 */
public final class IpMatcher {

  private IpMatcher() {
  }

  /** True when {@code ip} satisfies any rule in {@code rules}. */
  public static boolean matchesAny(Collection<String> rules, String ip) {
    if (rules == null || rules.isEmpty() || ip == null || ip.isEmpty()) {
      return false;
    }
    byte[] target = parse(ip);
    for (String rule : rules) {
      if (matches(rule, ip, target)) {
        return true;
      }
    }
    return false;
  }

  /** True when the single {@code rule} matches {@code ip}. */
  public static boolean matches(String rule, String ip) {
    return matches(rule, ip, parse(ip));
  }

  private static boolean matches(String rule, String rawIp, byte[] target) {
    if (rule == null) {
      return false;
    }
    String trimmed = rule.trim();
    if (trimmed.isEmpty()) {
      return false;
    }

    // Exact string equality first: it costs nothing, needs no parsing, and
    // covers the overwhelmingly common single-address rule even when the
    // address itself is in a form we decline to parse.
    if (trimmed.equals(rawIp)) {
      return true;
    }
    if (target == null) {
      return false;
    }

    int slash = trimmed.indexOf('/');
    if (slash > 0) {
      return matchesCidr(trimmed, slash, target);
    }
    // Guard the '-' against IPv6, where it never appears, so a malformed
    // rule can't be read as a range.
    int dash = trimmed.indexOf('-');
    if (dash > 0 && trimmed.indexOf(':') < 0) {
      return matchesRange(trimmed, dash, target);
    }

    byte[] single = parse(trimmed);
    return single != null && java.util.Arrays.equals(single, target);
  }

  private static boolean matchesCidr(String rule, int slash, byte[] target) {
    byte[] network = parse(rule.substring(0, slash));
    if (network == null || network.length != target.length) {
      // Different families never match (an IPv4 client vs an IPv6 block).
      return false;
    }
    int prefixBits;
    try {
      prefixBits = Integer.parseInt(rule.substring(slash + 1).trim());
    } catch (NumberFormatException e) {
      return false;
    }
    int maxBits = network.length * 8;
    if (prefixBits < 0 || prefixBits > maxBits) {
      return false;
    }

    int fullBytes = prefixBits / 8;
    for (int i = 0; i < fullBytes; i++) {
      if (network[i] != target[i]) {
        return false;
      }
    }
    int remainingBits = prefixBits % 8;
    if (remainingBits == 0) {
      return true;
    }
    int mask = (0xFF << (8 - remainingBits)) & 0xFF;
    return (network[fullBytes] & mask) == (target[fullBytes] & mask);
  }

  private static boolean matchesRange(String rule, int dash, byte[] target) {
    byte[] start = parse(rule.substring(0, dash).trim());
    byte[] end = parse(rule.substring(dash + 1).trim());
    if (start == null || end == null) {
      return false;
    }
    // Ranges are IPv4-only, and a mixed-family comparison is meaningless.
    if (start.length != 4 || end.length != 4 || target.length != 4) {
      return false;
    }
    // Tolerate a reversed range rather than silently matching nothing: an
    // operator who typed the higher address first still means the span.
    if (compare(start, end) > 0) {
      byte[] swap = start;
      start = end;
      end = swap;
    }
    return compare(target, start) >= 0 && compare(target, end) <= 0;
  }

  private static int compare(byte[] a, byte[] b) {
    for (int i = 0; i < a.length; i++) {
      int diff = (a[i] & 0xFF) - (b[i] & 0xFF);
      if (diff != 0) {
        return diff;
      }
    }
    return 0;
  }

  /**
   * Parse a literal address to its bytes (4 for IPv4, 16 for IPv6), or null
   * when it isn't one. Never performs name resolution.
   */
  public static byte[] parse(String address) {
    if (address == null) {
      return null;
    }
    String value = address.trim();
    if (value.isEmpty()) {
      return null;
    }
    // Strip a zone id ("fe80::1%eth0") and surrounding brackets, both of
    // which reach us from proxy headers.
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.substring(1, value.length() - 1);
    }
    int zone = value.indexOf('%');
    if (zone >= 0) {
      value = value.substring(0, zone);
    }
    if (value.indexOf(':') < 0) {
      return parseIpv4(value);
    }
    byte[] parsed = parseIpv6(value);
    return parsed == null ? null : unmapIpv4(parsed);
  }

  /**
   * Collapse an IPv4-mapped IPv6 address (::ffff:a.b.c.d) to its four IPv4
   * bytes, leaving every other address untouched.
   *
   * <p>A self-hosted stack with no proxy header in front reports client
   * addresses in this form. Without this the family-length guards refuse to
   * match such a client against any IPv4 rule, CIDR or range the operator
   * entered, so the rules would look configured and quietly do nothing.
   */
  private static byte[] unmapIpv4(byte[] address) {
    if (address.length != 16) {
      return address;
    }
    for (int i = 0; i < 10; i++) {
      if (address[i] != 0) {
        return address;
      }
    }
    if ((address[10] & 0xFF) != 0xFF || (address[11] & 0xFF) != 0xFF) {
      return address;
    }
    return new byte[] {address[12], address[13], address[14], address[15]};
  }

  private static byte[] parseIpv4(String value) {
    byte[] out = new byte[4];
    int octet = 0;
    int digits = 0;
    int accumulator = 0;
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (c == '.') {
        if (digits == 0 || octet == 3) {
          return null;
        }
        out[octet++] = (byte) accumulator;
        accumulator = 0;
        digits = 0;
      } else if (c >= '0' && c <= '9') {
        // Reject leading zeros: "010" is ambiguous and never intended.
        if (digits == 1 && accumulator == 0) {
          return null;
        }
        accumulator = accumulator * 10 + (c - '0');
        if (accumulator > 255 || ++digits > 3) {
          return null;
        }
      } else {
        return null;
      }
    }
    if (octet != 3 || digits == 0) {
      return null;
    }
    out[3] = (byte) accumulator;
    return out;
  }

  private static byte[] parseIpv6(String value) {
    int doubleColon = value.indexOf("::");
    if (doubleColon >= 0 && value.indexOf("::", doubleColon + 1) >= 0) {
      return null;
    }

    String head = doubleColon >= 0 ? value.substring(0, doubleColon) : value;
    String tail = doubleColon >= 0 ? value.substring(doubleColon + 2) : "";

    byte[] out = new byte[16];
    int headBytes = readGroups(head, out, 0, true);
    if (headBytes < 0) {
      return null;
    }
    if (doubleColon < 0) {
      // No compression, so it must have filled the address exactly.
      return headBytes == 16 ? out : null;
    }

    byte[] tailBuffer = new byte[16];
    int tailBytes = readGroups(tail, tailBuffer, 0, true);
    if (tailBytes < 0 || headBytes + tailBytes > 16) {
      return null;
    }
    System.arraycopy(tailBuffer, 0, out, 16 - tailBytes, tailBytes);
    return out;
  }

  /**
   * Read colon-separated groups into {@code out}, returning the number of
   * bytes written, or -1 when malformed. A trailing dotted-quad is allowed
   * (the "::ffff:192.168.1.1" form).
   */
  private static int readGroups(String segment, byte[] out, int offset, boolean allowEmbeddedV4) {
    if (segment.isEmpty()) {
      return 0;
    }
    int written = offset;
    int start = 0;
    while (start <= segment.length()) {
      int colon = segment.indexOf(':', start);
      String group = colon < 0 ? segment.substring(start) : segment.substring(start, colon);
      if (group.isEmpty()) {
        return -1;
      }

      if (allowEmbeddedV4 && group.indexOf('.') >= 0) {
        // Only legal as the final group.
        if (colon >= 0) {
          return -1;
        }
        byte[] v4 = parseIpv4(group);
        if (v4 == null || written + 4 > 16) {
          return -1;
        }
        System.arraycopy(v4, 0, out, written, 4);
        written += 4;
        return written - offset;
      }

      if (group.length() > 4) {
        return -1;
      }
      int parsed = 0;
      for (int i = 0; i < group.length(); i++) {
        int digit = Character.digit(group.charAt(i), 16);
        if (digit < 0) {
          return -1;
        }
        parsed = (parsed << 4) | digit;
      }
      if (written + 2 > 16) {
        return -1;
      }
      out[written++] = (byte) (parsed >> 8);
      out[written++] = (byte) parsed;

      if (colon < 0) {
        break;
      }
      start = colon + 1;
    }
    return written - offset;
  }

  /** True when the rule is one this matcher can act on. */
  public static boolean isValidRule(String rule) {
    if (rule == null) {
      return false;
    }
    String trimmed = rule.trim();
    if (trimmed.isEmpty()) {
      return false;
    }

    int slash = trimmed.indexOf('/');
    if (slash > 0) {
      byte[] network = parse(trimmed.substring(0, slash));
      if (network == null) {
        return false;
      }
      try {
        int bits = Integer.parseInt(trimmed.substring(slash + 1).trim());
        return bits >= 0 && bits <= network.length * 8;
      } catch (NumberFormatException e) {
        return false;
      }
    }

    int dash = trimmed.indexOf('-');
    if (dash > 0 && trimmed.indexOf(':') < 0) {
      byte[] start = parse(trimmed.substring(0, dash).trim());
      byte[] end = parse(trimmed.substring(dash + 1).trim());
      return start != null && end != null && start.length == 4 && end.length == 4;
    }

    return parse(trimmed) != null;
  }
}
