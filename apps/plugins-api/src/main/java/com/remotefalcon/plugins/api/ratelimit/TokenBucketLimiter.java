package com.remotefalcon.plugins.api.ratelimit;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Per-pod token buckets keyed by an arbitrary string, plus the bookkeeping
 * for a once-a-minute "over the limit" log line.
 *
 * <p>Plain {@link ConcurrentHashMap} for the same reason as {@code TtlKeySet}:
 * no native-image surprises. Memory is bounded the same way too. Once
 * {@code maxEntries} buckets exist, a new key first purges buckets that are
 * both idle past {@code idleTtl} and refilled to their burst (dropping one
 * then is lossless: a fresh bucket starts full). If that frees nothing the
 * new key is not tracked and its request is allowed. A full map fails open,
 * the same as having no limiter.
 */
public final class TokenBucketLimiter {

  /** {@code perMinute <= 0} or {@code burst <= 0} disables the limit. */
  public record Limit(double perMinute, int burst) {
    boolean disabled() {
      return perMinute <= 0 || burst <= 0;
    }
  }

  /**
   * @param retryAfterSeconds whole seconds until the next token, at least 1;
   *     0 when allowed.
   * @param logNow true on the first rejection for this key in a minute.
   * @param observedPerMinute estimated requests for this key over the last
   *     60s, rejected ones included.
   */
  public record Decision(boolean allowed, long retryAfterSeconds, boolean logNow, long observedPerMinute) {
    static final Decision ALLOWED = new Decision(true, 0, false, 0);
  }

  private static final long NANOS_PER_SECOND = 1_000_000_000L;
  private static final long MINUTE_NANOS = Duration.ofMinutes(1).toNanos();
  private static final long MIN_PURGE_INTERVAL_NANOS = NANOS_PER_SECOND;

  private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
  private final int maxEntries;
  private final long idleTtlNanos;
  private final LongSupplier nanoClock;
  private volatile long lastPurgeNanos;

  public TokenBucketLimiter(int maxEntries, Duration idleTtl) {
    this(maxEntries, idleTtl, System::nanoTime);
  }

  /** Clock-injectable for tests. */
  public TokenBucketLimiter(int maxEntries, Duration idleTtl, LongSupplier nanoClock) {
    this.maxEntries = Math.max(0, maxEntries);
    this.idleTtlNanos = Math.max(0L, idleTtl.toNanos());
    this.nanoClock = nanoClock;
    this.lastPurgeNanos = nanoClock.getAsLong() - MIN_PURGE_INTERVAL_NANOS;
  }

  public Decision acquire(String key, Limit limit) {
    if (key == null || limit.disabled()) {
      return Decision.ALLOWED;
    }
    long now = nanoClock.getAsLong();
    Bucket bucket = buckets.get(key);
    if (bucket == null) {
      if (buckets.size() >= maxEntries) {
        purgeIdle(now);
        if (buckets.size() >= maxEntries) {
          return Decision.ALLOWED;
        }
      }
      bucket = buckets.computeIfAbsent(key, k -> new Bucket(limit.burst(), now));
    }
    return bucket.acquire(limit, now);
  }

  /** Bucket count, including idle ones not yet purged. */
  public int size() {
    return buckets.size();
  }

  public void clear() {
    buckets.clear();
  }

  private void purgeIdle(long now) {
    if (now - lastPurgeNanos < MIN_PURGE_INTERVAL_NANOS) {
      return;
    }
    lastPurgeNanos = now;
    buckets.values().removeIf(bucket -> bucket.evictable(now, idleTtlNanos));
  }

  private static final class Bucket {
    private double tokens;
    private long lastRefillNanos;
    private long fullAtNanos;
    private long lastSeenNanos;
    private long lastLogNanos;
    // Sliding-window counter: requests in the previous and current
    // one-minute windows, for the observed rate in the log line.
    private long windowStartNanos;
    private long previousCount;
    private long currentCount;

    Bucket(int burst, long now) {
      this.tokens = burst;
      this.lastRefillNanos = now;
      this.fullAtNanos = now;
      this.lastSeenNanos = now;
      this.lastLogNanos = now - MINUTE_NANOS;
      this.windowStartNanos = now;
    }

    synchronized Decision acquire(Limit limit, long now) {
      lastSeenNanos = now;
      double perNano = limit.perMinute() / MINUTE_NANOS;
      tokens = Math.min(limit.burst(), tokens + (now - lastRefillNanos) * perNano);
      lastRefillNanos = now;
      countRequest(now);

      if (tokens >= 1.0) {
        tokens -= 1.0;
        fullAtNanos = now + (long) Math.ceil((limit.burst() - tokens) / perNano);
        return Decision.ALLOWED;
      }

      fullAtNanos = now + (long) Math.ceil((limit.burst() - tokens) / perNano);
      long waitNanos = (long) Math.ceil((1.0 - tokens) / perNano);
      long retryAfterSeconds = Math.max(1L, (waitNanos + NANOS_PER_SECOND - 1) / NANOS_PER_SECOND);
      boolean logNow = now - lastLogNanos >= MINUTE_NANOS;
      if (logNow) {
        lastLogNanos = now;
      }
      return new Decision(false, retryAfterSeconds, logNow, observedPerMinute(now));
    }

    synchronized boolean evictable(long now, long idleTtlNanos) {
      return now - lastSeenNanos >= idleTtlNanos && now - fullAtNanos >= 0;
    }

    private void countRequest(long now) {
      long elapsed = now - windowStartNanos;
      if (elapsed >= MINUTE_NANOS) {
        long windows = elapsed / MINUTE_NANOS;
        previousCount = windows == 1 ? currentCount : 0;
        currentCount = 0;
        windowStartNanos += windows * MINUTE_NANOS;
      }
      currentCount++;
    }

    private long observedPerMinute(long now) {
      double intoWindow = (double) (now - windowStartNanos) / MINUTE_NANOS;
      return Math.round(previousCount * (1.0 - intoWindow) + currentCount);
    }
  }
}
