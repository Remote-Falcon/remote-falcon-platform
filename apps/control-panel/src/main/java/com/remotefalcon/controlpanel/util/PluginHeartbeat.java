package com.remotefalcon.controlpanel.util;

import java.time.LocalDateTime;

/**
 * The one control-panel definition of "the FPP plugin is connected" (Season
 * Prep S8b). The dashboard's {@code pluginConnected}, the pre-show checklist
 * and the FPP_HEALTH alert task all read it, so they can never disagree. The
 * UI used to keep its own copy of the threshold; it now reads the flag.
 */
public final class PluginHeartbeat {

  /**
   * A plugin is offline after this long without a stored heartbeat: 5 min of
   * real silence plus plugins-api's 120s heartbeat write floor (the stored
   * value trails the real last beat by up to ~150s). Must match plugins-api's
   * {@code HEARTBEAT_GAP_THRESHOLD_MINUTES}.
   */
  public static final long STALE_MINUTES = 7L;

  private PluginHeartbeat() {
  }

  /**
   * True when {@code lastFppHeartbeat} is strictly less than
   * {@link #STALE_MINUTES} old. Both values are zone-naive LocalDateTimes in
   * the pods' zone (UTC in prod), the same frame plugins-api writes and the
   * alert task compares in.
   */
  public static boolean isConnected(LocalDateTime lastFppHeartbeat, LocalDateTime now) {
    return lastFppHeartbeat != null && lastFppHeartbeat.isAfter(now.minusMinutes(STALE_MINUTES));
  }
}
