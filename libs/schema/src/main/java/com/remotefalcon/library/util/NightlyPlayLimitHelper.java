package com.remotefalcon.library.util;

import com.remotefalcon.library.models.Category;
import com.remotefalcon.library.models.Sequence;

import java.util.List;

/**
 * Resolves the nightly play limit that applies to a given song (#177).
 *
 * <p>The limit started life show-wide (#163) and all-or-nothing. Operators
 * wanted to cap most of the show while leaving a handful of crowd favourites
 * uncapped, so a category may now carry its own limit:
 *
 * <ul>
 *   <li>{@code null} — inherit the show's limit (the default, and what every
 *       existing category reads as)</li>
 *   <li>{@code 0} — never capped, however high the show's limit is</li>
 *   <li>{@code > 0} — this category's own limit, overriding the show's</li>
 * </ul>
 *
 * <p>Zero means "no cap" on both the category and the show preference, so the
 * two are consistent rather than inverted.
 *
 * <p>Three call sites decide whether a song is capped — the plugin's play
 * selection, the viewer's request/vote rejection, and the viewer page's
 * gray-out. They must agree, or a viewer sees a song they can't actually
 * request (or requests one that is then silently skipped). This class is the
 * one definition they share; the JS gray-out mirrors the same matrix and is
 * pinned by an equivalent test.
 */
public final class NightlyPlayLimitHelper {

  private NightlyPlayLimitHelper() {
  }

  /**
   * The limit in force for a song in {@code sequenceCategory}, or null when no
   * limit applies. A category override wins over the show's limit, including
   * an explicit 0 to exempt the category.
   */
  public static Integer effectiveLimit(Integer showLimit, String sequenceCategory, List<Category> categories) {
    if (sequenceCategory != null && !sequenceCategory.isBlank() && categories != null) {
      for (Category category : categories) {
        if (category == null || category.getName() == null) {
          continue;
        }
        if (category.getName().equalsIgnoreCase(sequenceCategory)) {
          // A null override means "inherit", so fall through to the show
          // limit rather than treating the category as uncapped.
          return category.getNightlyPlayLimit() != null ? category.getNightlyPlayLimit() : showLimit;
        }
      }
    }
    // No category, or a category that no longer exists: behave exactly as
    // before this feature existed.
    return showLimit;
  }

  /** True when {@code sequence} has reached the limit that applies to it. */
  public static boolean isCapped(Sequence sequence, Integer showLimit, List<Category> categories) {
    if (sequence == null) {
      return false;
    }
    Integer limit = effectiveLimit(showLimit, sequence.getCategory(), categories);
    if (limit == null || limit <= 0) {
      return false;
    }
    Integer playsToday = sequence.getPlaysToday();
    return playsToday != null && playsToday >= limit;
  }

  /**
   * True when any limit could apply anywhere in the show.
   *
   * <p>Callers use this to skip the per-song work entirely. It exists because
   * a show-level limit of 0/null no longer proves nothing is capped: a
   * category may set its own limit while the show sets none.
   */
  public static boolean anyLimitActive(Integer showLimit, List<Category> categories) {
    if (showLimit != null && showLimit > 0) {
      return true;
    }
    if (categories == null) {
      return false;
    }
    for (Category category : categories) {
      if (category != null && category.getNightlyPlayLimit() != null && category.getNightlyPlayLimit() > 0) {
        return true;
      }
    }
    return false;
  }
}
