package com.remotefalcon.util;

import com.remotefalcon.library.enums.StatusResponse;

/**
 * PRD-019 — narrows the reason recorded on the operator's conversion funnel.
 *
 * {@code INVALID_LOCATION} conflates three very different situations and
 * operators cannot act on the blend. Measured across 31 GPS-gated shows,
 * 94.8% of rejected viewers were within 25km of that same show's OWN successful
 * viewers, so "too far away" is the wrong read in the large majority of cases —
 * and the funnel's hint used to tell operators to widen their geofence, which
 * weakens the safeguard and fixes nothing.
 *
 * <p>Pure and static so the classification is testable without standing up a
 * request context. The caller supplies the two facts it has: whether the client
 * is an in-app webview (from the User-Agent) and what the browser reported
 * about its own location permission.
 *
 * <p>These values are recorded ONLY. They are never thrown to a client, which
 * is why they are not {@link StatusResponse} members — putting them in the enum
 * would imply a client contract that does not exist.
 */
public final class RejectionReason {

  private RejectionReason() {
  }

  /** Rejected inside a Facebook/Instagram webview, where permission belongs to the host app. */
  public static final String INVALID_LOCATION_IN_APP = "INVALID_LOCATION_IN_APP";

  /** Rejected because the browser never handed over a location. */
  public static final String INVALID_LOCATION_PERMISSION = "INVALID_LOCATION_PERMISSION";

  /** The one client-reported permission state meaning "a real fix was obtained". */
  private static final String GRANTED = "granted";

  /**
   * @param reason             the reason the rule chain actually denied on
   * @param inAppBrowser       whether the request came from an in-app webview
   * @param locationPermission browser-reported permission, or null if unreported
   *                           (REST callers, or a client predating this field)
   */
  public static String forStat(String reason, boolean inAppBrowser, String locationPermission) {
    if (!StatusResponse.INVALID_LOCATION.name().equals(reason)) {
      return reason;
    }
    // In-app wins, deliberately. It is the more actionable finding — no show
    // setting can fix it — and an in-app viewer is very likely ALSO reporting a
    // non-granted permission, since the host app is what withheld it. Checking
    // permission first would hide the segment behind the generic bucket.
    if (inAppBrowser) {
      return INVALID_LOCATION_IN_APP;
    }
    // Untrusted (client-supplied), and that is fine: it only labels a stat. It
    // is never consulted by GeofenceRule, so a forged value cannot get anyone
    // past the geofence — only miscategorise that viewer's own rejection.
    if (locationPermission != null && !GRANTED.equals(locationPermission)) {
      return INVALID_LOCATION_PERMISSION;
    }
    // Location was shared (or went unreported) and the viewer was still outside
    // the radius. The one bucket where widening the radius is the right advice —
    // or where the show's own coordinates are wrong.
    return reason;
  }
}
