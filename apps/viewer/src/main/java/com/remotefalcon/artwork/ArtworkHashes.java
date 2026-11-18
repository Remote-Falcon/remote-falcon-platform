package com.remotefalcon.artwork;

import jakarta.enterprise.context.ApplicationScoped;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Content hash of an inline artwork data URI, memoised so the 5s viewer poll
 * does not SHA-256 the whole gallery every time.
 *
 * <p>Each poll decodes fresh String instances from Mongo, so String identity
 * can't be the key. The memo key is (show, length, String.hashCode): one cheap
 * pass with no allocation, where SHA-256 of the worst show's ~800 KB gallery is
 * ~0.3 ms on a JVM with SHA intrinsics and likely several ms in a native image
 * without them, per poll per viewer.
 *
 * <p>Scoping the key by show means a deliberately crafted 32-bit hashCode
 * collision can only ever confuse that show's own artwork, never another
 * show's. A miss costs one SHA-256 and one decode check.
 */
@ApplicationScoped
public class ArtworkHashes {

  // ~45 shows x tens of images today. Clearing on overflow is crude but keeps
  // the memo bounded without a cache dependency; a refill is one SHA per image.
  static final int MAX_ENTRIES = 20_000;

  private record Key(String showSubdomain, int length, int stringHash) {
  }

  private static final Optional<String> NOT_INLINE = Optional.empty();

  private final ConcurrentHashMap<Key, Optional<String>> memo = new ConcurrentHashMap<>();

  /**
   * The content hash of {@code dataUri}, or empty when it is not a decodable
   * inline image (such values are left untouched in the response).
   */
  public Optional<String> hashOf(String showSubdomain, String dataUri) {
    if (!InlineArtwork.isCandidate(dataUri)) {
      return NOT_INLINE;
    }
    Key key = new Key(showSubdomain, dataUri.length(), dataUri.hashCode());
    Optional<String> cached = memo.get(key);
    if (cached != null) {
      return cached;
    }
    Optional<String> computed = InlineArtwork.parse(dataUri) == null ? NOT_INLINE : Optional.of(sha(dataUri));
    if (memo.size() >= MAX_ENTRIES) {
      memo.clear();
    }
    memo.put(key, computed);
    return computed;
  }

  int size() {
    return memo.size();
  }

  /** First 128 bits of SHA-256 over the whole data URI, as 32 hex chars. */
  static String sha(String dataUri) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(dataUri.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest, 0, 16);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }
}
