package com.remotefalcon.rules;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.util.LocationUtil;
import org.jboss.logging.Logger;

/**
 * When the show uses GPS gating ({@code locationCheckMethod == GEO}), denies a
 * viewer outside the allowed radius (or with missing coordinates). Skips when
 * GPS gating is off. (#16 will extend this to multiple allowed locations.)
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
    Double distance = LocationUtil.asTheCrowFlies(
        preferences.getShowLatitude(),
        preferences.getShowLongitude(),
        ctx.latitude(),
        ctx.longitude());
    return distance <= preferences.getAllowedRadius()
        ? Decision.allow()
        : Decision.deny(StatusResponse.INVALID_LOCATION.name());
  }
}
