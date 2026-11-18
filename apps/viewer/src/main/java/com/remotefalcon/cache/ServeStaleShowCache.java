package com.remotefalcon.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.mongo.MongoUnavailable;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * Last good viewer show per subdomain, for the 5s getShow poll (Season Prep
 * S5a, Appendix D P2-1).
 *
 * <ul>
 *   <li><b>Fresh window</b> ({@code VIEWER_SERVE_STALE_FRESH_MS}, 2s): repeat
 *       polls for the same show are answered from memory, and concurrent polls
 *       that miss share one Mongo load instead of each running their own.</li>
 *   <li><b>Serve stale</b> ({@code VIEWER_SERVE_STALE_MAX_AGE_MS}, 120s): when
 *       the load fails because Mongo is unavailable (driver timeout or open
 *       circuit breaker), the last good copy is returned instead of a
 *       SERVICE_UNAVAILABLE error, as long as it is younger than the max
 *       age. Older than that, or nothing cached, the error goes out as
 *       before.</li>
 * </ul>
 *
 * <p>Only reads go through here. Requests and votes still hit Mongo and still
 * fail fast with the existing 503 / SERVICE_UNAVAILABLE path.
 *
 * <p>The cached value is the show after GraphQLQueryService's viewer
 * processing, shared by every poll that gets it, so nothing may mutate a
 * returned show. Bounded by entry count (Caffeine, size eviction).
 *
 * <p>Off by default ({@code VIEWER_SERVE_STALE_ENABLED=false}): then
 * {@link #get} just calls the loader. All settings are runtime config read when
 * the bean is first used, so they can change per deploy in the native image.
 */
@ApplicationScoped
public class ServeStaleShowCache {

  private static final Logger LOG = Logger.getLogger(ServeStaleShowCache.class);

  private record Entry(Show show, long loadedAtMs) {
  }

  private final boolean enabled;
  private final long freshMs;
  private final long maxAgeMs;
  private final LongSupplier clockMs;
  private final Cache<String, Entry> entries;
  private final ConcurrentHashMap<String, CompletableFuture<Show>> inFlight = new ConcurrentHashMap<>();
  private final Counter servedStale;
  private final Counter staleExpired;

  @Inject
  public ServeStaleShowCache(
      @ConfigProperty(name = "remotefalcon.viewer.serve-stale.enabled", defaultValue = "false") boolean enabled,
      @ConfigProperty(name = "remotefalcon.viewer.serve-stale.fresh", defaultValue = "2S") Duration fresh,
      @ConfigProperty(name = "remotefalcon.viewer.serve-stale.max-age", defaultValue = "120S") Duration maxAge,
      @ConfigProperty(name = "remotefalcon.viewer.serve-stale.max-entries", defaultValue = "5000") int maxEntries,
      MeterRegistry registry) {
    this(enabled, fresh.toMillis(), maxAge.toMillis(), maxEntries, System::currentTimeMillis, registry);
  }

  ServeStaleShowCache(boolean enabled, long freshMs, long maxAgeMs, int maxEntries,
      LongSupplier clockMs, MeterRegistry registry) {
    this.enabled = enabled;
    this.freshMs = freshMs;
    this.maxAgeMs = maxAgeMs;
    this.clockMs = clockMs;
    this.entries = enabled
        ? Caffeine.newBuilder()
            .maximumSize(maxEntries)
            // The max-age check is ageMs() below; this only reclaims memory,
            // so it runs a fresh window behind it.
            .expireAfterWrite(Duration.ofMillis(maxAgeMs + freshMs))
            .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clockMs.getAsLong()))
            .build()
        : null;
    this.servedStale = serveStaleCounter(registry, "served");
    this.staleExpired = serveStaleCounter(registry, "too_old");
    if (enabled) {
      LOG.infof("VIEWER_SERVE_STALE enabled freshMs=%d maxAgeMs=%d maxEntries=%d", freshMs, maxAgeMs, maxEntries);
    }
  }

  /**
   * The show for {@code key}: from memory while fresh, else from
   * {@code loader}, else (Mongo unavailable) the last good copy within the max
   * age. A {@code null} from the loader (show not found) is returned and not
   * cached.
   */
  public Show get(String key, Supplier<Show> loader) {
    if (!enabled) {
      return loader.get();
    }
    Entry cached = entries.getIfPresent(key);
    if (cached != null && ageMs(cached) < freshMs) {
      return cached.show();
    }

    CompletableFuture<Show> mine = new CompletableFuture<>();
    CompletableFuture<Show> running = inFlight.putIfAbsent(key, mine);
    if (running != null) {
      return awaitOther(key, running, cached);
    }
    try {
      Show loaded = loader.get();
      if (loaded == null) {
        entries.invalidate(key);
      } else {
        entries.put(key, new Entry(loaded, clockMs.getAsLong()));
      }
      mine.complete(loaded);
      return loaded;
    } catch (RuntimeException e) {
      mine.completeExceptionally(e);
      Show stale = staleFallback(cached, e);
      if (stale == null) {
        throw e;
      }
      MongoUnavailable.logOnce("graphql:getShow:served-stale ageMs=" + ageMs(cached), MongoUnavailable.find(e).get());
      return stale;
    } finally {
      inFlight.remove(key, mine);
    }
  }

  /**
   * Another poll is already loading this show. Wait for its result, but not
   * longer than the fresh window if there is a usable copy: during a stall
   * that copy is the answer anyway.
   */
  private Show awaitOther(String key, CompletableFuture<Show> running, Entry cached) {
    try {
      if (cached != null && ageMs(cached) <= maxAgeMs) {
        try {
          return running.get(freshMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException slow) {
          servedStale.increment();
          return cached.show();
        }
      }
      return running.get();
    } catch (ExecutionException e) {
      RuntimeException cause = e.getCause() instanceof RuntimeException re
          ? re : new IllegalStateException("getShow load failed for " + key, e.getCause());
      Show stale = staleFallback(cached, cause);
      if (stale == null) {
        throw cause;
      }
      return stale;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted waiting for getShow load of " + key, e);
    }
  }

  /** The cached show if {@code failure} is Mongo-unavailable and the copy is young enough, else null. */
  private Show staleFallback(Entry cached, RuntimeException failure) {
    if (cached == null || MongoUnavailable.find(failure).isEmpty()) {
      return null;
    }
    if (ageMs(cached) > maxAgeMs) {
      staleExpired.increment();
      return null;
    }
    servedStale.increment();
    return cached.show();
  }

  private static Counter serveStaleCounter(MeterRegistry registry, String outcome) {
    return Counter.builder("viewer_serve_stale_total")
        .description("getShow polls answered from the serve-stale cache because Mongo was unavailable")
        .tag("outcome", outcome)
        .register(registry);
  }

  private long ageMs(Entry entry) {
    return clockMs.getAsLong() - entry.loadedAtMs();
  }

  /** Visible for tests. */
  void cleanUp() {
    if (entries != null) {
      entries.cleanUp();
    }
  }

  /** Visible for tests. */
  long size() {
    return entries == null ? 0 : entries.estimatedSize();
  }

  /** Drops every cached show. Visible for tests. */
  public void clear() {
    if (entries != null) {
      entries.invalidateAll();
    }
  }
}
