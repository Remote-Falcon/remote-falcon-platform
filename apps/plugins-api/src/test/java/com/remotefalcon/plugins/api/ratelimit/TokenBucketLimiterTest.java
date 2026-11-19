package com.remotefalcon.plugins.api.ratelimit;

import com.remotefalcon.plugins.api.ratelimit.TokenBucketLimiter.Decision;
import com.remotefalcon.plugins.api.ratelimit.TokenBucketLimiter.Limit;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TokenBucketLimiterTest {

  private static final Limit SIX_PER_MIN_BURST_3 = new Limit(6, 3);

  private final AtomicLong nanos = new AtomicLong(5_000_000_000L);

  private TokenBucketLimiter limiter(int maxEntries, Duration idleTtl) {
    return new TokenBucketLimiter(maxEntries, idleTtl, nanos::get);
  }

  private TokenBucketLimiter limiter() {
    return limiter(100, Duration.ofMinutes(10));
  }

  private void advance(Duration d) {
    nanos.addAndGet(d.toNanos());
  }

  @Test
  void allowsTheBurstThenRejects() {
    TokenBucketLimiter limiter = limiter();
    for (int i = 0; i < 3; i++) {
      assertTrue(limiter.acquire("k", SIX_PER_MIN_BURST_3).allowed(), "request " + i);
    }
    assertFalse(limiter.acquire("k", SIX_PER_MIN_BURST_3).allowed());
  }

  @Test
  void retryAfterIsTheWaitForTheNextToken() {
    TokenBucketLimiter limiter = limiter();
    for (int i = 0; i < 3; i++) {
      limiter.acquire("k", SIX_PER_MIN_BURST_3);
    }
    // 6/min refills one token every 10s.
    assertEquals(10, limiter.acquire("k", SIX_PER_MIN_BURST_3).retryAfterSeconds());
    advance(Duration.ofSeconds(7));
    assertEquals(3, limiter.acquire("k", SIX_PER_MIN_BURST_3).retryAfterSeconds());
    advance(Duration.ofMillis(2_500));
    assertEquals(1, limiter.acquire("k", SIX_PER_MIN_BURST_3).retryAfterSeconds(),
        "never below 1s, a Retry-After of 0 means retry now");
  }

  @Test
  void refillsAtTheConfiguredRateUpToTheBurst() {
    TokenBucketLimiter limiter = limiter();
    for (int i = 0; i < 3; i++) {
      limiter.acquire("k", SIX_PER_MIN_BURST_3);
    }
    advance(Duration.ofSeconds(10));
    assertTrue(limiter.acquire("k", SIX_PER_MIN_BURST_3).allowed());
    assertFalse(limiter.acquire("k", SIX_PER_MIN_BURST_3).allowed());

    // A long idle refills to the burst, never past it.
    advance(Duration.ofHours(1));
    for (int i = 0; i < 3; i++) {
      assertTrue(limiter.acquire("k", SIX_PER_MIN_BURST_3).allowed());
    }
    assertFalse(limiter.acquire("k", SIX_PER_MIN_BURST_3).allowed());
  }

  @Test
  void keysAreIndependent() {
    TokenBucketLimiter limiter = limiter();
    for (int i = 0; i < 4; i++) {
      limiter.acquire("a", SIX_PER_MIN_BURST_3);
    }
    assertFalse(limiter.acquire("a", SIX_PER_MIN_BURST_3).allowed());
    assertTrue(limiter.acquire("b", SIX_PER_MIN_BURST_3).allowed());
  }

  @Test
  void flagsALogLineAtMostOncePerMinutePerKey() {
    TokenBucketLimiter limiter = limiter();
    Limit limit = new Limit(60, 1);
    assertFalse(limiter.acquire("k", limit).logNow(), "allowed requests never log");

    // 10 req/s for 2 minutes, over the limit the whole time.
    List<Long> logTimes = new ArrayList<>();
    for (int i = 0; i < 1200; i++) {
      advance(Duration.ofMillis(100));
      if (limiter.acquire("k", limit).logNow()) {
        logTimes.add(nanos.get());
      }
    }
    assertEquals(2, logTimes.size(), "one line in each minute");
    assertTrue(logTimes.get(1) - logTimes.get(0) >= Duration.ofMinutes(1).toNanos());
  }

  @Test
  void reportsTheObservedRatePerMinute() {
    TokenBucketLimiter limiter = limiter();
    Limit limit = new Limit(6, 1);
    // A sync loop at 1/s for over two minutes.
    Decision last = null;
    for (int i = 0; i < 150; i++) {
      advance(Duration.ofSeconds(1));
      Decision decision = limiter.acquire("k", limit);
      if (decision.logNow()) {
        last = decision;
      }
    }
    // Sliding-window estimate of "requests in the last 60s".
    assertTrue(last != null && last.observedPerMinute() >= 58 && last.observedPerMinute() <= 62,
        "observed " + (last == null ? null : last.observedPerMinute()));
  }

  @Test
  void disabledLimitAlwaysAllows() {
    TokenBucketLimiter limiter = limiter();
    for (int i = 0; i < 1000; i++) {
      assertTrue(limiter.acquire("k", new Limit(0, 0)).allowed());
    }
    assertEquals(0, limiter.size(), "a disabled limit keeps no state");
  }

  @Test
  void evictsIdleBucketsWhenFull() {
    TokenBucketLimiter limiter = limiter(2, Duration.ofMinutes(10));
    limiter.acquire("a", SIX_PER_MIN_BURST_3);
    limiter.acquire("b", SIX_PER_MIN_BURST_3);
    advance(Duration.ofMinutes(11));

    limiter.acquire("c", SIX_PER_MIN_BURST_3);
    assertEquals(1, limiter.size(), "idle buckets are dropped to make room");
  }

  @Test
  void failsOpenWhenFullOfLiveBuckets() {
    TokenBucketLimiter limiter = limiter(2, Duration.ofMinutes(10));
    limiter.acquire("a", SIX_PER_MIN_BURST_3);
    limiter.acquire("b", SIX_PER_MIN_BURST_3);

    for (int i = 0; i < 10; i++) {
      assertTrue(limiter.acquire("c", SIX_PER_MIN_BURST_3).allowed(),
          "an untracked key is allowed, never rejected for lack of room");
    }
    assertEquals(2, limiter.size());
  }

  @Test
  void idleTtlNeverDropsABucketBeforeItHasRefilled() {
    // A 1s idle TTL with a 6/min, burst-3 limit would forget a drained
    // bucket 29s before it is full again, handing out a free burst.
    TokenBucketLimiter limiter = limiter(1, Duration.ofSeconds(1));
    for (int i = 0; i < 3; i++) {
      limiter.acquire("a", SIX_PER_MIN_BURST_3);
    }
    advance(Duration.ofSeconds(5));
    limiter.acquire("b", SIX_PER_MIN_BURST_3);
    assertFalse(limiter.acquire("a", SIX_PER_MIN_BURST_3).allowed(), "a is still drained");
  }
}
