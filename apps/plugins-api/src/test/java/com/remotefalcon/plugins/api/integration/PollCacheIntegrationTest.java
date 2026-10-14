package com.remotefalcon.plugins.api.integration;

import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.Vote;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.cache.EmptyPollCache;
import com.remotefalcon.plugins.api.cache.UnknownTokenCache;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.mockito.InjectSpy;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Season-resilience P1-4: the per-pod negative token cache and the
 * empty-queue short-circuit for the two plugin poll endpoints.
 *
 * <p>Tests write the queue straight to Mongo, the same way the viewer and
 * control-panel do from other services. Those writes are invisible to this
 * pod's caches, which is exactly the staleness the empty-poll TTL bounds.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class PollCacheIntegrationTest {

  private static final String TOKEN = "poll-cache-token";
  private static final String ROTATED_TOKEN = "poll-cache-token-rotated";
  private static final String UNKNOWN_TOKEN = "poll-cache-unknown-token";
  private static final String BASE_PATH = "/remote-falcon-plugins-api";

  // The plugin fetches in the last requestFetchTime (3s) of a song. A request
  // queued elsewhere must reach a polling plugin inside that window.
  private static final long REQUEST_FETCH_TIME_MS = 3000;

  @InjectSpy
  ShowRepository showRepository;

  @Inject
  EmptyPollCache emptyPollCache;

  @Inject
  UnknownTokenCache unknownTokenCache;

  @BeforeAll
  static void setupRestAssured() {
    RestAssured.basePath = BASE_PATH;
  }

  @BeforeEach
  void setUp() {
    deleteShows();
    emptyPollCache.clear();
    unknownTokenCache.clear();
    showRepository.persist(createShow(TOKEN));
    clearInvocations(showRepository);
  }

  @AfterEach
  void tearDown() {
    deleteShows();
    emptyPollCache.clear();
    unknownTokenCache.clear();
  }

  // ---- negative token cache ----

  @Test
  void unknownTokenIsCachedAndSkipsTheDatabaseOnRepeat() {
    getNext(UNKNOWN_TOKEN).then().statusCode(404);
    getNext(UNKNOWN_TOKEN).then().statusCode(404);
    postHeartbeat(UNKNOWN_TOKEN).then().statusCode(404);

    verify(showRepository, times(1)).findPollStateByShowToken(UNKNOWN_TOKEN);
    verify(showRepository, never()).findByShowToken(UNKNOWN_TOKEN);
    verify(showRepository, never()).findHeartbeatSliceByShowToken(UNKNOWN_TOKEN);
  }

  @Test
  void unknownTokenOnNonPollPathIsCachedToo() {
    postHeartbeat(UNKNOWN_TOKEN).then().statusCode(404);
    given().header("remotetoken", UNKNOWN_TOKEN).get("/remotePreferences").then().statusCode(404);

    verify(showRepository, times(1)).findHeartbeatSliceByShowToken(UNKNOWN_TOKEN);
    verify(showRepository, never()).findByShowToken(UNKNOWN_TOKEN);
  }

  @Test
  void validTokenIsNeverNegativelyCached() {
    getNext(TOKEN).then().statusCode(200);
    postHeartbeat(TOKEN).then().statusCode(204);
    given().header("remotetoken", TOKEN).get("/remotePreferences").then().statusCode(200);

    assertFalse(unknownTokenCache.isUnknown(TOKEN));
  }

  @Test
  void rotatedTokenWorksImmediatelyAndOldTokenIsRejected() {
    getNext(TOKEN).then().statusCode(200);

    // control-panel's rotateShowToken: same doc, new token, saved before the
    // operator can ever paste it into the plugin.
    Show show = showRepository.findByShowToken(TOKEN).orElseThrow();
    show.setShowToken(ROTATED_TOKEN);
    showRepository.update(show);

    getNext(ROTATED_TOKEN).then().statusCode(200);
    given().header("remotetoken", ROTATED_TOKEN).get("/remotePreferences").then().statusCode(200);
    assertFalse(unknownTokenCache.isUnknown(ROTATED_TOKEN));

    // The old token may serve one cached "empty" answer for up to the empty
    // TTL (harmless: it never dequeues), then 404s once that lapses.
    emptyPollCache.clear();
    getNext(TOKEN).then().statusCode(404);
    assertTrue(unknownTokenCache.isUnknown(TOKEN));
  }

  // ---- empty-queue short-circuit: /nextPlaylistInQueue ----

  @Test
  void emptyQueuePollNeverLoadsTheShow() {
    getNext(TOKEN).then().statusCode(200)
        .body("nextPlaylist", nullValue())
        .body("playlistIndex", equalTo(-1));

    verify(showRepository, times(1)).findPollStateByShowToken(TOKEN);
    verify(showRepository, never()).findByShowToken(anyString());
  }

  @Test
  void repeatEmptyPollIsServedFromThePodCache() {
    getNext(TOKEN).then().statusCode(200).body("playlistIndex", equalTo(-1));
    getNext(TOKEN).then().statusCode(200).body("playlistIndex", equalTo(-1));
    getNext(TOKEN).then().statusCode(200).body("playlistIndex", equalTo(-1));

    verify(showRepository, times(1)).findPollStateByShowToken(TOKEN);
    verify(showRepository, never()).findByShowToken(anyString());
  }

  @Test
  void requestQueuedElsewhereIsDeliveredWithinRequestFetchTime() throws InterruptedException {
    getNext(TOKEN).then().statusCode(200).body("playlistIndex", equalTo(-1));

    // Viewer adds a request on another service; this pod's cache can't see it.
    Show show = showRepository.findByShowToken(TOKEN).orElseThrow();
    Sequence wanted = show.getSequences().get(1);
    show.getRequests().add(Request.builder().position(1).sequence(wanted).build());
    showRepository.update(show);
    long queuedAt = System.currentTimeMillis();

    String delivered = null;
    while (delivered == null && System.currentTimeMillis() - queuedAt < REQUEST_FETCH_TIME_MS + 1000) {
      delivered = getNext(TOKEN).then().statusCode(200).extract().path("nextPlaylist");
      if (delivered == null) {
        Thread.sleep(200);
      }
    }
    long latency = System.currentTimeMillis() - queuedAt;

    assertEquals(wanted.getName(), delivered);
    assertTrue(latency < REQUEST_FETCH_TIME_MS,
        "a queued request must reach a polling plugin inside requestFetchTime, took " + latency + "ms");
    assertTrue(showRepository.findByShowToken(TOKEN).orElseThrow().getRequests().isEmpty());
  }

  @Test
  void updateQueueTrueDequeuesEachRequestExactlyOnceInOrder() {
    Show show = showRepository.findByShowToken(TOKEN).orElseThrow();
    Sequence first = show.getSequences().get(0);
    Sequence second = show.getSequences().get(1);
    show.getRequests().add(Request.builder().position(2).sequence(second).build());
    show.getRequests().add(Request.builder().position(1).sequence(first).build());
    showRepository.update(show);

    getNextUpdateQueue().then().statusCode(200).body("nextPlaylist", equalTo(first.getName()));
    getNextUpdateQueue().then().statusCode(200).body("nextPlaylist", equalTo(second.getName()));
    getNextUpdateQueue().then().statusCode(200)
        .body("nextPlaylist", nullValue())
        .body("playlistIndex", equalTo(-1));
    getNextUpdateQueue().then().statusCode(200).body("nextPlaylist", nullValue());

    assertTrue(showRepository.findByShowToken(TOKEN).orElseThrow().getRequests().isEmpty());
  }

  @Test
  void nonEmptyQueueNeverConsultsOrPopulatesTheEmptyCache() {
    Show show = showRepository.findByShowToken(TOKEN).orElseThrow();
    show.getRequests().add(Request.builder().position(1).sequence(show.getSequences().get(0)).build());
    showRepository.update(show);

    getNext(TOKEN).then().statusCode(200).body("nextPlaylist", equalTo(show.getSequences().get(0).getName()));

    assertFalse(emptyPollCache.isEmpty(EmptyPollCache.PollKind.NEXT_IN_QUEUE, TOKEN),
        "a dequeue must not mark the queue empty; the next poll re-checks the DB");
  }

  @Test
  void nonPollCallInvalidatesThePodCache() {
    getNext(TOKEN).then().statusCode(200).body("playlistIndex", equalTo(-1));
    assertTrue(emptyPollCache.isEmpty(EmptyPollCache.PollKind.NEXT_IN_QUEUE, TOKEN));

    // Any non-poll plugin call can write requests/votes in this pod
    // (updateWhatsPlaying injects managed PSAs), so it drops the entries.
    given().header("remotetoken", TOKEN).get("/remotePreferences").then().statusCode(200);

    assertFalse(emptyPollCache.isEmpty(EmptyPollCache.PollKind.NEXT_IN_QUEUE, TOKEN));
  }

  // ---- empty-queue short-circuit: /highestVotedPlaylist ----

  @Test
  void noVotesPollNeverLoadsTheShowAndIsCached() {
    getHighestVoted().then().statusCode(200)
        .body("winningPlaylist", nullValue())
        .body("playlistIndex", equalTo(-1));
    getHighestVoted().then().statusCode(200).body("playlistIndex", equalTo(-1));

    verify(showRepository, times(1)).findPollStateByShowToken(TOKEN);
    verify(showRepository, never()).findByShowToken(anyString());
  }

  @Test
  void voteCastElsewhereIsDeliveredWithinRequestFetchTime() throws InterruptedException {
    getHighestVoted().then().statusCode(200).body("playlistIndex", equalTo(-1));

    Show show = showRepository.findByShowToken(TOKEN).orElseThrow();
    Sequence wanted = show.getSequences().get(0);
    show.getVotes().add(Vote.builder().sequence(wanted).votes(1).lastVoteTime(LocalDateTime.now()).build());
    showRepository.update(show);
    long votedAt = System.currentTimeMillis();

    String winner = null;
    while (winner == null && System.currentTimeMillis() - votedAt < REQUEST_FETCH_TIME_MS + 1000) {
      winner = getHighestVoted().then().statusCode(200).extract().path("winningPlaylist");
      if (winner == null) {
        Thread.sleep(200);
      }
    }
    long latency = System.currentTimeMillis() - votedAt;

    assertEquals(wanted.getName(), winner);
    assertTrue(latency < REQUEST_FETCH_TIME_MS,
        "a vote must reach a polling plugin inside requestFetchTime, took " + latency + "ms");
  }

  @Test
  void emptyRequestsDoNotMaskPendingVotesAndViceVersa() {
    Show show = showRepository.findByShowToken(TOKEN).orElseThrow();
    Sequence voted = show.getSequences().get(0);
    show.getVotes().add(Vote.builder().sequence(voted).votes(3).lastVoteTime(LocalDateTime.now()).build());
    showRepository.update(show);

    // Queue empty, votes present: the requests answer must not leak into votes.
    getNext(TOKEN).then().statusCode(200).body("playlistIndex", equalTo(-1));
    getHighestVoted().then().statusCode(200).body("winningPlaylist", equalTo(voted.getName()));
  }

  // ---- helpers ----

  private io.restassured.response.Response getNext(String token) {
    return given().header("remotetoken", token).when().get("/nextPlaylistInQueue");
  }

  private io.restassured.response.Response getNextUpdateQueue() {
    return given().header("remotetoken", TOKEN).queryParam("updateQueue", "true")
        .when().get("/nextPlaylistInQueue");
  }

  private io.restassured.response.Response getHighestVoted() {
    return given().header("remotetoken", TOKEN).when().get("/highestVotedPlaylist");
  }

  private io.restassured.response.Response postHeartbeat(String token) {
    return given().header("remotetoken", token).contentType("application/json").body("{}")
        .when().post("/fppHeartbeat");
  }

  private void deleteShows() {
    for (String token : List.of(TOKEN, ROTATED_TOKEN, UNKNOWN_TOKEN)) {
      Show.mongoCollection().deleteMany(com.mongodb.client.model.Filters.eq("showToken", token));
    }
  }

  private Show createShow(String token) {
    List<Sequence> sequences = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      sequences.add(Sequence.builder()
          .name("poll-seq-" + i)
          .displayName("Poll Seq " + i)
          .index(i)
          .order(i)
          .active(true)
          .visible(true)
          .visibilityCount(0)
          .type("SEQUENCE")
          .build());
    }
    Show show = new Show();
    show.setShowToken(token);
    show.setShowName("Poll Cache Show");
    show.setShowSubdomain("poll-cache-show");
    show.setSequences(sequences);
    show.setSequenceGroups(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setStats(Stat.builder()
        .jukebox(new ArrayList<>())
        .voting(new ArrayList<>())
        .votingWin(new ArrayList<>())
        .page(new ArrayList<>())
        .build());
    show.setPlayingNow("");
    show.setPlayingNext("");
    show.setPlayingNextFromSchedule("");
    show.setPreferences(Preference.builder()
        .viewerControlEnabled(true)
        .viewerControlMode(ViewerControlMode.JUKEBOX)
        .hideSequenceCount(0)
        .managePsa(false)
        .psaEnabled(false)
        .psaFrequency(3)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build());
    return show;
  }
}
