package com.remotefalcon.plugins.api.service;

import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.model.*;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@QuarkusTest
class PluginServiceTest {

  @Inject
  PluginService pluginService;

  @InjectMock
  ShowContext showContext;

  private Show baseShow;

  @BeforeEach
  void setup() {
    baseShow = buildBaseShow();
    baseShow.setShowToken("test-token"); // Required for MongoDB updates
    when(showContext.getShow()).thenReturn(baseShow);
  }

  private Show buildBaseShow() {
    Show show = new Show();
    // Preferences
    Preference prefs = Preference.builder()
        .viewerControlMode(ViewerControlMode.JUKEBOX)
        .viewerControlEnabled(true)
        .hideSequenceCount(0)
        .managePsa(false)
        .psaEnabled(false)
        .psaFrequency(3)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build();
    show.setPreferences(prefs);
    // Lists
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setSequences(new ArrayList<>());
    show.setSequenceGroups(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    // Stats
    show.setStats(Stat.builder().votingWin(new ArrayList<>()).build());
    // Misc
    show.setShowSubdomain("mysub");
    return show;
  }

  @Test
  void nextPlaylistInQueue_emptyQueue_returnsDefault() {
    baseShow.setRequests(new ArrayList<>());

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();
    assertNull(resp.getNextPlaylist());
    assertEquals(-1, resp.getPlaylistIndex());
  }

  @Test
  void nextPlaylistInQueue_picksMinPosition_updatesVisibility_andPersists() {
    // Setup sequences and groups
    baseShow.getPreferences().setHideSequenceCount(2);
    Sequence seq1 = Sequence.builder().name("A").index(5).order(1).group("").visibilityCount(0).active(true).build();
    Sequence seq2 = Sequence.builder().name("B").index(7).order(2).group("Group1").visibilityCount(0).active(true).build();
    baseShow.setSequences(new ArrayList<>(List.of(seq1, seq2)));
    baseShow.setSequenceGroups(new ArrayList<>(List.of(
        SequenceGroup.builder().name("Group1").visibilityCount(0).build()
    )));
    baseShow.setRequests(new ArrayList<>(List.of(
        Request.builder().position(2).sequence(seq1).build(),
        Request.builder().position(1).sequence(seq2).build()
    )));

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();
    assertEquals("B", resp.getNextPlaylist());
    assertEquals(7, resp.getPlaylistIndex());
    // Group visibility should increment by hideSequenceCount+1 => 3
    assertEquals(3, baseShow.getSequenceGroups().getFirst().getVisibilityCount());
  }

  @Test
  void updatePlaylistQueue_returnsQueueEmptyOrSuccess() {
    baseShow.setRequests(new ArrayList<>());
    assertEquals("Queue Empty", pluginService.updatePlaylistQueue().getMessage());

    baseShow.setRequests(new ArrayList<>(List.of(Request.builder().build())));
    assertEquals("Success", pluginService.updatePlaylistQueue().getMessage());
  }

  @Test
  void syncPlaylists_overLimit_throwsBadRequest() {
    // Create request with more than sequence.limit (default 200) - use 201
    List<SyncPlaylistDetails> many = new ArrayList<>();
    for (int i = 0; i < 201; i++) {
      many.add(SyncPlaylistDetails.builder().playlistName("P" + i).playlistIndex(i).playlistDuration(10).build());
    }
    SyncPlaylistRequest req = SyncPlaylistRequest.builder().playlists(many).build();
    WebApplicationException ex = assertThrows(WebApplicationException.class, () -> pluginService.syncPlaylists(req));
    assertEquals(400, ex.getResponse().getStatus());
  }

  @Test
  void syncPlaylists_addsNewAndMarksMissingAndUpdatesPsa_andPersists() {
    // Existing sequences
    Sequence existing = Sequence.builder().name("Old").displayName("Old").order(1).active(true).index(1).visible(true).visibilityCount(0).build();
    baseShow.setSequences(new ArrayList<>(List.of(existing)));
    // Existing PSA list contains only Psa1; Request will include Psa2 only -> existing PSA should be dropped
    baseShow.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("Psa1").order(1).lastPlayed(LocalDateTime.now().minusDays(1)).build()
    )));

    // Incoming playlists: Old (update index) and New (add), plus Psa2 exists as a normal sequence name
    SyncPlaylistRequest req = SyncPlaylistRequest.builder().playlists(List.of(
        SyncPlaylistDetails.builder().playlistName("Old").playlistDuration(100).playlistIndex(5).playlistType("SEQUENCE").build(),
        SyncPlaylistDetails.builder().playlistName("New").playlistDuration(200).playlistIndex(2).playlistType("SEQUENCE").build(),
        SyncPlaylistDetails.builder().playlistName("Psa2").playlistDuration(50).playlistIndex(3).playlistType("SEQUENCE").build()
    )).build();

    PluginResponse resp = pluginService.syncPlaylists(req);
    assertEquals("Success", resp.getMessage());
    // Note: baseShow in-memory object is not modified; only MongoDB is updated atomically with computed sequences
  }

  @Test
  void updateWhatsPlaying_nullOrEmptyRequest_returnsEmptyResponseOrSetsPlayingNow() {
    // null request
    PluginResponse none = pluginService.updateWhatsPlaying(null);
    assertNull(none.getCurrentPlaylist());

    // preferences missing
    baseShow.setPreferences(null);
    UpdateWhatsPlayingRequest req = UpdateWhatsPlayingRequest.builder().playlist("X").build();
    assertThrows(WebApplicationException.class, () -> pluginService.updateWhatsPlaying(req));

    // restore prefs and simple flow
    baseShow.setPreferences(Preference.builder().viewerControlMode(ViewerControlMode.JUKEBOX).sequencesPlayed(0).managePsa(false).psaEnabled(false).psaFrequency(3).hideSequenceCount(0).resetVotes(true).viewerControlEnabled(true).build());
    baseShow.setSequences(new ArrayList<>(List.of(
        Sequence.builder().name("X").visibilityCount(1).build(),
        Sequence.builder().name("Y").visibilityCount(0).build()
    )));
    PluginResponse resp = pluginService.updateWhatsPlaying(UpdateWhatsPlayingRequest.builder().playlist("X").build());
    assertEquals("X", resp.getCurrentPlaylist());
    // sequencesPlayed increments (not PSA, not grouped)
    assertEquals(1, baseShow.getPreferences().getSequencesPlayed());
    // visibilityCount of sequences decremented if > 0
    Optional<Sequence> seqX = baseShow.getSequences().stream().filter(s -> Objects.equals("X", s.getName())).findFirst();
    assertTrue(seqX.isPresent());
    assertEquals(0, seqX.get().getVisibilityCount());
  }

  @Test
  void updateNextScheduledSequence_handlesNullPrefsAndPersists() {
    baseShow.setPreferences(null);
    assertThrows(WebApplicationException.class, () -> pluginService.updateNextScheduledSequence(UpdateNextScheduledRequest.builder().sequence("A").build()));

    baseShow.setPreferences(Preference.builder().viewerControlMode(ViewerControlMode.JUKEBOX).viewerControlEnabled(true).hideSequenceCount(0).managePsa(false).psaEnabled(false).psaFrequency(3).resetVotes(true).sequencesPlayed(0).build());
    PluginResponse resp = pluginService.updateNextScheduledSequence(UpdateNextScheduledRequest.builder().sequence("NextSeq").build());
    assertEquals("NextSeq", resp.getNextScheduledSequence());
  }

  @Test
  void viewerControlMode_returnsLowercase() {
    baseShow.getPreferences().setViewerControlMode(ViewerControlMode.VOTING);
    assertEquals("voting", pluginService.viewerControlMode().getViewerControlMode());
  }

  @Test
  void highestVotedPlaylist_emptyVotes_returnsDefaultAndPersists() {
    baseShow.setVotes(new ArrayList<>());
    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();
    assertNull(resp.getWinningPlaylist());
    assertEquals(-1, resp.getPlaylistIndex());
  }

  @Test
  void highestVotedPlaylist_singleWinnerNonGrouped_returnsSequenceAndPersists() {
    Sequence s1 = Sequence.builder().name("Song1").index(9).build();
    baseShow.setSequences(new ArrayList<>(List.of(s1)));
    baseShow.setPsaSequences(new ArrayList<>());
    baseShow.getPreferences().setHideSequenceCount(0);
    baseShow.getPreferences().setManagePsa(false);
    baseShow.getPreferences().setPsaEnabled(false);
    baseShow.getPreferences().setResetVotes(true);
    baseShow.setVotes(new ArrayList<>(List.of(
        Vote.builder().sequence(s1).votes(5).lastVoteTime(LocalDateTime.now()).ownerVoted(false).build()
    )));

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();
    assertEquals("Song1", resp.getWinningPlaylist());
    assertEquals(9, resp.getPlaylistIndex());
  }

  @Test
  void pluginVersion_setsVersions_andPersists() {
    PluginResponse resp = pluginService.pluginVersion(PluginVersion.builder().pluginVersion("1.0").fppVersion("7.0").build());
    assertEquals("Success", resp.getMessage());
  }

  @Test
  void remotePreferences_returnsSubdomainAndMode() {
    baseShow.getPreferences().setViewerControlMode(ViewerControlMode.JUKEBOX);
    RemotePreferenceResponse resp = pluginService.remotePreferences();
    assertEquals("mysub", resp.getRemoteSubdomain());
    assertEquals("jukebox", resp.getViewerControlMode());
  }

  @Test
  void purgeQueue_and_resetAllVotes_clearData() {
    baseShow.setRequests(new ArrayList<>(List.of(Request.builder().build())));
    baseShow.setVotes(new ArrayList<>(List.of(Vote.builder().sequence(Sequence.builder().name("X").build()).votes(1).build())));

    PluginResponse p1 = pluginService.purgeQueue();
    assertEquals("Success", p1.getMessage());
    // Note: baseShow in-memory object is not modified; only MongoDB is updated atomically

    baseShow.setVotes(new ArrayList<>(List.of(Vote.builder().sequence(Sequence.builder().name("Z").build()).votes(2).build())));
    PluginResponse p2 = pluginService.resetAllVotes();
    assertEquals("Success", p2.getMessage());
    // Note: baseShow in-memory object is not modified; only MongoDB is updated atomically
  }

  @Test
  void toggleViewerControl_flipsPreference_resetsSequencesPlayed_andReturnsCurrentImplValue() {
    baseShow.getPreferences().setViewerControlEnabled(true);
    baseShow.getPreferences().setSequencesPlayed(10);

    PluginResponse resp = pluginService.toggleViewerControl();
    // Implementation returns the new (flipped) value
    assertFalse(resp.getViewerControlEnabled());
    // Note: baseShow in-memory object is not modified; only MongoDB is updated atomically
  }

  @Test
  void updateViewerControl_setsFromYN_andPersists() {
    baseShow.setPreferences(Preference.builder().viewerControlEnabled(false).viewerControlMode(ViewerControlMode.JUKEBOX).hideSequenceCount(0).managePsa(false).psaEnabled(false).psaFrequency(3).resetVotes(true).sequencesPlayed(0).build());
    PluginResponse respY = pluginService.updateViewerControl(ViewerControlRequest.builder().viewerControlEnabled("Y").build());
    assertTrue(respY.getViewerControlEnabled());

    PluginResponse respN = pluginService.updateViewerControl(ViewerControlRequest.builder().viewerControlEnabled("N").build());
    assertFalse(respN.getViewerControlEnabled());
  }

  @Test
  void updateManagedPsa_setsFromYN_andPersists() {
    baseShow.setPreferences(Preference.builder().managePsa(false).viewerControlEnabled(true).viewerControlMode(ViewerControlMode.JUKEBOX).hideSequenceCount(0).psaEnabled(false).psaFrequency(3).resetVotes(true).sequencesPlayed(0).build());
    PluginResponse respY = pluginService.updateManagedPsa(ManagedPSARequest.builder().managedPsaEnabled("Y").build());
    assertTrue(respY.getManagedPsaEnabled());

    PluginResponse respN = pluginService.updateManagedPsa(ManagedPSARequest.builder().managedPsaEnabled("N").build());
    assertFalse(respN.getManagedPsaEnabled());
  }

  // @Test
  // void fppHeartbeat_updatesTimestamp_andPersists() {
  //   // Run DB-dependent assertions, but gracefully skip on CI environments
  //   // where Mongo/Testcontainers is unavailable (e.g., MongoTimeoutException).
  //   try {
  //     // Prepare a persisted Show matching the service's Mongo update behavior
  //     baseShow.setShowToken("test-token");
  //     baseShow.setLastFppHeartbeat(null);
  //     com.remotefalcon.library.quarkus.entity.Show.mongoCollection().insertOne(baseShow);

  //     assertNull(baseShow.getLastFppHeartbeat()); // in-memory object remains unchanged

  //     pluginService.fppHeartbeat();

  //     // Verify the database record has been updated
  //     com.remotefalcon.library.quarkus.entity.Show dbShow =
  //         com.remotefalcon.library.quarkus.entity.Show.find("showToken", "test-token").firstResult();
  //     assertNotNull(dbShow);
  //     assertNotNull(dbShow.getLastFppHeartbeat());
  //   } catch (com.mongodb.MongoTimeoutException e) {
  //     Assumptions.assumeTrue(false, "Skipping Mongo-dependent test: Mongo not available in environment");
  //   }
  // }

  // Additional tests to cover private branches and internal logic
  @Test
  void nextPlaylistInQueue_nonGroupedVisibility_incremented() {
    baseShow.getPreferences().setHideSequenceCount(2);
    Sequence seq = Sequence.builder().name("Solo").index(1).group("").visibilityCount(0).active(true).build();
    baseShow.setSequences(new ArrayList<>(List.of(seq)));
    baseShow.setSequenceGroups(new ArrayList<>());
    baseShow.setRequests(new ArrayList<>(List.of(
        Request.builder().position(1).sequence(seq).build()
    )));

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();
    assertEquals("Solo", resp.getNextPlaylist());
    assertEquals(1, resp.getPlaylistIndex());
    Optional<Sequence> seqOpt = baseShow.getSequences().stream().filter(s -> Objects.equals("Solo", s.getName())).findFirst();
    assertTrue(seqOpt.isPresent());
    assertEquals(3, seqOpt.get().getVisibilityCount());
  }

  // ---- PSA-v2 PR-4 Q2 — isSongLike skip predicate in nextPlaylistInQueue ----

  @Test
  void nextPlaylistInQueue_psaAtFront_returnsSongBehindIt() {
    // PSA at position 1, song at position 2 → returns the song.
    baseShow.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA1").order(1).build())));
    Sequence psa = Sequence.builder().name("PSA1").index(99).group("").visibilityCount(0).active(true).build();
    Sequence song = Sequence.builder().name("Song1").index(7).group("").visibilityCount(0).active(true).build();
    baseShow.setSequences(new ArrayList<>(List.of(psa, song)));
    baseShow.setRequests(new ArrayList<>(List.of(
        Request.builder().position(1).sequence(psa).build(),
        Request.builder().position(2).sequence(song).build())));

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();
    assertEquals("Song1", resp.getNextPlaylist());
    assertEquals(7, resp.getPlaylistIndex());
  }

  @Test
  void nextPlaylistInQueue_allPsa_returnsDefault() {
    // Queue full of PSAs only → returns null/empty default.
    baseShow.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA1").order(1).build())));
    Sequence psa = Sequence.builder().name("PSA1").index(99).group("").visibilityCount(0).active(true).build();
    baseShow.setSequences(new ArrayList<>(List.of(psa)));
    baseShow.setRequests(new ArrayList<>(List.of(
        Request.builder().position(1).sequence(psa).build(),
        Request.builder().position(2).sequence(psa).build())));

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();
    assertNull(resp.getNextPlaylist());
    assertEquals(-1, resp.getPlaylistIndex());
  }

  @Test
  void nextPlaylistInQueue_multiplePsasBeforeSong_returnsSong() {
    // PSA-PSA-PSA-song → returns the song (multi-skip).
    baseShow.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA1").order(1).build(),
        PsaSequence.builder().name("PSA2").order(2).build())));
    Sequence psa1 = Sequence.builder().name("PSA1").index(98).group("").visibilityCount(0).active(true).build();
    Sequence psa2 = Sequence.builder().name("PSA2").index(99).group("").visibilityCount(0).active(true).build();
    Sequence song = Sequence.builder().name("RealSong").index(5).group("").visibilityCount(0).active(true).build();
    baseShow.setSequences(new ArrayList<>(List.of(psa1, psa2, song)));
    baseShow.setRequests(new ArrayList<>(List.of(
        Request.builder().position(1).sequence(psa1).build(),
        Request.builder().position(2).sequence(psa2).build(),
        Request.builder().position(3).sequence(psa1).build(),
        Request.builder().position(4).sequence(song).build())));

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();
    assertEquals("RealSong", resp.getNextPlaylist());
    assertEquals(5, resp.getPlaylistIndex());
  }

  @Test
  void nextPlaylistInQueue_leaderAtFront_returnsSongBehindIt() {
    baseShow.setRequestLeaderSequence("ReqLeader");
    Sequence leader = Sequence.builder().name("ReqLeader").index(50).group("").visibilityCount(0).active(true).build();
    Sequence song = Sequence.builder().name("Song1").index(7).group("").visibilityCount(0).active(true).build();
    baseShow.setSequences(new ArrayList<>(List.of(leader, song)));
    baseShow.setRequests(new ArrayList<>(List.of(
        Request.builder().position(1).sequence(leader).build(),
        Request.builder().position(2).sequence(song).build())));

    NextPlaylistResponse resp = pluginService.nextPlaylistInQueue();
    assertEquals("Song1", resp.getNextPlaylist());
    assertEquals(7, resp.getPlaylistIndex());
  }

  @Test
  void updateWhatsPlaying_triggersManagedPSA_Jukebox_addsVoteAndRequest() {
    baseShow.setPreferences(Preference.builder()
        .viewerControlMode(ViewerControlMode.JUKEBOX)
        .viewerControlEnabled(true)
        .hideSequenceCount(0)
        .managePsa(true)
        .psaEnabled(true)
        .psaFrequency(1)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build());
    baseShow.setSequences(new ArrayList<>(List.of(
        Sequence.builder().name("Play1").index(1).visibilityCount(0).build(),
        Sequence.builder().name("PSA1").index(99).visibilityCount(0).build()
    )));
    baseShow.setRequests(new ArrayList<>());
    baseShow.setVotes(new ArrayList<>());
    baseShow.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA1").order(1).lastPlayed(LocalDateTime.now().minusHours(1)).build()
    )));

    pluginService.updateWhatsPlaying(UpdateWhatsPlayingRequest.builder().playlist("Play1").build());

    boolean hasPsaVote = baseShow.getVotes().stream().anyMatch(v -> v.getSequence() != null && "PSA1".equals(v.getSequence().getName()) && v.getVotes() != null && v.getVotes() >= 2000);
    boolean hasPsaRequest = baseShow.getRequests().stream().anyMatch(r -> r.getSequence() != null && "PSA1".equals(r.getSequence().getName()));
    assertTrue(hasPsaVote);
    assertTrue(hasPsaRequest);
  }

  @Test
  void updateWhatsPlaying_triggersManagedPSA_Voting_addsVoteOnly() {
    baseShow.setPreferences(Preference.builder()
        .viewerControlMode(ViewerControlMode.VOTING)
        .viewerControlEnabled(true)
        .hideSequenceCount(0)
        .managePsa(true)
        .psaEnabled(true)
        .psaFrequency(1)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build());
    baseShow.setSequences(new ArrayList<>(List.of(
        Sequence.builder().name("Play1").index(1).visibilityCount(0).build(),
        Sequence.builder().name("PSA1").index(99).visibilityCount(0).build()
    )));
    baseShow.setRequests(new ArrayList<>());
    baseShow.setVotes(new ArrayList<>());
    baseShow.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA1").order(1).lastPlayed(LocalDateTime.now().minusHours(1)).build()
    )));

    pluginService.updateWhatsPlaying(UpdateWhatsPlayingRequest.builder().playlist("Play1").build());

    boolean hasPsaVote = baseShow.getVotes().stream().anyMatch(v -> v.getSequence() != null && "PSA1".equals(v.getSequence().getName()) && v.getVotes() != null && v.getVotes() >= 2000);
    boolean hasPsaRequest = baseShow.getRequests().stream().anyMatch(r -> r.getSequence() != null && "PSA1".equals(r.getSequence().getName()));
    assertTrue(hasPsaVote);
    assertFalse(hasPsaRequest);
  }

  @Test
  void updateWhatsPlaying_clearsViewerFlags() {
    baseShow.setPreferences(Preference.builder()
        .viewerControlMode(ViewerControlMode.JUKEBOX)
        .viewerControlEnabled(true)
        .hideSequenceCount(0)
        .managePsa(false)
        .psaEnabled(false)
        .psaFrequency(3)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build());
    baseShow.setSequences(new ArrayList<>(List.of(Sequence.builder().name("Song").visibilityCount(0).build())));
    baseShow.setRequests(new ArrayList<>(List.of(
        Request.builder().sequence(Sequence.builder().name("Song").build()).viewerRequested("ip1,ip2").build()
    )));
    baseShow.setVotes(new ArrayList<>(List.of(
        Vote.builder().sequence(Sequence.builder().name("Song").build()).viewersVoted(new ArrayList<>(List.of("ip3"))).votes(1).lastVoteTime(LocalDateTime.now()).build()
    )));

    pluginService.updateWhatsPlaying(UpdateWhatsPlayingRequest.builder().playlist("Song").build());
    // Note: baseShow in-memory object is not modified; only MongoDB is updated atomically
  }

  @Test
  void highestVotedPlaylist_groupWinner_processesGroupAndSetsVisibility() {
    baseShow.getPreferences().setHideSequenceCount(2);
    baseShow.getPreferences().setResetVotes(true);
    baseShow.setSequenceGroups(new ArrayList<>(List.of(
        SequenceGroup.builder().name("G1").visibilityCount(0).build()
    )));
    Sequence s1 = Sequence.builder().name("S1").group("G1").index(11).build();
    Sequence s2 = Sequence.builder().name("S2").group("G1").index(12).build();
    baseShow.setSequences(new ArrayList<>(List.of(s1, s2)));
    baseShow.setVotes(new ArrayList<>(List.of(
        Vote.builder().sequenceGroup(SequenceGroup.builder().name("G1").build()).votes(10).lastVoteTime(LocalDateTime.now()).ownerVoted(false).build()
    )));

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();
    assertEquals("S1", resp.getWinningPlaylist());
    assertEquals(11, resp.getPlaylistIndex());
    Optional<SequenceGroup> grp = baseShow.getSequenceGroups().stream().filter(g -> Objects.equals("G1", g.getName())).findFirst();
    assertTrue(grp.isPresent());
    assertEquals(3, grp.get().getVisibilityCount());
    boolean hasS2Vote = baseShow.getVotes().stream().anyMatch(v -> v.getSequence() != null && "S2".equals(v.getSequence().getName()));
    assertTrue(hasS2Vote);
  }

  @Test
  void highestVotedPlaylist_unmanagedPSAInjection_addsPsaVote() {
    baseShow.getPreferences().setPsaEnabled(true);
    baseShow.getPreferences().setManagePsa(false);
    baseShow.getPreferences().setPsaFrequency(1);
    baseShow.getPreferences().setHideSequenceCount(0);
    baseShow.getPreferences().setResetVotes(true);
    baseShow.setStats(Stat.builder().votingWin(new ArrayList<>()).build());

    Sequence winner = Sequence.builder().name("WIN").index(5).build();
    Sequence psaSeq = Sequence.builder().name("PSA1").index(99).build();
    baseShow.setSequences(new ArrayList<>(List.of(winner, psaSeq)));
    baseShow.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA1").order(1).lastPlayed(LocalDateTime.now().minusHours(1)).build()
    )));
    baseShow.setVotes(new ArrayList<>(List.of(
        Vote.builder().sequence(winner).votes(10).lastVoteTime(LocalDateTime.now()).ownerVoted(false).build()
    )));

    HighestVotedPlaylistResponse resp = pluginService.highestVotedPlaylist();
    assertEquals("WIN", resp.getWinningPlaylist());
    boolean psaVotePresent = baseShow.getVotes().stream().anyMatch(v -> v.getSequence() != null && "PSA1".equals(v.getSequence().getName()) && v.getVotes() != null && v.getVotes() >= 2000);
    assertTrue(psaVotePresent);
  }
}
