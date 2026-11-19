package com.remotefalcon.cache;

import com.mongodb.MongoTimeoutException;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.mongo.MongoCircuitOpenException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ServeStaleShowCacheTest {

  private static final long FRESH_MS = 2_000;
  private static final long MAX_AGE_MS = 120_000;

  private final AtomicLong now = new AtomicLong(1_000_000);
  private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

  private ServeStaleShowCache cache(boolean enabled) {
    return new ServeStaleShowCache(enabled, FRESH_MS, MAX_AGE_MS, 5_000, now::get, registry);
  }

  private static Show show(String name) {
    Show show = new Show();
    show.setShowName(name);
    return show;
  }

  private static Supplier<Show> counting(AtomicInteger calls, Show result) {
    return () -> {
      calls.incrementAndGet();
      return result;
    };
  }

  private static Supplier<Show> failing(RuntimeException e) {
    return () -> {
      throw e;
    };
  }

  private double servedStale() {
    return registry.get("viewer_serve_stale_total").tag("outcome", "served").counter().count();
  }

  @Test
  @DisplayName("Disabled: every call goes to the loader and failures propagate unchanged")
  void disabledIsPassThrough() {
    ServeStaleShowCache cache = cache(false);
    AtomicInteger calls = new AtomicInteger();

    cache.get("s", counting(calls, show("a")));
    cache.get("s", counting(calls, show("a")));
    assertEquals(2, calls.get());

    MongoTimeoutException timeout = new MongoTimeoutException("down");
    assertSame(timeout, assertThrows(MongoTimeoutException.class, () -> cache.get("s", failing(timeout))));
  }

  @Test
  @DisplayName("Within the fresh window, repeat polls are served from memory")
  void freshHitSkipsLoader() {
    ServeStaleShowCache cache = cache(true);
    AtomicInteger calls = new AtomicInteger();
    Show first = show("a");

    assertSame(first, cache.get("s", counting(calls, first)));
    now.addAndGet(FRESH_MS - 1);
    assertSame(first, cache.get("s", counting(calls, show("b"))));
    assertEquals(1, calls.get());
  }

  @Test
  @DisplayName("After the fresh window, the next poll reloads")
  void reloadsAfterFreshWindow() {
    ServeStaleShowCache cache = cache(true);
    AtomicInteger calls = new AtomicInteger();
    cache.get("s", counting(calls, show("a")));

    now.addAndGet(FRESH_MS);
    Show second = show("b");
    assertSame(second, cache.get("s", counting(calls, second)));
    assertEquals(2, calls.get());
  }

  @Test
  @DisplayName("Mongo unavailable: serves the cached show while it is within max age")
  void servesStaleOnMongoFailure() {
    ServeStaleShowCache cache = cache(true);
    Show cached = show("a");
    cache.get("s", () -> cached);

    now.addAndGet(MAX_AGE_MS);
    assertSame(cached, cache.get("s", failing(new MongoTimeoutException("down"))));
    assertEquals(1.0, servedStale());
  }

  @Test
  @DisplayName("Open circuit breaker counts as Mongo unavailable")
  void servesStaleOnOpenBreaker() {
    ServeStaleShowCache cache = cache(true);
    Show cached = show("a");
    cache.get("s", () -> cached);

    now.addAndGet(FRESH_MS + 1);
    assertSame(cached, cache.get("s", failing(new MongoCircuitOpenException())));
  }

  @Test
  @DisplayName("Mongo unavailable past max age: the failure propagates")
  void failsPastMaxAge() {
    ServeStaleShowCache cache = cache(true);
    cache.get("s", () -> show("a"));

    now.addAndGet(MAX_AGE_MS + 1);
    assertThrows(MongoTimeoutException.class, () -> cache.get("s", failing(new MongoTimeoutException("down"))));
  }

  @Test
  @DisplayName("Mongo unavailable with nothing cached: the failure propagates")
  void failsWithNoEntry() {
    ServeStaleShowCache cache = cache(true);
    assertThrows(MongoTimeoutException.class, () -> cache.get("s", failing(new MongoTimeoutException("down"))));
  }

  @Test
  @DisplayName("A non-Mongo failure is never masked by a cached show")
  void otherFailurePropagates() {
    ServeStaleShowCache cache = cache(true);
    cache.get("s", () -> show("a"));

    now.addAndGet(FRESH_MS + 1);
    assertThrows(IllegalStateException.class, () -> cache.get("s", failing(new IllegalStateException("bug"))));
  }

  @Test
  @DisplayName("Show not found: returns null and drops any cached copy")
  void notFoundIsNotCached() {
    ServeStaleShowCache cache = cache(true);
    cache.get("s", () -> show("a"));

    now.addAndGet(FRESH_MS + 1);
    assertNull(cache.get("s", () -> null));
    now.addAndGet(FRESH_MS + 1);
    assertThrows(MongoTimeoutException.class, () -> cache.get("s", failing(new MongoTimeoutException("down"))));
  }

  @Test
  @DisplayName("Concurrent polls for the same show share one load")
  void concurrentPollsCollapse() throws Exception {
    ServeStaleShowCache cache = cache(true);
    AtomicInteger calls = new AtomicInteger();
    CountDownLatch loading = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    Show loaded = show("a");
    Supplier<Show> slow = () -> {
      calls.incrementAndGet();
      loading.countDown();
      try {
        release.await(5, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
      return loaded;
    };

    ExecutorService pool = Executors.newFixedThreadPool(4);
    try {
      Future<Show> leader = pool.submit(() -> cache.get("s", slow));
      loading.await(5, TimeUnit.SECONDS);
      Future<Show> f1 = pool.submit(() -> cache.get("s", slow));
      Future<Show> f2 = pool.submit(() -> cache.get("s", slow));
      Thread.sleep(100);
      release.countDown();
      assertSame(loaded, leader.get(5, TimeUnit.SECONDS));
      assertSame(loaded, f1.get(5, TimeUnit.SECONDS));
      assertSame(loaded, f2.get(5, TimeUnit.SECONDS));
      assertEquals(1, calls.get());
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  @DisplayName("A poll that waits on another's failing load also falls back to the cached show")
  void followerServedStaleWhenLeaderFails() throws Exception {
    ServeStaleShowCache cache = cache(true);
    Show cached = show("a");
    cache.get("s", () -> cached);
    now.addAndGet(FRESH_MS + 1);

    CountDownLatch loading = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    Supplier<Show> slowFail = () -> {
      loading.countDown();
      try {
        release.await(5, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
      throw new MongoTimeoutException("down");
    };

    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Future<Show> leader = pool.submit(() -> cache.get("s", slowFail));
      loading.await(5, TimeUnit.SECONDS);
      Future<Show> follower = pool.submit(() -> cache.get("s", slowFail));
      Thread.sleep(100);
      release.countDown();
      assertSame(cached, leader.get(5, TimeUnit.SECONDS));
      assertSame(cached, follower.get(5, TimeUnit.SECONDS));
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  @DisplayName("Entries are bounded by size")
  void boundedBySize() {
    ServeStaleShowCache cache = new ServeStaleShowCache(true, FRESH_MS, MAX_AGE_MS, 10, now::get, registry);
    for (int i = 0; i < 100; i++) {
      cache.get("s" + i, () -> show("x"));
    }
    cache.cleanUp();
    assertEquals(true, cache.size() <= 10, "size=" + cache.size());
  }
}
