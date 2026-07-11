package com.remotefalcon.rules;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.GpsLocation;
import com.remotefalcon.util.LocationUtil;
import org.jboss.logging.Logger;

import java.util.List;

/**
 * When the show uses GPS gating ({@code locationCheckMethod == GEO}), denies a
 * viewer outside the allowed radius (or with missing coordinates). Skips when
 * GPS gating is off. A viewer is allowed if within {@code allowedRadius} of the
 * primary location OR any of {@code additionalGpsLocations} (#16).
 */
public final class GeofenceRule implements Rule {
  private static final Logger LOG = Logger.getLogger(GeofenceRule.class);

  @Override
  public Decision evaluate(EvaluationContext ctx) {
    var preferences = ctx.show().getPreferences();
    if (preferences.getLocationCheckMethod() != LocationCheckMethod.GEO) {
      return Decision.skip();
    }
    if (ctx.latitude() == null || ctx.longitude() == null) {
      return Decision.deny(StatusResponse.INVALID_LOCATION.name());
    }
    if (preferences.getAllowedRadius() == null) {
      LOG.errorf("GPS check enabled but allowedRadius is null for show: %s", ctx.show().getShowSubdomain());
      return Decision.deny(StatusResponse.INVALID_LOCATION.name());
    }
    Float radius = preferences.getAllowedRadius();
    if (within(preferences.getShowLatitude(), preferences.getShowLongitude(), radius, ctx.latitude(), ctx.longitude())) {
      return Decision.allow();
    }
    List<GpsLocation> additional = preferences.getAdditionalGpsLocations();
    if (additional != null) {
      for (GpsLocation location : additional) {
        if (within(location.getLatitude(), location.getLongitude(), radius, ctx.latitude(), ctx.longitude())) {
          return Decision.allow();
        }
      }
    }
    return Decision.deny(StatusResponse.INVALID_LOCATION.name());
  }

  /** True when the viewer point is within {@code radius} miles of the center. Null-center safe. */
  private static boolean within(Float centerLat, Float centerLon, Float radius, Float lat, Float lon) {
    if (centerLat == null || centerLon == null) {
      return false;
    }
    return LocationUtil.asTheCrowFlies(centerLat, centerLon, lat, lon) <= radius;
  }
}
