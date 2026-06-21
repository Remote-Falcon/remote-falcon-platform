package com.remotefalcon.rules;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Vote;
import com.remotefalcon.library.quarkus.entity.Show;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for the individual enforcement rules (PRD-009, ADR-4). These run
 * locally — extracting the predicates into pure rules is what makes the viewer's
 * gating logic unit-testable without a database.
 */
class RulesTest {

  private static Show showWith(Preference preferences) {
    Show show = new Show();
    show.setShowSubdomain("test-show");
    show.setPreferences(preferences);
    show.setVotes(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    return show;
  }

  private static EvaluationContext ctx(Show show, String ip) {
    return new EvaluationContext(show, ip, null, null, null, null);
  }

  private static EvaluationContext ctx(Show show, String ip, Float lat, Float lon) {
    return new EvaluationContext(show, ip, null, lat, lon, null);
  }

  private static EvaluationContext ctxVotes(Show show, String ip, Long votesToday) {
    return new EvaluationContext(show, ip, null, null, null, votesToday);
  }

  // --- BlockedIpRule -------------------------------------------------------

  @Test
  void blockedIp_deniesNaughtyWhenIpOnList() {
    Preference p = new Preference();
    p.setBlockedViewerIps(new HashSet<>(List.of("1.2.3.4")));
    Decision d = new BlockedIpRule().evaluate(ctx(showWith(p), "1.2.3.4"));
    assertTrue(d.denied());
    assertEquals(StatusResponse.NAUGHTY.name(), d.reason());
  }

  @Test
  void blockedIp_allowsWhenIpNotOnList() {
    Preference p = new Preference();
    p.setBlockedViewerIps(new HashSet<>(List.of("9.9.9.9")));
    assertFalse(new BlockedIpRule().evaluate(ctx(showWith(p), "1.2.3.4")).denied());
  }

  @Test
  void blockedIp_allowsWhenListEmpty() {
    Preference p = new Preference();
    p.setBlockedViewerIps(new HashSet<>());
    assertFalse(new BlockedIpRule().evaluate(ctx(showWith(p), "1.2.3.4")).denied());
  }

  // --- AlreadyVotedRule ----------------------------------------------------

  @Test
  void alreadyVoted_skipsWhenCheckDisabled() {
    Preference p = new Preference();
    p.setCheckIfVoted(false);
    Show show = showWith(p);
    show.getVotes().add(Vote.builder().viewersVoted(new ArrayList<>(List.of("1.2.3.4"))).build());
    assertEquals(Decision.Outcome.SKIP, new AlreadyVotedRule().evaluate(ctx(show, "1.2.3.4")).outcome());
  }

  @Test
  void alreadyVoted_deniesWhenIpAlreadyVoted() {
    Preference p = new Preference();
    p.setCheckIfVoted(true);
    Show show = showWith(p);
    show.getVotes().add(Vote.builder().viewersVoted(new ArrayList<>(List.of("1.2.3.4"))).build());
    Decision d = new AlreadyVotedRule().evaluate(ctx(show, "1.2.3.4"));
    assertTrue(d.denied());
    assertEquals(StatusResponse.ALREADY_VOTED.name(), d.reason());
  }

  @Test
  void alreadyVoted_allowsWhenIpHasNotVoted() {
    Preference p = new Preference();
    p.setCheckIfVoted(true);
    Show show = showWith(p);
    show.getVotes().add(Vote.builder().viewersVoted(new ArrayList<>(List.of("9.9.9.9"))).build());
    assertFalse(new AlreadyVotedRule().evaluate(ctx(show, "1.2.3.4")).denied());
  }

  @Test
  void alreadyVoted_skipsWhenIpIsVotingExempt() {
    Preference p = new Preference();
    p.setCheckIfVoted(true);
    p.setVotingExemptIps(new HashSet<>(List.of("1.2.3.4")));
    Show show = showWith(p);
    show.getVotes().add(Vote.builder().viewersVoted(new ArrayList<>(List.of("1.2.3.4"))).build());
    assertEquals(Decision.Outcome.SKIP, new AlreadyVotedRule().evaluate(ctx(show, "1.2.3.4")).outcome());
  }

  // --- AlreadyRequestedRule ------------------------------------------------

  @Test
  void alreadyRequested_skipsWhenCheckDisabled() {
    Preference p = new Preference();
    p.setCheckIfRequested(false);
    Show show = showWith(p);
    show.getRequests().add(Request.builder().viewerRequested("1.2.3.4").build());
    assertEquals(Decision.Outcome.SKIP, new AlreadyRequestedRule().evaluate(ctx(show, "1.2.3.4")).outcome());
  }

  @Test
  void alreadyRequested_deniesWhenIpAlreadyRequested() {
    Preference p = new Preference();
    p.setCheckIfRequested(true);
    Show show = showWith(p);
    show.getRequests().add(Request.builder().viewerRequested("1.2.3.4").build());
    Decision d = new AlreadyRequestedRule().evaluate(ctx(show, "1.2.3.4"));
    assertTrue(d.denied());
    assertEquals(StatusResponse.ALREADY_REQUESTED.name(), d.reason());
  }

  // --- QueueFullRule (skip cases; full-queue behavior covered by integration) -

  @Test
  void queueFull_skipsWhenDepthNull() {
    Preference p = new Preference();
    p.setJukeboxDepth(null);
    assertEquals(Decision.Outcome.SKIP, new QueueFullRule().evaluate(ctx(showWith(p), "1.2.3.4")).outcome());
  }

  @Test
  void queueFull_skipsWhenDepthZero() {
    Preference p = new Preference();
    p.setJukeboxDepth(0);
    assertEquals(Decision.Outcome.SKIP, new QueueFullRule().evaluate(ctx(showWith(p), "1.2.3.4")).outcome());
  }

  // --- DailyVoteLimitRule --------------------------------------------------

  @Test
  void dailyVoteLimit_skipsWhenNoLimitConfigured() {
    Preference p = new Preference();
    p.setDailyVoteLimit(null);
    assertEquals(Decision.Outcome.SKIP, new DailyVoteLimitRule().evaluate(ctxVotes(showWith(p), "1.2.3.4", 7L)).outcome());
  }

  @Test
  void dailyVoteLimit_skipsWhenLimitZero() {
    Preference p = new Preference();
    p.setDailyVoteLimit(0);
    assertEquals(Decision.Outcome.SKIP, new DailyVoteLimitRule().evaluate(ctxVotes(showWith(p), "1.2.3.4", 7L)).outcome());
  }

  @Test
  void dailyVoteLimit_skipsWhenCountNotSupplied() {
    Preference p = new Preference();
    p.setDailyVoteLimit(5);
    assertEquals(Decision.Outcome.SKIP, new DailyVoteLimitRule().evaluate(ctxVotes(showWith(p), "1.2.3.4", null)).outcome());
  }

  @Test
  void dailyVoteLimit_allowsWhenUnderLimit() {
    Preference p = new Preference();
    p.setDailyVoteLimit(5);
    assertFalse(new DailyVoteLimitRule().evaluate(ctxVotes(showWith(p), "1.2.3.4", 4L)).denied());
  }

  @Test
  void dailyVoteLimit_deniesWhenAtOrOverLimit() {
    Preference p = new Preference();
    p.setDailyVoteLimit(5);
    Decision d = new DailyVoteLimitRule().evaluate(ctxVotes(showWith(p), "1.2.3.4", 5L));
    assertTrue(d.denied());
    assertEquals(StatusResponse.DAILY_VOTE_LIMIT_REACHED.name(), d.reason());
  }

  @Test
  void dailyVoteLimit_skipsWhenIpIsVotingExempt() {
    Preference p = new Preference();
    p.setDailyVoteLimit(5);
    p.setVotingExemptIps(new HashSet<>(List.of("1.2.3.4")));
    assertEquals(Decision.Outcome.SKIP,
        new DailyVoteLimitRule().evaluate(ctxVotes(showWith(p), "1.2.3.4", 10L)).outcome());
  }

  // --- GeofenceRule --------------------------------------------------------

  @Test
  void geofence_skipsWhenNotGeo() {
    Preference p = new Preference();
    p.setLocationCheckMethod(LocationCheckMethod.NONE);
    assertEquals(Decision.Outcome.SKIP,
        new GeofenceRule().evaluate(ctx(showWith(p), "1.2.3.4", 40.7128f, -74.0060f)).outcome());
  }

  @Test
  void geofence_deniesWhenCoordinatesMissing() {
    Decision d = new GeofenceRule().evaluate(ctx(showWith(geoPrefs()), "1.2.3.4", null, null));
    assertTrue(d.denied());
    assertEquals(StatusResponse.INVALID_LOCATION.name(), d.reason());
  }

  @Test
  void geofence_allowsWithinRadius() {
    assertFalse(new GeofenceRule().evaluate(ctx(showWith(geoPrefs()), "1.2.3.4", 40.7128f, -74.0060f)).denied());
  }

  @Test
  void geofence_deniesOutsideRadius() {
    Decision d = new GeofenceRule().evaluate(ctx(showWith(geoPrefs()), "1.2.3.4", 51.5074f, -0.1278f));
    assertTrue(d.denied());
    assertEquals(StatusResponse.INVALID_LOCATION.name(), d.reason());
  }

  private static Preference geoPrefs() {
    Preference p = new Preference();
    p.setLocationCheckMethod(LocationCheckMethod.GEO);
    p.setShowLatitude(40.7128f);
    p.setShowLongitude(-74.0060f);
    p.setAllowedRadius(0.1f);
    return p;
  }
}
