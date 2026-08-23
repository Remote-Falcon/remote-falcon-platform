package com.remotefalcon.plugins.api.integration;

import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.model.ManagedPSARequest;
import com.remotefalcon.plugins.api.model.SyncPlaylistDetails;
import com.remotefalcon.plugins.api.model.SyncPlaylistRequest;
import com.remotefalcon.plugins.api.model.UpdateNextScheduledRequest;
import com.remotefalcon.plugins.api.model.UpdateWhatsPlayingRequest;
import com.remotefalcon.plugins.api.model.ViewerControlRequest;
import com.remotefalcon.plugins.api.model.PluginVersion;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-End Integration Tests for Plugin API Controller.
 * Tests verify the complete flow from REST API to database operations using atomic MongoDB updates.
 * Uses Testcontainers to provide a MongoDB instance.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PluginControllerIntegrationTest {

  @Inject
  ShowRepository showRepository;

  private static final String TEST_SHOW_TOKEN = "integration-test-token";
  private static final String BASE_PATH = "/remote-falcon-plugins-api";

  @BeforeAll
  static void setupRestAssured() {
    RestAssured.basePath = BASE_PATH;
  }

  @BeforeEach
  void setUp() {
    // Clean up any existing test data
    showRepository.findByShowToken(TEST_SHOW_TOKEN)
        .ifPresent(show -> showRepository.delete(show));

    // Create a fresh test show
    Show testShow = createTestShow();
    showRepository.persist(testShow);
  }

  @AfterEach
  void tearDown() {
    // Clean up test data after each test
    showRepository.findByShowToken(TEST_SHOW_TOKEN)
        .ifPresent(show -> showRepository.delete(show));
  }

  @Test
  @Order(1)
  @DisplayName("E2E: nextPlaylistInQueue - Returns next request and removes it from queue")
  void testNextPlaylistInQueue_Success() {
    // Add requests to the queue
    Show show = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    Sequence seq1 = show.getSequences().get(0);
    Sequence seq2 = show.getSequences().get(1);

    show.getRequests().add(Request.builder().position(2).sequence(seq1).build());
    show.getRequests().add(Request.builder().position(1).sequence(seq2).build());
    showRepository.update(show);

    // Get next playlist
    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(200)
        .body("nextPlaylist", equalTo(seq2.getName()))
        .body("playlistIndex", equalTo(seq2.getIndex()));

    // Verify request was removed from database
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertEquals(1, updatedShow.getRequests().size());
    assertEquals(seq1.getName(), updatedShow.getRequests().get(0).getSequence().getName());
  }

  @Test
  @Order(2)
  @DisplayName("E2E: nextPlaylistInQueue - Returns default when queue is empty")
  void testNextPlaylistInQueue_EmptyQueue() {
    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(200)
        .body("nextPlaylist", nullValue())
        .body("playlistIndex", equalTo(-1));
  }

  @Test
  @Order(3)
  @DisplayName("E2E: updatePlaylistQueue - Returns queue status")
  void testUpdatePlaylistQueue() {
    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .post("/updatePlaylistQueue")
        .then()
        .statusCode(200)
        .body("message", equalTo("Queue Empty"));

    // Add a request
    Show show = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    show.getRequests().add(Request.builder().position(1).sequence(show.getSequences().get(0)).build());
    showRepository.update(show);

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .post("/updatePlaylistQueue")
        .then()
        .statusCode(200)
        .body("message", equalTo("Success"));
  }

  @Test
  @Order(4)
  @DisplayName("E2E: syncPlaylists - Adds new sequences and marks missing as inactive")
  void testSyncPlaylists_Success() {
    SyncPlaylistRequest request = SyncPlaylistRequest.builder()
        .playlists(List.of(
            SyncPlaylistDetails.builder()
                .playlistName("New Song 1")
                .playlistDuration(180)
                .playlistIndex(10)
                .playlistType("SEQUENCE")
                .build(),
            SyncPlaylistDetails.builder()
                .playlistName("New Song 2")
                .playlistDuration(200)
                .playlistIndex(11)
                .playlistType("SEQUENCE")
                .build()
        ))
        .build();

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/syncPlaylists")
        .then()
        .statusCode(200)
        .body("message", equalTo("Success"));

    // Verify sequences were synced in database
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertTrue(updatedShow.getSequences().stream()
        .anyMatch(seq -> "New Song 1".equals(seq.getName()) && seq.getActive()));
    assertTrue(updatedShow.getSequences().stream()
        .anyMatch(seq -> "New Song 2".equals(seq.getName()) && seq.getActive()));

    // Old sequences should be marked inactive
    assertTrue(updatedShow.getSequences().stream()
        .filter(seq -> seq.getName().equals("Test Song 1") || seq.getName().equals("Test Song 2"))
        .allMatch(seq -> !seq.getActive()));
  }

  @Test
  @Order(5)
  @DisplayName("E2E: updateWhatsPlaying - Updates playing status and increments sequences played")
  void testUpdateWhatsPlaying_Success() {
    UpdateWhatsPlayingRequest request = UpdateWhatsPlayingRequest.builder()
        .playlist("Test Song 1")
        .build();

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateWhatsPlaying")
        .then()
        .statusCode(200)
        .body("currentPlaylist", equalTo("Test Song 1"));

    // Verify database was updated atomically
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertEquals("Test Song 1", updatedShow.getPlayingNow());
    assertEquals(1, updatedShow.getPreferences().getSequencesPlayed());
  }

  @Test
  @Order(6)
  @DisplayName("E2E: updateNextScheduledSequence - Updates scheduled sequence")
  void testUpdateNextScheduledSequence_Success() {
    UpdateNextScheduledRequest request = UpdateNextScheduledRequest.builder()
        .sequence("Test Song 2")
        .build();

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateNextScheduledSequence")
        .then()
        .statusCode(200)
        .body("nextScheduledSequence", equalTo("Test Song 2"));

    // Verify database was updated
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertEquals("Test Song 2", updatedShow.getPlayingNextFromSchedule());
  }

  @Test
  @Order(7)
  @DisplayName("E2E: viewerControlMode - Returns current viewer control mode")
  void testViewerControlMode() {
    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .get("/viewerControlMode")
        .then()
        .statusCode(200)
        .body("viewerControlMode", equalTo("jukebox"));
  }

  @Test
  @Order(8)
  @DisplayName("E2E: highestVotedPlaylist - Returns winning sequence and updates votes")
  void testHighestVotedPlaylist_Success() {
    // Add votes
    Show show = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    Sequence seq1 = show.getSequences().get(0);
    Sequence seq2 = show.getSequences().get(1);

    show.getVotes().add(Vote.builder()
        .sequence(seq1)
        .votes(5)
        .lastVoteTime(LocalDateTime.now())
        .ownerVoted(false)
        .build());
    show.getVotes().add(Vote.builder()
        .sequence(seq2)
        .votes(10)
        .lastVoteTime(LocalDateTime.now())
        .ownerVoted(false)
        .build());
    showRepository.update(show);

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .get("/highestVotedPlaylist")
        .then()
        .statusCode(200)
        .body("winningPlaylist", equalTo(seq2.getName()))
        .body("playlistIndex", equalTo(seq2.getIndex()));

    // Verify votes were updated in database
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertEquals(0, updatedShow.getVotes().size()); // Votes should be reset
  }

  @Test
  @Order(19)
  @DisplayName("E2E: highestVotedPlaylist - appends the win to stats.votingWin without rewriting history")
  void testHighestVotedPlaylist_appendsVotingWin_keepsExistingEntries() {
    // stats.votingWin is written as a $push of only this cycle's new wins
    // (not a whole-array $set) so a concurrent retention-sweep prune can't be
    // resurrected by a stale in-memory copy. This pins the observable half:
    // the pre-existing entry survives exactly once and the winner is appended.
    Show show = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    Sequence seq1 = show.getSequences().get(0);
    show.getStats().getVotingWin().add(Stat.VotingWin.builder()
        .name("Pre-Existing Win")
        .dateTime(LocalDateTime.now().minusDays(2))
        .build());
    show.getVotes().add(Vote.builder()
        .sequence(seq1)
        .votes(7)
        .lastVoteTime(LocalDateTime.now())
        .ownerVoted(false)
        .build());
    showRepository.update(show);

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .get("/highestVotedPlaylist")
        .then()
        .statusCode(200)
        .body("winningPlaylist", equalTo(seq1.getName()));

    List<Stat.VotingWin> wins = showRepository.findByShowToken(TEST_SHOW_TOKEN)
        .orElseThrow().getStats().getVotingWin();
    assertEquals(1, wins.stream().filter(w -> "Pre-Existing Win".equals(w.getName())).count(),
        "the pre-existing win must survive exactly once");
    assertEquals(1, wins.stream().filter(w -> seq1.getName().equals(w.getName())).count(),
        "the new win must be appended exactly once");
  }

  @Test
  @Order(9)
  @DisplayName("E2E: pluginVersion - Updates plugin and FPP versions")
  void testPluginVersion_Success() {
    PluginVersion request = PluginVersion.builder()
        .pluginVersion("2.0.0")
        .fppVersion("8.0")
        .build();

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/pluginVersion")
        .then()
        .statusCode(200)
        .body("message", equalTo("Success"));

    // Verify database was updated
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertEquals("2.0.0", updatedShow.getPluginVersion());
    assertEquals("8.0", updatedShow.getFppVersion());
  }

  @Test
  @Order(10)
  @DisplayName("E2E: remotePreferences - Returns show subdomain and viewer control mode")
  void testRemotePreferences() {
    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .get("/remotePreferences")
        .then()
        .statusCode(200)
        .body("remoteSubdomain", equalTo("test-show"))
        .body("viewerControlMode", equalTo("jukebox"));
  }

  @Test
  @Order(11)
  @DisplayName("E2E: purgeQueue - Clears requests and votes")
  void testPurgeQueue_Success() {
    // Add some data
    Show show = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    show.getRequests().add(Request.builder().position(1).sequence(show.getSequences().get(0)).build());
    show.getVotes().add(Vote.builder().sequence(show.getSequences().get(0)).votes(5).build());
    showRepository.update(show);

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .delete("/purgeQueue")
        .then()
        .statusCode(200)
        .body("message", equalTo("Success"));

    // Verify database was cleared
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertTrue(updatedShow.getRequests().isEmpty());
    assertTrue(updatedShow.getVotes().isEmpty());
  }

  @Test
  @Order(12)
  @DisplayName("E2E: resetAllVotes - Clears only votes")
  void testResetAllVotes_Success() {
    // Add votes
    Show show = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    show.getVotes().add(Vote.builder().sequence(show.getSequences().get(0)).votes(5).build());
    showRepository.update(show);

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .when()
        .delete("/resetAllVotes")
        .then()
        .statusCode(200)
        .body("message", equalTo("Success"));

    // Verify votes were cleared
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertTrue(updatedShow.getVotes().isEmpty());
  }

  @Test
  @Order(13)
  @DisplayName("E2E: toggleViewerControl - Flips viewer control enabled state")
  void testToggleViewerControl_Success() {
    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .contentType(ContentType.JSON)
        .when()
        .post("/toggleViewerControl")
        .then()
        .statusCode(200)
        .body("viewerControlEnabled", equalTo(false)); // Should be flipped from true to false

    // Verify database was updated
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertFalse(updatedShow.getPreferences().getViewerControlEnabled());
    assertEquals(0, updatedShow.getPreferences().getSequencesPlayed());
  }

  @Test
  @Order(14)
  @DisplayName("E2E: updateViewerControl - Sets viewer control from Y/N")
  void testUpdateViewerControl_Success() {
    ViewerControlRequest request = ViewerControlRequest.builder()
        .viewerControlEnabled("N")
        .build();

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateViewerControl")
        .then()
        .statusCode(200)
        .body("viewerControlEnabled", equalTo(false));

    // Verify database was updated
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertFalse(updatedShow.getPreferences().getViewerControlEnabled());
  }

  @Test
  @Order(15)
  @DisplayName("E2E: updateManagedPsa - Sets managed PSA from Y/N")
  void testUpdateManagedPsa_Success() {
    ManagedPSARequest request = ManagedPSARequest.builder()
        .managedPsaEnabled("Y")
        .build();

    given()
        .header("showtoken", TEST_SHOW_TOKEN)
        .contentType(ContentType.JSON)
        .body(request)
        .when()
        .post("/updateManagedPsa")
        .then()
        .statusCode(200)
        .body("managedPsaEnabled", equalTo(true));

    // Verify database was updated
    Show updatedShow = showRepository.findByShowToken(TEST_SHOW_TOKEN).orElseThrow();
    assertTrue(updatedShow.getPreferences().getManagePsa());
  }

  @Test
  @Order(16)
  @DisplayName("E2E: Health check endpoint returns UP")
  void testHealthCheck() {
    given()
        .when()
        .get("/actuator/health")
        .then()
        .statusCode(200)
        .body("status", equalTo("UP"));
  }

  @Test
  @Order(17)
  @DisplayName("E2E: Unauthorized request without showtoken header returns 401")
  void testUnauthorized_NoToken() {
    given()
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(401);
  }

  @Test
  @Order(18)
  @DisplayName("E2E: Unauthorized request with invalid showtoken returns 404")
  void testUnauthorized_InvalidToken() {
    given()
        .header("showtoken", "invalid-token")
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(404);
  }

  /**
   * Helper method to create a test show with realistic configuration
   */
  private Show createTestShow() {
    Show show = new Show();
    show.setShowToken(TEST_SHOW_TOKEN);
    show.setShowSubdomain("test-show");
    show.setShowName("Integration Test Show");
    show.setPlayingNow("");
    show.setPlayingNext("");
    show.setPlayingNextFromSchedule("");

    // Create preferences
    Preference preferences = Preference.builder()
        .viewerControlMode(ViewerControlMode.JUKEBOX)
        .viewerControlEnabled(true)
        .hideSequenceCount(0)
        .managePsa(false)
        .psaEnabled(false)
        .psaFrequency(3)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build();
    show.setPreferences(preferences);

    // Create test sequences
    List<Sequence> sequences = new ArrayList<>();

    Sequence seq1 = Sequence.builder()
        .name("Test Song 1")
        .displayName("Test Song 1 Display")
        .order(1)
        .index(5)
        .active(true)
        .visible(true)
        .visibilityCount(0)
        .type("SEQUENCE")
        .build();
    sequences.add(seq1);

    Sequence seq2 = Sequence.builder()
        .name("Test Song 2")
        .displayName("Test Song 2 Display")
        .order(2)
        .index(6)
        .active(true)
        .visible(true)
        .visibilityCount(0)
        .type("SEQUENCE")
        .build();
    sequences.add(seq2);

    show.setSequences(sequences);

    // Initialize empty collections
    show.setSequenceGroups(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setActiveViewers(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setPages(new ArrayList<>());

    // Initialize stats
    Stat stats = Stat.builder()
        .votingWin(new ArrayList<>())
        .build();
    show.setStats(stats);

    return show;
  }
}
