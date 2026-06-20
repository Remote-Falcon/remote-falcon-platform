package com.remotefalcon.entity;

import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.Month;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Unit tests for the pure {@link VoteEvent} factory logic (ADR-1 / ADR-5):
 * UTC stamping, per-doc expiry from the retention window, and coarse geo.
 */
class VoteEventTest {

  private static final ObjectId SHOW_ID = new ObjectId();

  @Test
  void of_stampsVotedAtAndComputesExpireFromRetentionWindow() {
    LocalDateTime now = LocalDateTime.of(2026, Month.OCTOBER, 1, 20, 0, 0);

    VoteEvent e = VoteEvent.of(SHOW_ID, "1.2.3.4", "vid-1", "Wizards In Winter",
        40.123456f, -74.987654f, now, 90L);

    assertEquals(SHOW_ID, e.getShowId());
    assertEquals("1.2.3.4", e.getIp());
    assertEquals("vid-1", e.getViewerId());
    assertEquals("Wizards In Winter", e.getSequenceName());
    assertEquals(now, e.getVotedAt());
    assertEquals(now.plusDays(90L), e.getExpireAt());
  }

  @Test
  void of_expireWindowHonorsRetentionDaysArgument() {
    LocalDateTime now = LocalDateTime.of(2026, Month.OCTOBER, 1, 20, 0, 0);

    // A paid tier could pass a longer window (ADR-5) — expireAt must follow it.
    VoteEvent e = VoteEvent.of(SHOW_ID, "1.2.3.4", null, "Seq", null, null, now, 365L);

    assertEquals(now.plusDays(365L), e.getExpireAt());
  }

  @Test
  void of_coarsensGeoToTwoDecimals() {
    VoteEvent e = VoteEvent.of(SHOW_ID, "1.2.3.4", null, "Seq",
        40.123456f, -74.987654f, LocalDateTime.now(), 90L);

    assertEquals(40.12, e.getLatitude(), 1e-9);
    assertEquals(-74.99, e.getLongitude(), 1e-9);
  }

  @Test
  void of_geoIsNullSafe() {
    VoteEvent e = VoteEvent.of(SHOW_ID, "1.2.3.4", null, "Seq",
        null, null, LocalDateTime.now(), 90L);

    assertNull(e.getLatitude());
    assertNull(e.getLongitude());
  }

  @Test
  void coarsen_roundsToNearestHundredthAndIsNullSafe() {
    assertEquals(12.35, VoteEvent.coarsen(12.3456f), 1e-9);
    assertEquals(-0.13, VoteEvent.coarsen(-0.1289f), 1e-9);
    assertNull(VoteEvent.coarsen(null));
  }
}
