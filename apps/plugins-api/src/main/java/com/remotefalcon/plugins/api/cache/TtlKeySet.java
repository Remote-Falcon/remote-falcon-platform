package com.remotefalcon.plugins.api.cache;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * A bounded, per-pod set of string keys that each expire after a fixed TTL.
 *
 * <p>Deliberately tiny instead of pulling in quarkus-cache: the two plugin
 * caches only need "is this key marked, and since when", and a plain
 * {@link ConcurrentHashMap} has no native-image surprises.
 *
 * <p>Bounded by refusing inserts once full (after purging expired entries)
 * rather than evicting. A full set fails open: the caller just doesn't get
 * a cache hit and goes to the DB, which is today's behavior. That keeps a
 * flood of junk keys from growing memory without letting it evict
 * anything that matters.
 */
public final class TtlKeySet {

  // A flood of fresh keys against a full set would otherwise rescan the
  // whole map on every insert.
  private static final long MIN_PURGE_INTERVAL_NANOS = Duration.ofSeconds(1).toNanos();

  private final ConcurrentHashMap<String, Long> expiries = new ConcurrentHashMap<>();
  private final long ttlNanos;
  private final int maxEntries;
  private final LongSupplier nanoClock;
  private volatile long lastPurgeNanos;

  public TtlKeySet(Duration ttl, int maxEntries) {
    this(ttl, maxEntries, System::nanoTime);
  }

  TtlKeySet(Duration ttl, int maxEntries, LongSupplier nanoClock) {
    this.ttlNanos = Math.max(0L, ttl.toNanos());
    this.maxEntries = Math.max(0, maxEntries);
    this.nanoClock = nanoClock;
    this.lastPurgeNanos = nanoClock.getAsLong() - MIN_PURGE_INTERVAL_NANOS;
  }

  /** True while {@code key} was added less than the TTL ago. */
  public boolean contains(String key) {
    if (key == null) {
      return false;
    }
    Long expiresAt = expiries.get(key);
    if (expiresAt == null) {
      return false;
    }
    if (nanoClock.getAsLong() - expiresAt < 0) {
      return true;
    }
    expiries.remove(key, expiresAt);
    return false;
  }

  /**
   * Marks {@code key} for one TTL from now (re-adding refreshes it).
   *
   * @return false when nothing was stored: caching disabled (TTL 0), a null
   *     key, or the set is full of live entries.
   */
  public boolean add(String key) {
    if (key == null || ttlNanos == 0L || maxEntries == 0) {
      return false;
    }
    long now = nanoClock.getAsLong();
    if (!expiries.containsKey(key) && expiries.size() >= maxEntries) {
      purgeExpired(now);
      if (expiries.size() >= maxEntries) {
        return false;
      }
    }
    expiries.put(key, now + ttlNanos);
    return true;
  }

  public void remove(String key) {
    if (key != null) {
      expiries.remove(key);
    }
  }

  public void clear() {
    expiries.clear();
  }

  /** Entry count, including entries that have expired but not been read since. */
  public int size() {
    return expiries.size();
  }

  private void purgeExpired(long now) {
    if (now - lastPurgeNanos < MIN_PURGE_INTERVAL_NANOS) {
      return;
    }
    lastPurgeNanos = now;
    expiries.entrySet().removeIf(entry -> now - entry.getValue() >= 0);
  }
}
