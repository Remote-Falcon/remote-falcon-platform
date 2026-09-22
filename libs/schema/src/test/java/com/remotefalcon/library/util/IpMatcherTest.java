package com.remotefalcon.library.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * These rules gate blocking and stats exclusion, so the boundaries matter in
 * both directions: a rule that matches too much silently blocks innocent
 * viewers, and one that matches too little reproduces #175.
 */
class IpMatcherTest {

  @Nested
  @DisplayName("single address")
  class SingleAddress {

    @Test
    void matchesItself() {
      assertTrue(IpMatcher.matches("192.168.1.50", "192.168.1.50"));
      assertTrue(IpMatcher.matches("2001:db8::1", "2001:db8::1"));
    }

    @Test
    void doesNotMatchAnythingElse() {
      assertFalse(IpMatcher.matches("192.168.1.50", "192.168.1.51"));
    }

    @Test
    void matchesAcrossEquivalentIpv6Spellings() {
      // The proxy chain may hand us either form; they are the same address.
      assertTrue(IpMatcher.matches("2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"));
    }

    @Test
    void ignoresZoneIdAndBracketsFromProxyHeaders() {
      assertTrue(IpMatcher.matches("fe80::1", "fe80::1%eth0"));
      assertTrue(IpMatcher.matches("2001:db8::1", "[2001:db8::1]"));
    }
  }

  @Nested
  @DisplayName("CIDR")
  class Cidr {

    @Test
    void matchesAddressesInsideTheBlock() {
      assertTrue(IpMatcher.matches("203.0.113.0/24", "203.0.113.1"));
      assertTrue(IpMatcher.matches("203.0.113.0/24", "203.0.113.255"));
    }

    @Test
    void doesNotMatchAddressesOutsideTheBlock() {
      assertFalse(IpMatcher.matches("203.0.113.0/24", "203.0.114.1"));
      assertFalse(IpMatcher.matches("203.0.113.0/24", "203.0.112.255"));
    }

    @Test
    void handlesPrefixesThatSplitAByte() {
      // /28 → only the top nibble of the final octet is significant.
      assertTrue(IpMatcher.matches("192.168.1.16/28", "192.168.1.16"));
      assertTrue(IpMatcher.matches("192.168.1.16/28", "192.168.1.31"));
      assertFalse(IpMatcher.matches("192.168.1.16/28", "192.168.1.32"));
      assertFalse(IpMatcher.matches("192.168.1.16/28", "192.168.1.15"));
    }

    @Test
    void slashThirtyTwoIsASingleAddress() {
      assertTrue(IpMatcher.matches("192.168.1.50/32", "192.168.1.50"));
      assertFalse(IpMatcher.matches("192.168.1.50/32", "192.168.1.51"));
    }

    @Test
    void slashZeroMatchesEverythingInTheSameFamily() {
      assertTrue(IpMatcher.matches("0.0.0.0/0", "8.8.8.8"));
      // ...but must not reach across families.
      assertFalse(IpMatcher.matches("0.0.0.0/0", "2001:db8::1"));
    }

    @Test
    void matchesIpv6Blocks() {
      assertTrue(IpMatcher.matches("2001:db8::/32", "2001:db8:1234::1"));
      assertFalse(IpMatcher.matches("2001:db8::/32", "2001:db9::1"));
    }

    @Test
    void neverMatchesAcrossFamilies() {
      assertFalse(IpMatcher.matches("203.0.113.0/24", "2001:db8::1"));
      assertFalse(IpMatcher.matches("2001:db8::/32", "203.0.113.1"));
    }

    @Test
    void rejectsImpossiblePrefixRatherThanMatchingBroadly() {
      assertFalse(IpMatcher.matches("203.0.113.0/33", "203.0.113.1"));
      assertFalse(IpMatcher.matches("203.0.113.0/-1", "203.0.113.1"));
      assertFalse(IpMatcher.matches("203.0.113.0/abc", "203.0.113.1"));
    }
  }

  @Nested
  @DisplayName("range")
  class Range {

    @Test
    void matchesInclusiveEndpoints() {
      assertTrue(IpMatcher.matches("203.0.113.10-203.0.113.40", "203.0.113.10"));
      assertTrue(IpMatcher.matches("203.0.113.10-203.0.113.40", "203.0.113.40"));
      assertTrue(IpMatcher.matches("203.0.113.10-203.0.113.40", "203.0.113.25"));
    }

    @Test
    void doesNotMatchOutsideTheSpan() {
      assertFalse(IpMatcher.matches("203.0.113.10-203.0.113.40", "203.0.113.9"));
      assertFalse(IpMatcher.matches("203.0.113.10-203.0.113.40", "203.0.113.41"));
    }

    @Test
    void spansOctetBoundaries() {
      assertTrue(IpMatcher.matches("10.0.0.250-10.0.1.5", "10.0.1.0"));
      assertFalse(IpMatcher.matches("10.0.0.250-10.0.1.5", "10.0.1.6"));
    }

