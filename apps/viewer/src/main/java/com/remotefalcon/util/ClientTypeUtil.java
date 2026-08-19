package com.remotefalcon.util;

import io.vertx.core.http.HttpServerRequest;
import io.vertx.ext.web.RoutingContext;

/**
 * PRD-019 — classifies the requesting client from its {@code User-Agent}.
 *
 * Exists to split one specific slice out of {@code INVALID_LOCATION}. Measured
 * 2026-08-10 across 31 GPS-gated shows: the Facebook in-app browser rejects
 * <b>88.2%</b> of the time and accounts for a third of every rejection on the
 * platform, while ordinary Chrome on Android rejected 0 of 45 attempts in the
 * same window. It is the webview, not the OS.
 *
 * <p>The cause is structural: an in-app webview inherits location permission
 * from its <b>host app</b>, not from the page. If the Facebook app lacks OS
 * location permission, nothing the viewer page renders can grant it. Operators
 * post show links on Facebook and viewers open them in-app, so the distribution
 * channel is the failure mode.
 *
 * <p>Splitting it server-side costs nothing — the User-Agent is already on the
 * request — and it is the half of the cause breakdown that needs no client
 * change. Separating permission-denied from genuinely-out-of-range is the other
 * half, and only the browser knows that.
 *
 * <p>This identifies the client, <b>not</b> whether the host app holds OS
 * location permission. Treat it as a population label, not a verdict.
 */
public final class ClientTypeUtil {

  private ClientTypeUtil() {
  }

  /** Facebook's Android ({@code FB_IAB}/{@code FB4A}) and iOS ({@code FBAN}/{@code FBIOS}) webviews. */
  private static final String[] FACEBOOK_MARKERS = {"FB_IAB", "FB4A", "FBAN", "FBAV", "FBIOS"};

  public static boolean isInAppBrowser(RoutingContext context) {
    return isInAppBrowser(userAgent(context));
  }

  public static boolean isInAppBrowser(String userAgent) {
    if (userAgent == null || userAgent.isEmpty()) {
      return false;
    }
    for (String marker : FACEBOOK_MARKERS) {
      if (userAgent.contains(marker)) {
        return true;
      }
    }
    return userAgent.contains("Instagram");
  }

  public static String userAgent(RoutingContext context) {
    if (context == null) {
      return null;
    }
    HttpServerRequest request = context.request();
    return request == null ? null : request.getHeader("User-Agent");
  }
}
