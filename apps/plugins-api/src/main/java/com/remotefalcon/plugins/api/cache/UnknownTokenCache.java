package com.remotefalcon.plugins.api.cache;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Duration;

/**
 * Per-pod negative cache of show tokens that matched no show.
 *
 * <p>Plugins left running against a deleted, archived or rotated-away token
 * keep polling forever, and each poll used to be a {@code findByShowToken}
 * (618 404s in 2 minutes on 2026-10-12). A hit here answers 404 without
 * touching Mongo.
 *
 * <p>Only ever populated from a lookup that returned no document, so a valid
 * token can't land here. A token becomes valid after being seen as unknown
 * only through a restore (account-archive or a backup restore re-inserting
 * an old show with its old token). Signup and rotateShowToken both persist
 * the token before the operator can see it, so a plugin can't poll a new
 * token before it exists. The TTL is kept short (60s, not the 5 min first
 * sketched) so even a restore is barely noticeable. The cost of the shorter
 * TTL is one lookup per dead token per pod per minute instead of per five.
 */
@ApplicationScoped
public class UnknownTokenCache {

  // Real tokens are 25 chars. Anything far longer is junk that shouldn't
  // be allowed to take cache memory.
  static final int MAX_TOKEN_LENGTH = 128;

  @ConfigProperty(name = "plugins-api.cache.unknown-token.ttl-ms", defaultValue = "60000")
  long ttlMs;

  @ConfigProperty(name = "plugins-api.cache.unknown-token.max-entries", defaultValue = "10000")
  int maxEntries;

  private TtlKeySet tokens;

  @PostConstruct
  void init() {
    tokens = new TtlKeySet(Duration.ofMillis(ttlMs), maxEntries);
  }

  public boolean isUnknown(String showToken) {
    return tokens.contains(showToken);
  }

  public void markUnknown(String showToken) {
    if (showToken != null && showToken.length() <= MAX_TOKEN_LENGTH) {
      tokens.add(showToken);
    }
  }

  public void clear() {
    tokens.clear();
  }
}
