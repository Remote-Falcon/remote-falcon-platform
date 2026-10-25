package com.remotefalcon.plugins.api.integration;

import com.remotefalcon.library.models.HeartbeatGap;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import org.bson.BsonDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Season Capacity Plan R3: heartbeat write coalescing. The plugin beats every
 * ~30s; the Show document is only rewritten when the stored lastFppHeartbeat
 * is at least 120s old, and a normal beat is a bare {@code $set} (no per-beat
 * {@code $pull} over heartbeatGaps). Pruning happens only when a new gap is
 * pushed.
 *
 * <p>Goes through REST so ShowTokenFilter's heartbeat fast path
 * (findHeartbeatSliceByShowToken) is exercised, not just the service.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class FppHeartbeatCoalesceIntegrationTest {

  private static final String TOKEN = "heartbeat-coalesce-token";
  private static final String BASE_PATH = "/remote-falcon-plugins-api";

  @Inject
  ShowRepository showRepository;

  @Inject
  RecordingUpdateListener updates;

  @BeforeAll
  static void setupRestAssured() {
    RestAssured.basePath = BASE_PATH;
  }

  @AfterEach
  void tearDown() {
    deleteTestShow();
  }

  @Test
  void beatWithin120s_doesNotWrite() {
    LocalDateTime seeded = LocalDateTime.now().minusSeconds(60).truncatedTo(ChronoUnit.MILLIS);
    seedShow(seeded, new ArrayList<>());
    updates.clear();

    postHeartbeat();

    assertTrue(showUpdatesForTest().isEmpty(),
        "a beat 60s after the last write must not touch the Show document, got " + showUpdatesForTest());
    assertEquals(seeded, reload().getLastFppHeartbeat());
  }

  @Test
  void beatAfter120s_writesLastHeartbeat_withoutPull() {
    LocalDateTime seeded = LocalDateTime.now().minusSeconds(125);
    seedShow(seeded, new ArrayList<>(List.of(
        // Past retention: a normal beat must NOT be the one to prune it.
        gap(LocalDateTime.now().minusDays(40)))));
    updates.clear();

    postHeartbeat();

    Show after = reload();
    assertTrue(after.getLastFppHeartbeat().isAfter(LocalDateTime.now().minusSeconds(30)),
        "lastFppHeartbeat should advance to ~now");
    assertEquals(1, after.getHeartbeatGaps().size(),
        "a normal beat records no gap and prunes nothing");

    List<BsonDocument> sent = showUpdatesForTest();
    assertEquals(1, sent.size(), "a normal beat is exactly one write, got " + sent);
    BsonDocument update = sent.get(0);
    assertFalse(update.containsKey("$pull"), "no $pull on a normal beat: " + update);
    assertFalse(update.containsKey("$push"), "no $push on a normal beat: " + update);
    assertEquals(List.of("lastFppHeartbeat"), List.copyOf(update.getDocument("$set").keySet()));
  }

  @Test
  void realGap_recordsGap_andPrunesExpiredOnes() {
    LocalDateTime seeded = LocalDateTime.now().minusMinutes(30).truncatedTo(ChronoUnit.MILLIS);
    HeartbeatGap expired = gap(LocalDateTime.now().minusDays(40));
    HeartbeatGap recent = gap(LocalDateTime.now().minusDays(2));
    seedShow(seeded, new ArrayList<>(List.of(expired, recent)));
    updates.clear();

    postHeartbeat();

    Show after = reload();
    assertTrue(after.getLastFppHeartbeat().isAfter(LocalDateTime.now().minusSeconds(30)));
    List<HeartbeatGap> gaps = after.getHeartbeatGaps();
    assertEquals(2, gaps.size(), "expired gap pruned, recent kept, new one pushed: " + gaps);
    assertTrue(gaps.stream().noneMatch(g -> g.getEndedAt().isBefore(LocalDateTime.now().minusDays(30))),
        "the 40-day-old gap must be pruned when a new gap is pushed");
    HeartbeatGap newest = gaps.stream()
        .filter(g -> g.getStartedAt().equals(seeded))
        .findFirst()
        .orElseThrow(() -> new AssertionError("new gap should start at the previous heartbeat: " + gaps));
    assertTrue(newest.getEndedAt().isAfter(LocalDateTime.now().minusSeconds(30)));
  }

  @Test
  void firstEverBeat_writes_withoutGap() {
    seedShow(null, null);
    updates.clear();

    postHeartbeat();

    Show after = reload();
    assertTrue(after.getLastFppHeartbeat() != null
        && after.getLastFppHeartbeat().isAfter(LocalDateTime.now().minusSeconds(30)));
    assertTrue(after.getHeartbeatGaps() == null || after.getHeartbeatGaps().isEmpty());
    assertTrue(showUpdatesForTest().stream().noneMatch(u -> u.containsKey("$pull")));
  }

  private static HeartbeatGap gap(LocalDateTime endedAt) {
    return HeartbeatGap.builder().startedAt(endedAt.minusMinutes(10)).endedAt(endedAt).build();
  }

  private void seedShow(LocalDateTime lastFppHeartbeat, List<HeartbeatGap> gaps) {
    deleteTestShow();
    Show show = new Show();
    show.setShowToken(TOKEN);
    show.setShowSubdomain("heartbeat-coalesce");
    show.setShowName("Heartbeat Coalesce");
    show.setLastFppHeartbeat(lastFppHeartbeat);
    show.setHeartbeatGaps(gaps);
    showRepository.persist(show);
  }

  private void postHeartbeat() {
    given()
        .header("showtoken", TOKEN)
        .contentType("application/json")
        .when()
        .post("/fppHeartbeat")
        .then()
        .statusCode(204);
  }

  private Show reload() {
    // Unprojected read: the filter projection excludes heartbeatGaps by design.
    return showRepository.find("showToken", TOKEN).firstResult();
  }

  private List<BsonDocument> showUpdatesForTest() {
    // Only heartbeat writes are expected here; the listener is app-wide, so
    // keep the assertion scoped to updates that touch heartbeat fields.
    return updates.showUpdates().stream()
        .filter(u -> u.toJson().contains("lastFppHeartbeat") || u.toJson().contains("heartbeatGaps"))
        .toList();
  }

  private void deleteTestShow() {
    showRepository.delete("showToken", TOKEN);
  }
}
