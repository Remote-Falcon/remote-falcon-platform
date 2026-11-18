package com.remotefalcon.plugins.api.ratelimit;

import com.remotefalcon.plugins.api.ratelimit.TokenBucketLimiter.Decision;
import com.remotefalcon.plugins.api.ratelimit.TokenBucketLimiter.Limit;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.util.Locale;

/**
 * Per-show-token rate limit for plugin calls (Season Capacity Plan R2,
 * Appendix D P2-3), one token bucket per (endpoint, token) per pod.
 *
 * <p>Per endpoint so a looping sync can't cost the same show its heartbeat
 * or its queue polls. Limits are per pod: with the HPA at 2-8 pods a plugin
 * whose calls spread across pods gets up to N times the limit, which is why
 * the defaults sit far above normal traffic and only catch runaway loops.
 *
 * <p>All config is read at runtime, so the mode can be flipped with an env
 * var and a restart, no rebuild.
 */
@ApplicationScoped
public class PluginRateLimiter {

  private static final Logger LOG = Logger.getLogger(PluginRateLimiter.class);

  // Real tokens are 25 chars; longer ones are junk that auth will reject and
  // that shouldn't take bucket memory.
  static final int MAX_TOKEN_LENGTH = 128;

  public enum Mode {
    OFF, LOG, ENFORCE;

    /** Unknown or missing values mean LOG: measure, never reject. */
    public static Mode parse(String value) {
      if (value != null) {
        for (Mode mode : values()) {
          if (mode.name().equalsIgnoreCase(value.trim())) {
            return mode;
          }
        }
      }
      return LOG;
    }

    public String label() {
      return name().toLowerCase(Locale.ROOT);
    }
  }

  @ConfigProperty(name = "plugins-api.rate-limit.mode", defaultValue = "log")
  String modeValue;

  @ConfigProperty(name = "plugins-api.rate-limit.poll.per-minute", defaultValue = "120")
  double pollPerMinute;

  @ConfigProperty(name = "plugins-api.rate-limit.poll.burst", defaultValue = "30")
  int pollBurst;

  @ConfigProperty(name = "plugins-api.rate-limit.sync.per-minute", defaultValue = "6")
  double syncPerMinute;

  @ConfigProperty(name = "plugins-api.rate-limit.sync.burst", defaultValue = "3")
  int syncBurst;

  @ConfigProperty(name = "plugins-api.rate-limit.other.per-minute", defaultValue = "60")
  double otherPerMinute;

  @ConfigProperty(name = "plugins-api.rate-limit.other.burst", defaultValue = "30")
  int otherBurst;

  @ConfigProperty(name = "plugins-api.rate-limit.max-entries", defaultValue = "50000")
  int maxEntries;

  @ConfigProperty(name = "plugins-api.rate-limit.idle-ttl-ms", defaultValue = "600000")
  long idleTtlMs;

  private Mode mode;
  private Limit poll;
  private Limit sync;
  private Limit other;
  private TokenBucketLimiter buckets;

  public PluginRateLimiter() {
  }

  public PluginRateLimiter(Mode mode, Limit poll, Limit sync, Limit other, TokenBucketLimiter buckets) {
    this.mode = mode;
    this.poll = poll;
    this.sync = sync;
    this.other = other;
    this.buckets = buckets;
  }

  @PostConstruct
  void init() {
    mode = Mode.parse(modeValue);
    poll = new Limit(pollPerMinute, pollBurst);
    sync = new Limit(syncPerMinute, syncBurst);
    other = new Limit(otherPerMinute, otherBurst);
    buckets = new TokenBucketLimiter(maxEntries, Duration.ofMillis(idleTtlMs));
    LOG.infof("RATE_LIMIT_CONFIG mode=%s poll=%s sync=%s other=%s maxEntries=%d",
        mode.label(), describeLimit(poll), describeLimit(sync), describeLimit(other), maxEntries);
  }

  public Mode mode() {
    return mode;
  }

  /** The limit for the endpoint {@code path} falls under. */
  public Limit limitFor(String path) {
    if (path.endsWith("/nextPlaylistInQueue") || path.endsWith("/highestVotedPlaylist")) {
      return poll;
    }
    if (path.endsWith("/syncPlaylists")) {
      return sync;
    }
    return other;
  }

  /**
   * Takes a token for this call. Requests are only ever matched resource
   * paths (the filter runs after routing), so keying on the path can't be
   * used to grow the map with junk.
   */
  public Decision check(String path, String showToken) {
    if (mode == Mode.OFF || showToken.length() > MAX_TOKEN_LENGTH) {
      return Decision.ALLOWED;
    }
    return buckets.acquire(path + ' ' + showToken, limitFor(path));
  }

  public void clear() {
    buckets.clear();
  }

  public static String describeLimit(Limit limit) {
    return limit.disabled()
        ? "off"
        : String.format(Locale.ROOT, "%s/min,burst=%d", trim(limit.perMinute()), limit.burst());
  }

  static String trim(double value) {
    return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
  }
}