    @Test
    void toleratesAReversedRange() {
      // An operator who typed the higher address first still means the span.
      assertTrue(IpMatcher.matches("203.0.113.40-203.0.113.10", "203.0.113.25"));
    }
  }

  @Nested
  @DisplayName("matchesAny")
  class MatchesAny {

    @Test
    void trueWhenAnyRuleMatches() {
      Set<String> rules = Set.of("10.0.0.1", "203.0.113.0/24", "192.168.5.10-192.168.5.20");
      assertTrue(IpMatcher.matchesAny(rules, "203.0.113.77"));
      assertTrue(IpMatcher.matchesAny(rules, "192.168.5.15"));
      assertTrue(IpMatcher.matchesAny(rules, "10.0.0.1"));
    }

    @Test
    void falseWhenNoRuleMatches() {
      assertFalse(IpMatcher.matchesAny(Set.of("10.0.0.1", "203.0.113.0/24"), "8.8.8.8"));
    }

    @Test
    void falseForEmptyOrNullInputs() {
      assertFalse(IpMatcher.matchesAny(null, "8.8.8.8"));
      assertFalse(IpMatcher.matchesAny(Set.of(), "8.8.8.8"));
      assertFalse(IpMatcher.matchesAny(Set.of("10.0.0.1"), null));
      assertFalse(IpMatcher.matchesAny(Set.of("10.0.0.1"), ""));
    }

    @Test
    void oneMalformedRuleDoesNotDisableTheRest() {
      // Legacy lists can hold junk saved before validation existed; it must
      // not stop a later valid rule from matching.
      List<String> rules = List.of("not an ip", "203.0.113.0/24");
      assertTrue(IpMatcher.matchesAny(rules, "203.0.113.5"));
    }

    @Test
    void legacyExactStringEntriesKeepWorking() {
      assertTrue(IpMatcher.matchesAny(Set.of("192.168.1.50"), "192.168.1.50"));
    }
  }

  @Nested
  @DisplayName("parse")
  class Parse {

    @Test
    void parsesIpv4ToFourBytes() {
      assertArrayEquals(new byte[] {(byte) 192, (byte) 168, 1, 50}, IpMatcher.parse("192.168.1.50"));
    }

    @Test
    void rejectsMalformedIpv4() {
      assertNull(IpMatcher.parse("256.1.1.1"));
      assertNull(IpMatcher.parse("192.168.1"));
      assertNull(IpMatcher.parse("192.168.1.1.1"));
      assertNull(IpMatcher.parse("192.168.1.a"));
      assertNull(IpMatcher.parse("192.168..1"));
    }

    @Test
    void rejectsLeadingZeroOctets() {
      // "010" is ambiguous (octal to some parsers); refuse rather than guess.
      assertNull(IpMatcher.parse("192.168.01.1"));
    }

    @Test
    void parsesCompressedAndEmbeddedIpv6() {
      assertArrayEquals(IpMatcher.parse("2001:db8:0:0:0:0:0:1"), IpMatcher.parse("2001:db8::1"));
      assertArrayEquals(IpMatcher.parse("::1"), IpMatcher.parse("0:0:0:0:0:0:0:1"));
      assertArrayEquals(IpMatcher.parse("::ffff:c0a8:101"), IpMatcher.parse("::ffff:192.168.1.1"));
    }

    @Test
    void rejectsMalformedIpv6() {
      assertNull(IpMatcher.parse("2001:db8::1::2"));
      assertNull(IpMatcher.parse("2001:db8:zzzz::1"));
      assertNull(IpMatcher.parse("1:2:3:4:5:6:7:8:9"));
      assertNull(IpMatcher.parse("12345::1"));
    }

    @Test
    void neverResolvesHostnames() {
      // A hostname must be rejected outright, not looked up.
      assertNull(IpMatcher.parse("localhost"));
      assertNull(IpMatcher.parse("example.com"));
    }
  }

  @Nested
  @DisplayName("isValidRule")
  class IsValidRule {

    @Test
    void acceptsEverySupportedShape() {
      assertTrue(IpMatcher.isValidRule("192.168.1.50"));
      assertTrue(IpMatcher.isValidRule("2001:db8::1"));
      assertTrue(IpMatcher.isValidRule("203.0.113.0/24"));
      assertTrue(IpMatcher.isValidRule("2001:db8::/32"));
      assertTrue(IpMatcher.isValidRule("203.0.113.10-203.0.113.40"));
    }

    @Test
    void rejectsJunk() {
      assertFalse(IpMatcher.isValidRule("my office"));
      assertFalse(IpMatcher.isValidRule("192.168.1.*"));
      assertFalse(IpMatcher.isValidRule("203.0.113.0/33"));
      assertFalse(IpMatcher.isValidRule(""));
      assertFalse(IpMatcher.isValidRule("   "));
      assertFalse(IpMatcher.isValidRule(null));
    }
  }
}
