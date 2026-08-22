package com.remotefalcon.plugins.api.integration;

import com.remotefalcon.library.models.ActiveViewer;
import com.remotefalcon.library.models.ApiAccess;
import com.remotefalcon.library.models.HeartbeatGap;
import com.remotefalcon.library.models.MfaConfig;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.ShowNotification;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.UserProfile;
import com.remotefalcon.library.models.VersionChange;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.models.ViewerSession;
import com.remotefalcon.library.models.Vote;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Contract tests for the per-request Show loads in
 * {@link ShowRepository} — the projection behind {@code ShowTokenFilter},
 * which runs on EVERY plugin call (listener polls + 30s heartbeats,
 * fleet-wide), and the dedicated heartbeat slice.
 *
 * <p>Pinning the exclusions matters here for the same two reasons as the
 * viewer projection contract: fields left in ride along on the
 * highest-frequency reads in the platform whether or not anything uses them
 * (viewerSessions and stats.page are unbounded on an active show), and
 * credential material (password, MFA, reset tokens) has no business being
 * deserialized on every heartbeat.
 *
 * <p>The safety precondition for these exclusions — that PluginService never
 * writes the loaded Show back whole, only targeted {@code updateOne} paths —
 * is documented on {@link ShowRepository#findByShowToken}. If a future change
 * introduces a whole-doc {@code update(show)} in the service, these
 * exclusions become an erase hazard and this contract must be revisited.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class PluginProjectionIntegrationTest {

  @Inject
  ShowRepository showRepository;

  private static final String TOKEN = "projection-contract-token";
  private static final String BASE_PATH = "/remote-falcon-plugins-api";

  @BeforeAll
  static void setupRestAssured() {
    RestAssured.basePath = BASE_PATH;
  }

  @BeforeEach
  void setUp() {
    deleteTestShow();

    LocalDateTime now = LocalDateTime.now();
    Show show = new Show();
    show.setShowToken(TOKEN);
    show.setShowSubdomain("projection-contract");
    show.setShowName("Projection Contract");
    show.setEmail("owner@example.com");
    // Credential material — must never ride a plugin poll.
    show.setPassword("$2a$10$hash");
    show.setPasswordResetLink("reset-link");
    show.setPasswordResetExpiry(now.plusDays(1));
    show.setMfa(MfaConfig.builder().build());
    show.setApiAccess(ApiAccess.builder().apiAccessActive(true).build());
    show.setUserProfile(UserProfile.builder().firstName("Matt").build());
    // What the plugin endpoints actually consume.
    show.setLastFppHeartbeat(now.minusMinutes(30));
    show.setPreferences(Preference.builder().viewerControlEnabled(true).build());
    show.setSequences(new ArrayList<>(List.of(
        Sequence.builder().name("Wizards").displayName("Wizards in Winter").build())));
    show.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA").order(1).build())));
    show.setRequests(new ArrayList<>(List.of(
        Request.builder().position(1)
            .sequence(Sequence.builder().name("Wizards").build()).build())));
    show.setVotes(new ArrayList<>(List.of(
        Vote.builder().votes(3).lastVoteTime(now)
            .sequence(Sequence.builder().name("Wizards").build()).build())));
    show.setStats(Stat.builder()
        .votingWin(new ArrayList<>(List.of(
            Stat.VotingWin.builder().name("Wizards").dateTime(now).build())))
        .page(new ArrayList<>(List.of(
            Stat.Page.builder().ip("1.2.3.4").dateTime(now).build())))
        .rejectedRequests(new ArrayList<>(List.of(
            Stat.RejectedRequest.builder().reason("full").dateTime(now).build())))
        .build());
    // Operator telemetry the plugin never reads.
    show.setViewerSessions(new ArrayList<>(List.of(
        ViewerSession.builder().ip("9.9.9.9").lastSeen(now).build())));
    show.setActiveViewers(new ArrayList<>(List.of(
        ActiveViewer.builder().ipAddress("9.9.9.9").visitDateTime(now).build())));
    show.setShowNotifications(new ArrayList<>(List.of(
        ShowNotification.builder().read(false).build())));
    show.setHeartbeatGaps(new ArrayList<>(List.of(
        HeartbeatGap.builder().startedAt(now.minusHours(2)).endedAt(now.minusHours(1)).build())));
    show.setVersionChanges(new ArrayList<>(List.of(
        VersionChange.builder().at(now.minusDays(3)).pluginVersion("1.0").build())));
    show.setPages(new ArrayList<>(List.of(
        ViewerPage.builder().name("home").active(true)
            .html("<html>operator-authored, potentially 1MB</html>").build())));
    showRepository.persist(show);
  }

  @AfterEach
  void tearDown() {
    deleteTestShow();
  }

  private void deleteTestShow() {
    showRepository.findByShowToken(TOKEN)
        .ifPresent(show -> showRepository.delete(show));
  }

  @Test
  void filterLoad_dropsSecretsAndTelemetry_keepsWhatTheEndpointsRead() {
    Show loaded = showRepository.findByShowToken(TOKEN).orElseThrow();

    // Kept — the fields PluginService reads and read-modify-writes.
    assertEquals(TOKEN, loaded.getShowToken());
    assertNotNull(loaded.getPreferences());
    assertFalse(loaded.getSequences().isEmpty());
    assertFalse(loaded.getPsaSequences().isEmpty());
    assertFalse(loaded.getRequests().isEmpty());
    assertFalse(loaded.getVotes().isEmpty());
    assertNotNull(loaded.getLastFppHeartbeat());
    assertNotNull(loaded.getStats());
    assertFalse(loaded.getStats().getVotingWin().isEmpty(),
        "stats.votingWin is read-modify-written by highestVotedSequence — "
            + "excluding it would erase win history on the next vote cycle");

    // Credential material must never ride a plugin poll.
    assertNull(loaded.getPassword());
    assertNull(loaded.getPasswordResetLink());
    assertNull(loaded.getPasswordResetExpiry());
    assertNull(loaded.getMfa());
    assertNull(loaded.getApiAccess());
    assertNull(loaded.getUserProfile());

    // Operator telemetry the plugin endpoints never read.
    assertNull(loaded.getViewerSessions());
    assertNull(loaded.getActiveViewers());
    assertNull(loaded.getShowNotifications());
    assertNull(loaded.getHeartbeatGaps());
    assertNull(loaded.getVersionChanges());
    assertNull(loaded.getPages());
    assertNull(loaded.getStats().getPage());
    assertNull(loaded.getStats().getRejectedRequests());
  }

  @Test
  void heartbeatSlice_carriesOnlyTokenAndLastHeartbeat() {
    Show slice = showRepository.findHeartbeatSliceByShowToken(TOKEN).orElseThrow();

    assertEquals(TOKEN, slice.getShowToken());
    assertNotNull(slice.getLastFppHeartbeat());

    // Everything else stays home — this runs every ~30s per show.
    assertNull(slice.getPreferences());
    assertNull(slice.getSequences());
    assertNull(slice.getRequests());
    assertNull(slice.getVotes());
    assertNull(slice.getStats());
  }

  @Test
  void fppHeartbeat_endToEnd_throughTheFastPath_updatesHeartbeatAndRecordsGap() {
    // lastFppHeartbeat was seeded 30 min ago — past the 5-min gap threshold —
    // so this beat must both advance the timestamp and push a HeartbeatGap.
    // Going through REST exercises ShowTokenFilter's fast-path branch, not
    // just the repository method.
    given()
        .header("showtoken", TOKEN)
        .contentType("application/json")
        .when()
        .post("/fppHeartbeat")
        .then()
        .statusCode(204);

    // Unprojected read — findByShowToken excludes heartbeatGaps by design.
    Show after = showRepository.find("showToken", TOKEN).firstResult();
    assertNotNull(after.getLastFppHeartbeat());
    assertTrue(after.getLastFppHeartbeat()
            .isAfter(LocalDateTime.now().minus(30, ChronoUnit.SECONDS)),
        "heartbeat timestamp should have advanced to ~now");
    assertNotNull(after.getHeartbeatGaps());
    assertEquals(2, after.getHeartbeatGaps().size(),
        "the 30-min outage should have been recorded as a second gap");
  }
}
