package com.remotefalcon.plugins.api.cache;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Duration;

/**
 * Per-pod memory of "this show's queue (or vote list) was empty a moment
 * ago", so a plugin polling an empty queue about once a second doesn't cost a
 * Mongo read every time.
 *
 * <p>Correctness rests on three properties:
 * <ul>
 *   <li>It only ever answers "empty", and an empty answer never dequeues or
 *       writes. A stale hit can delay a request; it can't skip, reorder or
 *       double-play one. Every non-empty poll still runs the full
 *       read-select-{@code $pull} path.</li>
 *   <li>Requests and votes are added mostly by other services (viewer,
 *       control-panel), which can't reach this cache. The TTL bounds how
 *       late a plugin sees them. It's capped below the plugin's 3s
 *       requestFetchTime so a non-interrupt plugin's last-3s fetch still
 *       lands inside the window.</li>
 *   <li>Writes from this pod (updateWhatsPlaying's managed PSA inject, purge,
 *       vote reset, ...) drop the show's entries once they've run
 *       ({@code PollCacheInvalidationFilter}).</li>
 * </ul>
 */
@ApplicationScoped
public class EmptyPollCache {

  public enum PollKind {
    NEXT_IN_QUEUE("/nextPlaylistInQueue"),
    HIGHEST_VOTED("/highestVotedPlaylist");

    private final String pathSuffix;

    PollKind(String pathSuffix) {
      this.pathSuffix = pathSuffix;
    }

    /** The poll endpoint {@code path} belongs to, or null for any other path. */
    public static PollKind fromPath(String path) {
      if (path == null) {
        return null;
      }
      for (PollKind kind : values()) {
        if (path.endsWith(kind.pathSuffix)) {
          return kind;
        }
      }
      return null;
    }
  }

  // Staleness has to stay under the plugin's requestFetchTime (3s).
  static final long MAX_TTL_MS = 2500L;

  @ConfigProperty(name = "plugins-api.cache.empty-poll.ttl-ms", defaultValue = "2000")
  long ttlMs;

  @ConfigProperty(name = "plugins-api.cache.empty-poll.max-entries", defaultValue = "10000")
  int maxEntries;

  private TtlKeySet emptyRequests;
  private TtlKeySet emptyVotes;

  @PostConstruct
  void init() {
    Duration ttl = Duration.ofMillis(Math.min(ttlMs, MAX_TTL_MS));
    emptyRequests = new TtlKeySet(ttl, maxEntries);
    emptyVotes = new TtlKeySet(ttl, maxEntries);
  }

  public boolean isEmpty(PollKind kind, String showToken) {
    return keys(kind).contains(showToken);
  }

  public void markEmpty(PollKind kind, String showToken) {
    keys(kind).add(showToken);
  }

  public void invalidate(String showToken) {
    emptyRequests.remove(showToken);
    emptyVotes.remove(showToken);
  }

  public void clear() {
    emptyRequests.clear();
    emptyVotes.clear();
  }

  private TtlKeySet keys(PollKind kind) {
    return kind == PollKind.NEXT_IN_QUEUE ? emptyRequests : emptyVotes;
  }
}
