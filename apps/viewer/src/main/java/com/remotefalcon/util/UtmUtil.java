package com.remotefalcon.util;

import java.util.Locale;

/**
 * Issue #189: normalizes the first-party utm_source / utm_medium values the
 * viewer page reads from its own query string (never the Referer header) and
 * sends with the page-view ping. The UI applies the same rules
 * (apps/ui/src/views/pages/externalViewer/helpers/utmParams.js); this is the
 * server-side guard, since the mutation is public and anyone can call it.
 *
 * <p>Rules: trim, lowercase, cap at {@link #MAX_LENGTH} chars, and treat a
 * blank value as absent (null) so untagged visits store no field at all.
 */
public final class UtmUtil {

  public static final int MAX_LENGTH = 32;

  private UtmUtil() {
  }

  public static String sanitize(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim().toLowerCase(Locale.ROOT);
    if (normalized.length() > MAX_LENGTH) {
      normalized = normalized.substring(0, MAX_LENGTH).trim();
    }
    return normalized.isEmpty() ? null : normalized;
  }
}
