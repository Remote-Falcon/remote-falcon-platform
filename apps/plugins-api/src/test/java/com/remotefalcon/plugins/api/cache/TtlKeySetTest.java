package com.remotefalcon.plugins.api.cache;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TtlKeySetTest {

  private final AtomicLong nanos = new AtomicLong(1_000_000_000L);

  private TtlKeySet set(Duration ttl, int max) {
    return new TtlKeySet(ttl, max, nanos::get);
  }

  private void advance(Duration d) {
    nanos.addAndGet(d.toNanos());
  }

  @Test
  void containsAddedKeyUntilTtlElapses() {
    TtlKeySet keys = set(Duration.ofSeconds(60), 10);
    keys.add("a");

    assertTrue(keys.contains("a"));
    advance(Duration.ofSeconds(59));
    assertTrue(keys.contains("a"));
    advance(Duration.ofSeconds(1));
    assertFalse(keys.contains("a"), "an entry must expire exactly at its TTL");
  }

  @Test
  void expiredEntryIsDroppedOnRead() {
    TtlKeySet keys = set(Duration.ofMillis(100), 10);
    keys.add("a");
    advance(Duration.ofMillis(150));

    assertFalse(keys.contains("a"));
    assertEquals(0, keys.size());
  }

  @Test
  void reAddingRefreshesTheTtl() {
    TtlKeySet keys = set(Duration.ofSeconds(10), 10);
    keys.add("a");
    advance(Duration.ofSeconds(8));
    keys.add("a");
    advance(Duration.ofSeconds(8));

    assertTrue(keys.contains("a"));
  }

  @Test
  void neverContainsAKeyThatWasNotAdded() {
    TtlKeySet keys = set(Duration.ofSeconds(10), 10);
    keys.add("a");

    assertFalse(keys.contains("b"));
    assertFalse(keys.contains(null));
  }

  @Test
  void removeAndClearDropEntries() {
    TtlKeySet keys = set(Duration.ofSeconds(10), 10);
    keys.add("a");
    keys.add("b");
    keys.remove("a");

    assertFalse(keys.contains("a"));
    assertTrue(keys.contains("b"));

    keys.clear();
    assertFalse(keys.contains("b"));
    assertEquals(0, keys.size());
  }

  @Test
  void fullSetRefusesNewKeysInsteadOfGrowing() {
    TtlKeySet keys = set(Duration.ofSeconds(10), 2);
    assertTrue(keys.add("a"));
    assertTrue(keys.add("b"));

    assertFalse(keys.add("c"), "a full set fails open (no caching) rather than growing");
    assertFalse(keys.contains("c"));
    assertEquals(2, keys.size());
  }

  @Test
  void fullSetPurgesExpiredEntriesToMakeRoom() {
    TtlKeySet keys = set(Duration.ofSeconds(10), 2);
    keys.add("a");
    keys.add("b");
    advance(Duration.ofSeconds(11));

    assertTrue(keys.add("c"));
    assertTrue(keys.contains("c"));
    assertEquals(1, keys.size());
  }

  @Test
  void zeroTtlDisablesCaching() {
    TtlKeySet keys = set(Duration.ZERO, 10);

    assertFalse(keys.add("a"));
    assertFalse(keys.contains("a"));
  }

  @Test
  void nullKeyIsIgnored() {
    TtlKeySet keys = set(Duration.ofSeconds(10), 10);

    assertFalse(keys.add(null));
    keys.remove(null);
    assertEquals(0, keys.size());
  }
}
