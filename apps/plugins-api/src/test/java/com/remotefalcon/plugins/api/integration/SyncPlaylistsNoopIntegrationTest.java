package com.remotefalcon.plugins.api.integration;

import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.model.SyncPlaylistDetails;
import com.remotefalcon.plugins.api.model.SyncPlaylistRequest;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.bson.BsonDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Season Prep S3 / R1: syncPlaylists must not rewrite the sequences and
 * psaSequences arrays when the plugin re-sends a playlist that is already
 * stored. One FPP install looped this call at 1/s for a week, and every call
 * was a full-array rewrite of the Show document.
 *
 * <p>Goes through REST so the show is loaded by ShowTokenFilter's real
 * projection, which is what the no-op comparison runs against in prod.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class SyncPlaylistsNoopIntegrationTest {

  private static final String TOKEN = "sync-playlists-noop-token";
  private static final String BASE_PATH = "/remote-falcon-plugins-api";

  @Inject
  ShowRepository showRepository;

  @Inject
  RecordingUpdateListener updates;

  @BeforeAll
  static void setupRestAssured() {
    RestAssured.basePath = BASE_PATH;
  }

  @BeforeEach
  void setUp() {
    seedShow(new ArrayList<>(), false);
  }

  @AfterEach
  void tearDown() {
    showRepository.delete("showToken", TOKEN);
  }

  @Test
  void unchangedPayload_doesNotWrite() {
    List<SyncPlaylistDetails> playlists = List.of(
        playlist("Song A", 1, 180),
        playlist("Song B", 2, 200),
        playlist("Song C", 3, 220));
    sync(playlists);
    assertEquals(1, sequenceWrites().size(), "first sync stores the playlist");

    updates.clear();
    sync(playlists);
    sync(playlists);

    assertTrue(sequenceWrites().isEmpty(),
        "re-sending the stored playlist must not write, got " + sequenceWrites());
  }

  @Test
  void unchangedPayload_withSeveralInactiveSequences_settlesToNoWrite() {
    // Removed sequences get their order renumbered from their array position
    // on every call, so the stored array order has to be stable for the
    // computed result to reach a fixed point.
    sync(List.of(
        playlist("A", 1, 10), playlist("B", 2, 10), playlist("C", 3, 10),
        playlist("D", 4, 10), playlist("E", 5, 10), playlist("F", 6, 10)));
    List<SyncPlaylistDetails> reduced = List.of(playlist("A", 1, 10));
    sync(reduced);

    updates.clear();
    for (int i = 0; i < 5; i++) {
      sync(reduced);
    }

    assertTrue(sequenceWrites().isEmpty(),
        "a show with inactive sequences must settle, got " + sequenceWrites());
  }

  @Test
  void requestOrderOnlyDifference_doesNotWrite() {
    List<SyncPlaylistDetails> playlists = List.of(
        playlist("Song A", 1, 180),
        playlist("Song B", 2, 200),
        playlist("Song C", 3, 220));
    sync(playlists);

    updates.clear();
    List<SyncPlaylistDetails> reversed = new ArrayList<>(playlists);
    Collections.reverse(reversed);
    sync(reversed);

    assertTrue(sequenceWrites().isEmpty(),
        "same playlist in a different request order must not write, got " + sequenceWrites());
  }

  @Test
  void storedArrayOrderOnlyDifference_doesNotWrite() {
    List<SyncPlaylistDetails> playlists = List.of(
        playlist("Song A", 1, 180),
        playlist("Song B", 2, 200),
        playlist("Song C", 3, 220));
    sync(playlists);
    List<Sequence> stored = new ArrayList<>(reload().getSequences());
    Collections.reverse(stored);
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN), Updates.set("sequences", stored));

    updates.clear();
    sync(playlists);

    assertTrue(sequenceWrites().isEmpty(),
        "a different stored array order must not write, got " + sequenceWrites());
  }

  @Test
  void addedSequence_writes() {
    sync(List.of(playlist("Song A", 1, 180)));
    updates.clear();

    sync(List.of(playlist("Song A", 1, 180), playlist("Song B", 2, 200)));

    assertEquals(1, sequenceWrites().size());
    assertTrue(reload().getSequences().stream()
        .anyMatch(s -> "Song B".equals(s.getName()) && Boolean.TRUE.equals(s.getActive())));
  }

  @Test
  void removedSequence_writes() {
    sync(List.of(playlist("Song A", 1, 180), playlist("Song B", 2, 200)));
    updates.clear();

    sync(List.of(playlist("Song A", 1, 180)));

    assertEquals(1, sequenceWrites().size());
    assertTrue(reload().getSequences().stream()
        .anyMatch(s -> "Song B".equals(s.getName()) && Boolean.FALSE.equals(s.getActive())));
  }

  @Test
  void renamedSequence_writes() {
    sync(List.of(playlist("Song A", 1, 180)));
    updates.clear();

    sync(List.of(playlist("Song A (2026 mix)", 1, 180)));

    assertEquals(1, sequenceWrites().size());
    List<Sequence> after = reload().getSequences();
    assertTrue(after.stream().anyMatch(s -> "Song A (2026 mix)".equals(s.getName()) && s.getActive()));
    assertTrue(after.stream().anyMatch(s -> "Song A".equals(s.getName()) && !s.getActive()));
  }

  @Test
  void changedIndex_writes() {
    sync(List.of(playlist("Song A", 1, 180)));
    updates.clear();

    sync(List.of(playlist("Song A", 7, 180)));

    assertEquals(1, sequenceWrites().size());
    assertEquals(7, reload().getSequences().getFirst().getIndex());
  }

  @Test
  void changedMediaTitle_writes() {
    sync(List.of(playlist("Song A", 1, 180)));
    updates.clear();

    SyncPlaylistDetails retitled = playlist("Song A", 1, 180);
    retitled.setMediaTitle("Song A - Live");
    sync(List.of(retitled));

    assertEquals(1, sequenceWrites().size());
    assertEquals("Song A - Live", reload().getSequences().getFirst().getDisplayName());
  }

  @Test
  void psaDroppedFromPlaylist_writes() {
    List<SyncPlaylistDetails> withPsa = List.of(playlist("Song A", 1, 180), playlist("PSA 1", 2, 30));
    sync(withPsa);
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN), Updates.set("psaSequences",
        List.of(PsaSequence.builder().name("PSA 1").order(1).enabled(true).build())));

    updates.clear();
    sync(withPsa);
    assertTrue(sequenceWrites().isEmpty(), "PSA still present: no write, got " + sequenceWrites());

    // The PSA's playlist entry goes away: its PSA entry must be dropped.
    sync(List.of(playlist("Song A", 1, 180)));
    assertEquals(1, sequenceWrites().size());
    Show after = reload();
    assertTrue(after.getPsaSequences().isEmpty());
    assertFalse(after.getPreferences().getPsaEnabled());
  }

  @Test
  void psaEnabledWithNoPsaSequences_writesToDisableIt() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("Song A", 1, 180));
    sync(playlists);
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN), Updates.set("preferences.psaEnabled", true));

    updates.clear();
    sync(playlists);

    assertEquals(1, sequenceWrites().size(),
        "psaEnabled=true with no PSA sequences must still be switched off");
    assertFalse(reload().getPreferences().getPsaEnabled());
  }

  @Test
  void unmanagedFieldsDoNotForceAWrite_andSurviveTheNoOp() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("Song A", 1, 180), playlist("Song B", 2, 200));
    sync(playlists);
    // Fields the operator or updateWhatsPlaying own, not syncPlaylists.
    Show.mongoCollection().updateOne(
        Filters.and(Filters.eq("showToken", TOKEN), Filters.eq("sequences.name", "Song A")),
        Updates.combine(
            Updates.set("sequences.$.visibilityCount", 3),
            Updates.set("sequences.$.playsToday", 2),
            Updates.set("sequences.$.category", "Classics")));

    updates.clear();
    sync(playlists);

    assertTrue(sequenceWrites().isEmpty(), "got " + sequenceWrites());
    Sequence songA = reload().getSequences().stream()
        .filter(s -> "Song A".equals(s.getName())).findFirst().orElseThrow();
    assertEquals(3, songA.getVisibilityCount());
    assertEquals(2, songA.getPlaysToday());
    assertEquals("Classics", songA.getCategory());
  }

  private static SyncPlaylistDetails playlist(String name, int index, int duration) {
    return SyncPlaylistDetails.builder()
        .playlistName(name)
        .playlistIndex(index)
        .playlistDuration(duration)
        .playlistType("SEQUENCE")
        .build();
  }

  private void sync(List<SyncPlaylistDetails> playlists) {
    given()
        .header("showtoken", TOKEN)
        .contentType(ContentType.JSON)
        .body(SyncPlaylistRequest.builder().playlists(playlists).build())
        .when()
        .post("/syncPlaylists")
        .then()
        .statusCode(200)
        .body("message", equalTo("Success"));
  }

  private void seedShow(List<Sequence> sequences, boolean psaEnabled) {
    showRepository.delete("showToken", TOKEN);
    Show show = new Show();
    show.setShowToken(TOKEN);
    show.setShowSubdomain("sync-playlists-noop");
    show.setShowName("Sync Playlists Noop");
    show.setSequences(sequences);
    show.setPsaSequences(new ArrayList<>());
    show.setPreferences(Preference.builder().psaEnabled(psaEnabled).build());
    showRepository.persist(show);
  }

  private Show reload() {
    return showRepository.find("showToken", TOKEN).firstResult();
  }

  /** Writes from this test's syncPlaylists calls (the listener is app-wide). */
  private List<BsonDocument> sequenceWrites() {
    return updates.showUpdates().stream()
        .filter(u -> u.containsKey("$set") && u.getDocument("$set").containsKey("sequences"))
        .toList();
  }
}
