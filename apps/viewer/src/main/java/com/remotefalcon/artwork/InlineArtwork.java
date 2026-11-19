package com.remotefalcon.artwork;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;

/**
 * A sequence artwork stored inline as an {@code data:image/...} URI (S2,
 * Season Prep R2). Pre-2026 FPP plugins copied embedded album art into
 * {@code imageUrl} this way; the viewer serves those bytes from
 * {@link ArtworkController} instead of re-sending them on every poll.
 */
public record InlineArtwork(String mediaType, byte[] bytes) {

  private static final String PREFIX = "data:image/";

  private static final Map<String, String> EXTENSIONS = Map.of(
      "image/png", "png",
      "image/jpeg", "jpg",
      "image/jpg", "jpg",
      "image/gif", "gif",
      "image/webp", "webp",
      "image/svg+xml", "svg",
      "image/avif", "avif",
      "image/bmp", "bmp",
      "image/x-icon", "ico",
      "image/vnd.microsoft.icon", "ico");

  /** Cheap prefix check, safe to run on every field of every poll. */
  public static boolean isCandidate(String value) {
    return value != null && value.regionMatches(true, 0, PREFIX, 0, PREFIX.length());
  }

  /**
   * Decodes an inline image data URI, or returns {@code null} when the value
   * is not one or cannot be decoded (those stay as they are in the response).
   */
  public static InlineArtwork parse(String value) {
    if (!isCandidate(value)) {
      return null;
    }
    int comma = value.indexOf(',');
    if (comma < 0) {
      return null;
    }
    String[] params = value.substring("data:".length(), comma).split(";");
    String mediaType = params[0].trim().toLowerCase(Locale.ROOT);
    if (mediaType.length() <= PREFIX.length() - "data:".length()) {
      return null;
    }
    boolean base64 = false;
    for (int i = 1; i < params.length; i++) {
      if ("base64".equalsIgnoreCase(params[i].trim())) {
        base64 = true;
      }
    }
    String payload = value.substring(comma + 1);
    if (base64 && !isStrictBase64(payload)) {
      return null;
    }
    try {
      byte[] bytes = base64
          ? Base64.getMimeDecoder().decode(payload)
          : URLDecoder.decode(payload.replace("+", "%2B"), StandardCharsets.UTF_8).getBytes(StandardCharsets.UTF_8);
      return new InlineArtwork(mediaType, bytes);
    } catch (IllegalArgumentException e) {
      return null;
    }
  }

  // The MIME decoder silently skips characters outside the base64 alphabet,
  // so "***" would decode to zero bytes. Reject anything but the alphabet,
  // padding and whitespace.
  private static boolean isStrictBase64(String payload) {
    boolean any = false;
    for (int i = 0; i < payload.length(); i++) {
      char c = payload.charAt(i);
      if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
          || c == '+' || c == '/') {
        any = true;
      } else if (c != '=' && !Character.isWhitespace(c)) {
        return false;
      }
    }
    return any;
  }

  /** File extension for the URL, so CDNs that cache by extension can cache it. */
  public String extension() {
    return extensionFor(mediaType);
  }

  static String extensionFor(String mediaType) {
    return EXTENSIONS.getOrDefault(mediaType, "img");
  }

  /** The lower-cased media type of an inline image data URI, without decoding it. */
  static String mediaTypeOf(String dataUri) {
    int end = dataUri.length();
    int semi = dataUri.indexOf(';');
    int comma = dataUri.indexOf(',');
    if (semi > 0) end = Math.min(end, semi);
    if (comma > 0) end = Math.min(end, comma);
    return dataUri.substring("data:".length(), end).trim().toLowerCase(Locale.ROOT);
  }
}
