package com.remotefalcon.plugins.api.integration;

import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.model.UpdateWhatsPlayingRequest;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import com.remotefalcon.plugins.api.service.PluginService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.mockito.InjectSpy;
import jakarta.inject.Inject;
import org.bson.BsonDocument;
import org.bson.Document;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

/**
 * updateWhatsPlaying's element writes are guarded by what the request read
 * at each index. When the guard keeps missing (here: every re-read is
 * stale), it stops after {@code PLAY_WRITE_ATTEMPTS} guarded attempts and
 * writes unguarded: counters through arrayFilters, requests/votes whole.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class PlayWriteFallbackIntegrationTest {

  private static final String TOKEN = "play-write-fallback-token";

  @Inject
  PluginService pluginService;

  @InjectMock
  ShowContext showContext;

  @InjectSpy
  ShowRepository showRepository;

  @Inject
  RecordingUpdateListener updates;

  @BeforeEach
  void clean() {
    showRepository.delete("showToken", TOKEN);
  }

  @AfterEach
  void tearDown() {
    showRepository.delete("showToken", TOKEN);
  }

  private static Sequence seq(String name, int visibilityCount) {
    return Sequence.builder().name(name).displayName(name).duration(180).visible(true).index(1).order(1)
        .active(true).visibilityCount(visibilityCount).type("SEQUENCE").build();
  }

  private Show load() {
    return showRepository.findByShowToken(TOKEN).orElseThrow();
  }


  private Show baseShow() {
    Show show = new Show();
    show.setShowToken(TOKEN);
    show.setShowSubdomain("play-write-fallback");
    show.setPreferences(Preference.builder()
        .viewerControlMode(ViewerControlMode.JUKEBOX).hideSequenceCount(2)
        .managePsa(false).psaEnabled(false).psaFrequency(3).resetVotes(true).sequencesPlayed(0).build());
    show.setSequences(new ArrayList<>(List.of(seq("A", 2), seq("B", 0))));
    show.setSequenceGroups(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setStats(Stat.builder().votingWin(new ArrayList<>()).build());
    return show;
  }

  /**
   * Persists {@code show}, hands the service four reads taken before the
   * stored sequences are reversed (so every guard misses), plays
   * {@code playlist}, and returns the fallback update.
   */
  private BsonDocument playWithStaleReads(Show show, String playlist) {
    showRepository.persist(show);
    Show first = load();
    Show second = load();
    Show third = load();
    Show fourth = load();
    when(showContext.getShow()).thenReturn(first);
    doReturn(Optional.of(second), Optional.of(third), Optional.of(fourth)).when(showRepository).findByShowToken(TOKEN);
    List<Document> seqs = new ArrayList<>(storedSequences());
    java.util.Collections.reverse(seqs);
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN), Updates.set("sequences", seqs));
    updates.clear();
    pluginService.updateWhatsPlaying(UpdateWhatsPlayingRequest.builder().playlist(playlist).build());
    List<BsonDocument> sent = updates.showUpdates();
    assertEquals(4, sent.size(), "3 guarded attempts + the fallback");
    return sent.getLast();
  }

  private Document stored() {
    return Show.mongoCollection().withDocumentClass(Document.class).find(Filters.eq("showToken", TOKEN)).first();
  }

  @SuppressWarnings("unchecked")
  private List<Document> storedSequences() {
    return (List<Document>) stored().get("sequences");
  }

  private static Document named(List<Document> seqs, String name) {
    return seqs.stream().filter(d -> name.equals(d.getString("name"))).findFirst().orElseThrow();
  }

  @Test
  void fallback_nightlyReset_writesWholeSequences() {
    Show show = baseShow();
    show.getSequences().get(0).setPlaysToday(4);
    show.getSequences().get(1).setPlaysToday(5);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(7));

    BsonDocument fallback = playWithStaleReads(show, "B");

    assertTrue(fallback.getDocument("$set").containsKey("sequences"), fallback.toJson());
    List<Document> seqs = storedSequences();
    assertEquals(0, named(seqs, "A").getInteger("playsToday"));
    assertEquals(1, named(seqs, "B").getInteger("playsToday"));
  }

  @Test
  void fallback_nullSequenceGroups_storesEmptyAndUsesNoGroupFilter() {
    Show show = baseShow();
    show.setSequenceGroups(null);

    BsonDocument fallback = playWithStaleReads(show, "B");

    assertTrue(fallback.getDocument("$set").containsKey("sequenceGroups"), fallback.toJson());
    assertEquals(new ArrayList<>(), stored().get("sequenceGroups"));
    assertEquals(1, named(storedSequences(), "A").getInteger("visibilityCount"));
  }

  @Test
  void fallback_firstTally_isSetToOne() {
    Show show = baseShow();
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));

    BsonDocument fallback = playWithStaleReads(show, "B");

    assertTrue(fallback.getDocument("$set").containsKey("sequences.$[c].playsToday"), fallback.toJson());
    assertEquals(1, named(storedSequences(), "B").getInteger("playsToday"));
  }

  @Test
  void fallback_countedTally_isIncrementedOnlyWhenNumeric() {
    Show show = baseShow();
    show.getSequences().get(1).setPlaysToday(2);
    show.getPreferences().setNightlyPlayLimit(5);
    show.getPreferences().setLastPlayCountedAt(LocalDateTime.now().minusHours(1));

    BsonDocument fallback = playWithStaleReads(show, "B");

    assertTrue(fallback.getDocument("$inc").containsKey("sequences.$[c].playsToday"), fallback.toJson());
    assertEquals(3, named(storedSequences(), "B").getInteger("playsToday"));
  }

  @Test
  void guardKeepsMissing_fallsBackToUnguardedWriteAfterThreeAttempts() {
    Show show = new Show();
    show.setShowToken(TOKEN);
    show.setShowSubdomain("play-write-fallback");
    show.setPreferences(Preference.builder()
        .viewerControlMode(ViewerControlMode.JUKEBOX).hideSequenceCount(2)
        .managePsa(false).psaEnabled(false).psaFrequency(3).resetVotes(true).sequencesPlayed(0).build());
    show.setSequences(new ArrayList<>(List.of(seq("A", 2), seq("B", 0))));
    show.setSequenceGroups(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setStats(Stat.builder().votingWin(new ArrayList<>()).build());
    showRepository.persist(show);

    // Every read this request makes sees A at index 0; the stored array has
    // been reordered so index 0 is B and the guard can never match.
    Show first = load();
    Show second = load();
    Show third = load();
    Show fourth = load();
    when(showContext.getShow()).thenReturn(first);
    doReturn(Optional.of(second), Optional.of(third), Optional.of(fourth)).when(showRepository).findByShowToken(TOKEN);
    Document stored = Show.mongoCollection().withDocumentClass(Document.class)
        .find(Filters.eq("showToken", TOKEN)).first();
    @SuppressWarnings("unchecked")
    List<Document> seqs = (List<Document>) stored.get("sequences");
    Show.mongoCollection().updateOne(Filters.eq("showToken", TOKEN),
        Updates.set("sequences", List.of(seqs.get(1), seqs.get(0))));
    updates.clear();

    pluginService.updateWhatsPlaying(UpdateWhatsPlayingRequest.builder().playlist("B").build());

    List<BsonDocument> sent = updates.showUpdates();
    assertEquals(4, sent.size(), "3 guarded attempts (PLAY_WRITE_ATTEMPTS) + the fallback");
    BsonDocument fallback = sent.getLast();
    // Counters fall back to arrayFilters evaluated at write time (the R3
    // shape), so the stale read can't clobber them; requests/votes are
    // written whole.
    assertFalse(fallback.getDocument("$set").containsKey("sequences"), fallback.toJson());
    assertTrue(fallback.getDocument("$inc").containsKey("sequences.$[p].visibilityCount"), fallback.toJson());
    assertTrue(fallback.getDocument("$set").containsKey("requests"), fallback.toJson());
    assertTrue(fallback.getDocument("$set").containsKey("votes"), fallback.toJson());
    Document after = Show.mongoCollection().withDocumentClass(Document.class)
        .find(Filters.eq("showToken", TOKEN)).first();
    @SuppressWarnings("unchecked")
    List<Document> written = (List<Document>) after.get("sequences");
    assertEquals("B", written.get(0).getString("name"));
    assertEquals(0, written.get(0).getInteger("visibilityCount"));
    assertEquals("A", written.get(1).getString("name"));
    assertEquals(1, written.get(1).getInteger("visibilityCount"));
    assertEquals("B", after.getString("playingNow"));
  }
}
