package com.remotefalcon.util;

import com.remotefalcon.library.enums.StatusResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PRD-019 — the three-way split of INVALID_LOCATION that lets an operator tell
 * a fixable permission problem from a geofence that genuinely needs widening.
 */
class RejectionReasonTest {

  private static final String INVALID_LOCATION = StatusResponse.INVALID_LOCATION.name();

  @Test
  @DisplayName("Leaves every other rejection reason untouched")
  void passesThroughUnrelatedReasons() {
    assertEquals("QUEUE_FULL", RejectionReason.forStat("QUEUE_FULL", true, "denied"));
    assertEquals("NAUGHTY", RejectionReason.forStat("NAUGHTY", false, "prompt"));
    assertEquals("ALREADY_REQUESTED", RejectionReason.forStat("ALREADY_REQUESTED", true, null));
  }

  @Test
  @DisplayName("In-app webview wins over permission — it is the more actionable finding")
  void inAppTakesPrecedence() {
    // An in-app viewer very likely ALSO reports a non-granted permission, since
    // the host app is what withheld it. Checking permission first would hide
    // this segment (a third of all rejections) inside the generic bucket.
    assertEquals(RejectionReason.INVALID_LOCATION_IN_APP,
        RejectionReason.forStat(INVALID_LOCATION, true, "denied"));
    assertEquals(RejectionReason.INVALID_LOCATION_IN_APP,
        RejectionReason.forStat(INVALID_LOCATION, true, "granted"));
  }

  @Test
  @DisplayName("A non-granted permission is recorded as a permission failure")
  void permissionFailure() {
    for (String state : new String[] {"denied", "prompt", "uncertain", "unsupported"}) {
      assertEquals(RejectionReason.INVALID_LOCATION_PERMISSION,
          RejectionReason.forStat(INVALID_LOCATION, false, state),
          "state=" + state);
    }
  }

  @Test
  @DisplayName("Granted and still rejected stays INVALID_LOCATION — the genuinely-out-of-range bucket")
  void grantedStaysGeneric() {
    // The one bucket where "loosen the radius" is correct advice, or where the
    // show's own coordinates are wrong.
    assertEquals(INVALID_LOCATION, RejectionReason.forStat(INVALID_LOCATION, false, "granted"));
  }

  @Test
  @DisplayName("An unreported permission does not get labelled a permission failure")
  void unreportedPermission() {
    // REST callers and any client predating the field send nothing. Guessing
    // "permission problem" there would inflate the bucket operators are meant
    // to act on with cases we know nothing about.
    assertEquals(INVALID_LOCATION, RejectionReason.forStat(INVALID_LOCATION, false, null));
  }
}
