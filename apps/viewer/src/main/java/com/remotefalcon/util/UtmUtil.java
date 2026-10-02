package com.remotefalcon.util;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Issue #189: normalizes the first-party utm_source / utm_medium values the
 * viewer page reads from its own query string (never the Referer header) and
 * sends with the page-view ping. The UI applies the same rules
 * (apps/ui/src/views/pages/externalViewer/helpers/utmParams.js); this is the
 * server-side guard, since the mutation is public and anyone can call it.
 *
 * <p>Rules: trim, lowercase, turn whitespace runs into {@code _}, drop every
 * character outside {@code [a-z0-9_-]}, cap at {@link #MAX_LENGTH} chars, and
 * treat an empty result as absent (null) so untagged visits store no field.
 * The allowlist keeps attacker-supplied values from carrying spreadsheet
 * formulas (e.g. {@code =hyperlink(...)}) into the owner's stats export.
 */
public final class UtmUtil {

  public static final int MAX_LENGTH = 32;

  private static final Pattern WHITESPACE = Pattern.compile("\\s+");
  private static final Pattern DISALLOWED = Pattern.compile("[^a-z0-9_-]");

  private UtmUtil() {
  }

  public static String sanitize(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim().toLowerCase(Locale.ROOT);
    normalized = WHITESPACE.matcher(normalized).replaceAll("_");
    normalized = DISALLOWED.matcher(normalized).replaceAll("");
    if (normalized.length() > MAX_LENGTH) {
      normalized = normalized.substring(0, MAX_LENGTH);
    }
    return normalized.isEmpty() ? null : normalized;
  }
}
