package com.remotefalcon.service;

import com.remotefalcon.exception.CustomGraphQLExceptionResolver;
import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.ext.web.RoutingContext;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@QuarkusTest
class GraphQLMutationServiceTest {

  @Inject
  GraphQLMutationService service;

  @InjectMock
  ShowRepository showRepository;

  @InjectMock
  RoutingContext routingContext;

  @InjectMock
  HttpServerRequest httpServerRequest;

  @BeforeEach
  void setUp() {
    reset(showRepository, routingContext, httpServerRequest);
    when(routingContext.request()).thenReturn(httpServerRequest);
    when(httpServerRequest.getHeader("CF-Connecting-IP")).thenReturn("1.2.3.4");
  }

  private Show mockShowWithStatsAndActiveViewers(String lastLoginIp) {
    Show show = mock(Show.class);
    when(show.getLastLoginIp()).thenReturn(lastLoginIp);

    // Stats with real lists
    Stat stats = mock(Stat.class);
    when(stats.getPage()).thenReturn(new ArrayList<>());
    when(stats.getJukebox()).thenReturn(new ArrayList<>());
    when(stats.getVoting()).thenReturn(new ArrayList<>());
    when(show.getStats()).thenReturn(stats);

    // Active viewers list
    List<ActiveViewer> activeViewers = new ArrayList<>();
    when(show.getActiveViewers()).thenReturn(activeViewers);

    return show;
  }

  private Show mockShowWithPrefsAndCollections() {
    // Use deep stubs to allow chaining on getPreferences()
    Show show = mock(Show.class, RETURNS_DEEP_STUBS);
    when(show.getShowSubdomain()).thenReturn("sub");
    when(show.getLastLoginIp()).thenReturn("9.9.9.9");

    // Stats with real lists
    Stat stats = mock(Stat.class);
    when(stats.getPage()).thenReturn(new ArrayList<>());
    when(stats.getJukebox()).thenReturn(new ArrayList<>());
    when(stats.getVoting()).thenReturn(new ArrayList<>());
    when(show.getStats()).thenReturn(stats);

    // Active viewers list
    List<ActiveViewer> activeViewers = new ArrayList<>();
    when(show.getActiveViewers()).thenReturn(activeViewers);

    // Preferences chain
    when(show.getPreferences().getCheckIfVoted()).thenReturn(false);
    when(show.getPreferences().getCheckIfRequested()).thenReturn(false);
    when(show.getPreferences().getJukeboxDepth()).thenReturn(0);
    when(show.getPreferences().getShowLatitude()).thenReturn(0.0f);
    when(show.getPreferences().getShowLongitude()).thenReturn(0.0f);
    when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.NONE);
    when(show.getPreferences().getPsaEnabled()).thenReturn(false);
    when(show.getPreferences().getManagePsa()).thenReturn(false);

    when(show.getSequences()).thenReturn(new ArrayList<>());
    when(show.getSequenceGroups()).thenReturn(new ArrayList<>());
    when(show.getRequests()).thenReturn(new ArrayList<>());
    when(show.getVotes()).thenReturn(new ArrayList<>());
    when(show.getPsaSequences()).thenReturn(new ArrayList<>());

    return show;
  }

  @Nested
  @DisplayName("insertViewerPageStats")
  class InsertViewerPageStatsTests {
    @Test
    @DisplayName("Should add page stat when IP differs from last login")
    void shouldInsertViewerPageStats() {
      when(showRepository.appendPageStatIfNotOwner(eq("test"), eq("1.2.3.4"), any())).thenReturn(1L);

      Boolean result = service.insertViewerPageStats("test", LocalDateTime.now(), "");

      assertTrue(result);
      verify(showRepository).appendPageStatIfNotOwner(eq("test"), eq("1.2.3.4"), argThat(stat ->
          "1.2.3.4".equals(stat.getIp())
      ));
    }

    @Test
    @DisplayName("Should return false when IP equals last login IP (no modification)")
    void shouldReturnFalseWhenSameIp() {
      when(showRepository.appendPageStatIfNotOwner(eq("test"), eq("1.2.3.4"), any())).thenReturn(0L);

      Boolean result = service.insertViewerPageStats("test", LocalDateTime.now(), "");

      assertFalse(result);
      verify(showRepository).appendPageStatIfNotOwner(eq("test"), eq("1.2.3.4"), any());
    }

    @Test
    @DisplayName("Should return true when client IP is empty")
    void shouldReturnTrueWhenClientIpEmpty() {
      // Mock ClientUtil to return empty IP
      when(httpServerRequest.getHeader("CF-Connecting-IP")).thenReturn(null);
      when(httpServerRequest.getHeader("X-Forwarded-For")).thenReturn(null);
      when(httpServerRequest.remoteAddress()).thenReturn(null);

      Boolean result = service.insertViewerPageStats("test", LocalDateTime.now(), "");

      assertTrue(result);
      verify(showRepository, never()).appendPageStatIfNotOwner(anyString(), anyString(), any());
    }
  }

  @Nested
  @DisplayName("updateActiveViewers")
  class UpdateActiveViewersTests {
    @Test
    @DisplayName("Should add active viewer and persist when IP differs from last login and remove existing duplicate")
    void shouldUpdateActiveViewers() {
      Show show = mockShowWithStatsAndActiveViewers("9.9.9.9");
      when(showRepository.findByShowSubdomain("test")).thenReturn(Optional.of(show));

      Boolean result = service.updateActiveViewers("test", "");

      assertTrue(result);
      verify(showRepository).updateActiveViewer(eq("test"), eq("1.2.3.4"), eq(""), any(LocalDateTime.class));
    }

    @Test
    @DisplayName("Should not persist when IP equals last login IP")
    void shouldNotPersistWhenSameIpAsLastLogin() {
      Show show = mockShowWithStatsAndActiveViewers("1.2.3.4");
      when(showRepository.findByShowSubdomain("test")).thenReturn(Optional.of(show));

      Boolean result = service.updateActiveViewers("test", "");

      assertTrue(result);
      verify(showRepository, never()).updateActiveViewer(anyString(), anyString(), anyString(), any());
    }

    @Test
    @DisplayName("Should throw when show not found for active viewers update")
    void shouldThrowWhenShowNotFound() {
      when(showRepository.findByShowSubdomain("missing")).thenReturn(Optional.empty());
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.updateActiveViewers("missing", ""));
    }
  }

  @Nested
  @DisplayName("updatePlayingNow")
  class UpdatePlayingNowTests {
    @Test
    @DisplayName("Should update playing now and persist")
    void shouldUpdatePlayingNow() {
      Show show = mockShowWithStatsAndActiveViewers("9.9.9.9");
      when(showRepository.findByShowSubdomain("test")).thenReturn(Optional.of(show));

      Boolean result = service.updatePlayingNow("test", "Song A");

      assertTrue(result);
      verify(showRepository).updatePlayingNow("test", "Song A");
    }

    @Test
    @DisplayName("Should throw when show not found for playing now update")
    void shouldThrowPlayingNowNotFound() {
      when(showRepository.findByShowSubdomain("missing")).thenReturn(Optional.empty());
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.updatePlayingNow("missing", "Song A"));
    }
  }

  @Nested
  @DisplayName("updatePlayingNext")
  class UpdatePlayingNextTests {
    @Test
    @DisplayName("Should update playing next and persist")
    void shouldUpdatePlayingNext() {
      Show show = mockShowWithStatsAndActiveViewers("9.9.9.9");
      when(showRepository.findByShowSubdomain("test")).thenReturn(Optional.of(show));

      Boolean result = service.updatePlayingNext("test", "Next Song");

      assertTrue(result);
      verify(showRepository).updatePlayingNext("test", "Next Song");
    }

    @Test
    @DisplayName("Should throw when show not found for playing next update")
    void shouldThrowPlayingNextNotFound() {
      when(showRepository.findByShowSubdomain("missing")).thenReturn(Optional.empty());
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.updatePlayingNext("missing", "Next Song"));
    }
  }

  @Nested
  @DisplayName("addSequenceToQueue validations")
  class AddSequenceToQueueValidationTests {
    @Test
    @DisplayName("Should throw UNEXPECTED_ERROR when client IP is empty")
    void shouldThrowWhenClientIpEmpty() {
      when(httpServerRequest.getHeader("CF-Connecting-IP")).thenReturn("");
      Show show = mockShowWithPrefsAndCollections();
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw ALREADY_VOTED when preferences.checkIfVoted is true")
    void shouldThrowAlreadyVotedByPref() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getCheckIfVoted()).thenReturn(true);
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw NAUGHTY when IP is blocked")
    void shouldThrowNaughtyWhenIpBlocked() {
      Show show = mockShowWithPrefsAndCollections();
      Set<String> blocked = new HashSet<>();
      blocked.add("1.2.3.4");
      when(show.getPreferences().getBlockedViewerIps()).thenReturn(blocked);
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw ALREADY_REQUESTED when viewer has requested before and checkIfRequested is true")
    void shouldThrowAlreadyRequested() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getCheckIfRequested()).thenReturn(true);
      Request r = mock(Request.class);
      when(r.getViewerRequested()).thenReturn("1.2.3.4");
      show.getRequests().add(r);
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw QUEUE_FULL when queue depth reached and depth != 0")
    void shouldThrowQueueFull() {
      // PSA-v2 Q3 — the queue-full check counts viewer-initiated requests
      // only (helper filters out null sequences and PSA/leader names). Stub
      // a real Sequence on the request so the helper sees it as song-like.
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getJukeboxDepth()).thenReturn(1);
      Request r = mock(Request.class);
      Sequence seq = mock(Sequence.class);
      when(seq.getName()).thenReturn("SomeSong");
      when(r.getSequence()).thenReturn(seq);
      show.getRequests().add(r);
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw INVALID_LOCATION when latitude or longitude is null")
    void shouldThrowInvalidLocation() {
      Show show = mockShowWithPrefsAndCollections();
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "name", null, 0f, ""));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "name", 0f, null, ""));
    }

    @Test
    @DisplayName("Should throw UNEXPECTED_ERROR when no matching sequence or group found")
    void shouldThrowUnexpectedWhenNoMatch() {
      Show show = mockShowWithPrefsAndCollections();
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      // Pass valid coords (location check NONE by default in mock)
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "unknown", 0f, 0f, ""));
    }

    // ---- PSA-v2 PR-4 Q3 — countViewerRequests in isQueueFull ----

    @Test
    @DisplayName("PSA-v2 Q3: PSAs in queue do not count against jukeboxDepth (3 viewer + 2 PSAs, depth=5 → not full)")
    void psaDoesNotConsumeCap() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getJukeboxDepth()).thenReturn(5);
      when(show.getPsaSequences()).thenReturn(new ArrayList<>(List.of(
          PsaSequence.builder().name("PSA1").build())));
      // 3 viewer requests + 2 PSA requests = 5 total entries; viewer count = 3.
      for (int i = 0; i < 3; i++) {
        Request r = mock(Request.class);
        Sequence seq = mock(Sequence.class);
        when(seq.getName()).thenReturn("Song" + i);
        when(r.getSequence()).thenReturn(seq);
        show.getRequests().add(r);
      }
      for (int i = 0; i < 2; i++) {
        Request r = mock(Request.class);
        Sequence seq = mock(Sequence.class);
        when(seq.getName()).thenReturn("PSA1");
        when(r.getSequence()).thenReturn(seq);
        show.getRequests().add(r);
      }
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));

      // Queue is NOT full → falls through to next validation. Since no
      // sequences match name "unknown", it throws SEQUENCE_NOT_FOUND. The
      // important thing is that QUEUE_FULL is NOT what gets thrown — verify
      // by inspecting the message.
      try {
        service.addSequenceToQueue("sub", "unknown", 0f, 0f, "");
        fail("expected exception");
      } catch (CustomGraphQLExceptionResolver e) {
        assertNotEquals("QUEUE_FULL", e.getMessage());
      }
    }

    @Test
    @DisplayName("PSA-v2 Q3: viewer requests at cap reject regardless of PSAs (5 viewer + 2 PSAs, depth=5 → full)")
    void viewerCapStillEnforcedWithPsasPresent() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getJukeboxDepth()).thenReturn(5);
      when(show.getPsaSequences()).thenReturn(new ArrayList<>(List.of(
          PsaSequence.builder().name("PSA1").build())));
      for (int i = 0; i < 5; i++) {
        Request r = mock(Request.class);
        Sequence seq = mock(Sequence.class);
        when(seq.getName()).thenReturn("Song" + i);
        when(r.getSequence()).thenReturn(seq);
        show.getRequests().add(r);
      }
      for (int i = 0; i < 2; i++) {
        Request r = mock(Request.class);
        Sequence seq = mock(Sequence.class);
        when(seq.getName()).thenReturn("PSA1");
        when(r.getSequence()).thenReturn(seq);
        show.getRequests().add(r);
      }
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));

      try {
        service.addSequenceToQueue("sub", "name", 0f, 0f, "");
        fail("expected exception");
      } catch (CustomGraphQLExceptionResolver e) {
        assertEquals("QUEUE_FULL", e.getMessage());
      }
    }

    @Test
    @DisplayName("PSA-v2 Q3: leader sequences also bypass the cap (5 viewer + 2 leaders, depth=5 → full)")
    void leaderDoesNotConsumeCap() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getJukeboxDepth()).thenReturn(5);
      when(show.getPsaSequences()).thenReturn(new ArrayList<>());
      when(show.getRequestLeaderSequence()).thenReturn("ReqLeader");
      // 5 viewer + 2 leaders = 7 total; viewer count = 5; cap reached.
      for (int i = 0; i < 5; i++) {
        Request r = mock(Request.class);
        Sequence seq = mock(Sequence.class);
        when(seq.getName()).thenReturn("Song" + i);
        when(r.getSequence()).thenReturn(seq);
        show.getRequests().add(r);
      }
      for (int i = 0; i < 2; i++) {
        Request r = mock(Request.class);
        Sequence seq = mock(Sequence.class);
        when(seq.getName()).thenReturn("ReqLeader");
        when(r.getSequence()).thenReturn(seq);
        show.getRequests().add(r);
      }
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));

      try {
        service.addSequenceToQueue("sub", "name", 0f, 0f, "");
        fail("expected exception");
      } catch (CustomGraphQLExceptionResolver e) {
        assertEquals("QUEUE_FULL", e.getMessage());
      }
    }

    @Test
    @DisplayName("PSA-v2 Q3: jukeboxDepth=0 is never full (existing semantic preserved)")
    void depthZeroNeverFull() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getJukeboxDepth()).thenReturn(0);
      // Lots of requests, but depth=0 means unlimited.
      for (int i = 0; i < 50; i++) {
        Request r = mock(Request.class);
        Sequence seq = mock(Sequence.class);
        when(seq.getName()).thenReturn("Song" + i);
        when(r.getSequence()).thenReturn(seq);
        show.getRequests().add(r);
      }
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));

      // Should NOT throw QUEUE_FULL — falls through and throws because
      // sequence not found.
      try {
        service.addSequenceToQueue("sub", "unknown", 0f, 0f, "");
        fail("expected exception");
      } catch (CustomGraphQLExceptionResolver e) {
        assertNotEquals("QUEUE_FULL", e.getMessage());
      }
    }
  }

  @Nested
  @DisplayName("voteForSequence validations")
  class VoteForSequenceValidationTests {
    @Test
    @DisplayName("Should throw UNEXPECTED_ERROR when client IP is empty")
    void voteShouldThrowWhenClientIpEmpty() {
      when(httpServerRequest.getHeader("CF-Connecting-IP")).thenReturn("");
      Show show = mockShowWithPrefsAndCollections();
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.voteForSequence("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw ALREADY_VOTED when preferences.checkIfVoted is true")
    void voteShouldThrowAlreadyVotedByPref() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getCheckIfVoted()).thenReturn(true);
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.voteForSequence("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw NAUGHTY when IP is blocked")
    void voteShouldThrowNaughtyWhenIpBlocked() {
      Show show = mockShowWithPrefsAndCollections();
      show.getPreferences().getBlockedViewerIps().add("1.2.3.4");
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.voteForSequence("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw ALREADY_VOTED when viewer already voted and checkIfVoted is true")
    void voteShouldThrowAlreadyVotedByViewer() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getCheckIfVoted()).thenReturn(true);
      Vote v = mock(Vote.class);
      List<String> voters = new ArrayList<>();
      voters.add("1.2.3.4");
      when(v.getViewersVoted()).thenReturn(voters);
      show.getVotes().add(v);
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.voteForSequence("sub", "name", 0f, 0f, ""));
    }

    @Test
    @DisplayName("Should throw INVALID_LOCATION when latitude or longitude is null")
    void voteShouldThrowInvalidLocation() {
      Show show = mockShowWithPrefsAndCollections();
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.voteForSequence("sub", "name", null, 0f, ""));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.voteForSequence("sub", "name", 0f, null, ""));
    }

    @Test
    @DisplayName("Should throw UNEXPECTED_ERROR when no matching sequence or group found")
    void voteShouldThrowUnexpectedWhenNoMatch() {
      Show show = mockShowWithPrefsAndCollections();
      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.voteForSequence("sub", "unknown", 0f, 0f, ""));
    }
  }

  @Nested
  @DisplayName("addSequenceToQueue success and deeper branches")
  class AddSequenceToQueueMoreCoverageTests {
    @Test
    @DisplayName("GEO within radius allows request; initialize requests; jukebox stat and persist")
    void geoWithinRadiusAllowsSingleSequence() {
      Show show = mockShowWithPrefsAndCollections();
      // Switch to GEO and allow large radius so it passes
      when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.GEO);
      when(show.getPreferences().getShowLatitude()).thenReturn(0.0f);
      when(show.getPreferences().getShowLongitude()).thenReturn(0.0f);

      // Add a sequence match by name
      Sequence s = mock(Sequence.class);
      when(s.getName()).thenReturn("song-a");
      when(s.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(s);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      // Verify DB operations were called with correct data
      verify(showRepository).appendRequestAndJukeboxStat(eq("sub"), argThat(req ->
          req.getPosition() == 1 && "1.2.3.4".equals(req.getViewerRequested())
      ), argThat(stat ->
          "song-a".equals(stat.getName())
      ));
    }

    @Test
    @DisplayName("Append sequence when requests exist; PSA handled (frequency 1) and appended after user request")
    void appendSequenceAndHandlePsa() {
      Show show = mockShowWithPrefsAndCollections();
      // Existing latest position 5
      Request existing = mock(Request.class);
      when(existing.getPosition()).thenReturn(5);
      show.getRequests().add(existing);

      // GEO ok
      when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.GEO);
      when(show.getPreferences().getShowLatitude()).thenReturn(0.0f);
      when(show.getPreferences().getShowLongitude()).thenReturn(0.0f);
      when(show.getPreferences().getAllowedRadius()).thenReturn(10000.0f);

      // PSA enabled and managed by app; frequency 1 ensures trigger
      when(show.getPreferences().getPsaEnabled()).thenReturn(true);
      when(show.getPreferences().getManagePsa()).thenReturn(false);
      when(show.getPreferences().getPsaFrequency()).thenReturn(1);

      // PSA sequences list with one entry. getEnabled() MUST be stubbed: Mockito
      // returns Boolean.FALSE (not null) for an unstubbed Boolean getter, and the
      // handler filters out PSAs where Boolean.FALSE.equals(getEnabled()), so an
      // unstubbed mock would be treated as disabled and never injected.
      PsaSequence psa = mock(PsaSequence.class);
      when(psa.getName()).thenReturn("psa-seq");
      when(psa.getLastPlayed()).thenReturn(LocalDateTime.now().minusDays(1));
      when(psa.getOrder()).thenReturn(1);
      when(psa.getEnabled()).thenReturn(true);
      show.getPsaSequences().add(psa);

      // Show sequences contain user requested and PSA target
      Sequence userSeq = mock(Sequence.class);
      when(userSeq.getName()).thenReturn("user-seq");
      when(userSeq.getDisplayName()).thenReturn("User Seq");
      Sequence psaSeq = mock(Sequence.class);
      when(psaSeq.getName()).thenReturn("psa-seq");
      show.getSequences().add(userSeq);
      show.getSequences().add(psaSeq);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show), Optional.of(show));
      when(showRepository.nextRequestPosition(any(Show.class))).thenReturn(6L, 7L);

      Boolean result = service.addSequenceToQueue("sub", "user-seq", 0f, 0f, "");
      assertTrue(result);

      // Verify user request was added
      verify(showRepository).appendRequestAndJukeboxStat(eq("sub"), argThat(req ->
          req.getPosition() == 6 && "1.2.3.4".equals(req.getViewerRequested())
      ), any());

      // Verify PSA request was added
      verify(showRepository).appendRequest(eq("sub"), argThat(req ->
          req.getPosition() == 7 && "PSA".equals(req.getViewerRequested())
      ));
    }

    @Test
    @DisplayName("Add sequence group: requests for all sequences sorted by order and jukebox stat added")
    void addSequenceGroupRequestsAll() {
      Show show = mockShowWithPrefsAndCollections();
      // GEO ok
      when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.GEO);
      when(show.getPreferences().getShowLatitude()).thenReturn(0.0f);
      when(show.getPreferences().getShowLongitude()).thenReturn(0.0f);
      when(show.getPreferences().getAllowedRadius()).thenReturn(10000.0f);

      // Group and sequences
      SequenceGroup group = mock(SequenceGroup.class);
      when(group.getName()).thenReturn("GroupA");
      show.getSequenceGroups().add(group);

      Sequence s1 = mock(Sequence.class);
      when(s1.getName()).thenReturn("s1");
      when(s1.getDisplayName()).thenReturn("S1");
      when(s1.getGroup()).thenReturn("GroupA");
      when(s1.getOrder()).thenReturn(2);
      Sequence s2 = mock(Sequence.class);
      when(s2.getName()).thenReturn("s2");
      when(s2.getDisplayName()).thenReturn("S2");
      when(s2.getGroup()).thenReturn("GroupA");
      when(s2.getOrder()).thenReturn(1);
      show.getSequences().add(s1);
      show.getSequences().add(s2);

      // Ensure playing now/next are non-null and not matching
      when(show.getPlayingNow()).thenReturn("NotPlaying");
      when(show.getPlayingNext()).thenReturn("NotNext");

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.allocatePositionBlock(show, 2)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "GroupA", 0f, 0f, "");
      assertTrue(result);

      // Verify DB operation was called with group requests
      verify(showRepository).appendMultipleRequestsAndJukeboxStat(eq("sub"), argThat(reqs ->
          reqs.size() == 2 && reqs.get(0).getPosition() == 1 && reqs.get(1).getPosition() == 2
      ), argThat(stat ->
          "GroupA".equals(stat.getName())
      ));
    }

    @Test
    @DisplayName("GEO beyond radius should throw INVALID_LOCATION")
    void geoBeyondRadiusThrows() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.GEO);
      when(show.getPreferences().getShowLatitude()).thenReturn(0.0f);
      when(show.getPreferences().getShowLongitude()).thenReturn(0.0f);
      when(show.getPreferences().getAllowedRadius()).thenReturn(0.1f); // tiny radius

      // Add a sequence so matching passes if reached
      Sequence s = mock(Sequence.class);
      when(s.getName()).thenReturn("song-a");
      when(s.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(s);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));

      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "song-a", 10f, 10f, ""));
    }

    @Test
    @DisplayName("checkIfSequenceRequested: playing now matches by name -> SEQUENCE_REQUESTED")
    void sequenceRequestedWhenPlayingNowByName() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.NONE);

      Sequence s = mock(Sequence.class);
      when(s.getName()).thenReturn("song-a");
      when(s.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(s);
      when(show.getPlayingNow()).thenReturn("song-a");

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "song-a", 0f, 0f, ""));
    }

    @Test
    @DisplayName("checkIfSequenceRequested: playing next matches by displayName -> SEQUENCE_REQUESTED")
    void sequenceRequestedWhenPlayingNextByDisplayName() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.NONE);

      Sequence s = mock(Sequence.class);
      when(s.getName()).thenReturn("song-a");
      when(s.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(s);
      when(show.getPlayingNext()).thenReturn("Song A");

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "song-a", 0f, 0f, ""));
    }

    @Test
    @DisplayName("checkIfSequenceRequested: within request limit -> SEQUENCE_REQUESTED")
    void sequenceRequestedWithinRequestLimit() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getPreferences().getLocationCheckMethod()).thenReturn(LocationCheckMethod.NONE);
      when(show.getPreferences().getJukeboxRequestLimit()).thenReturn(2);

      // Requested sequence
      Sequence s = mock(Sequence.class);
      when(s.getName()).thenReturn("song-a");
      when(s.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(s);

      // Recent requests include this sequence in the last 2
      Request r1 = mock(Request.class);
      when(r1.getPosition()).thenReturn(10);
      Sequence sOther = mock(Sequence.class);
      when(sOther.getName()).thenReturn("other");
      when(r1.getSequence()).thenReturn(sOther);
      Request r2 = mock(Request.class);
      when(r2.getPosition()).thenReturn(11);
      Sequence sPrev = mock(Sequence.class);
      when(sPrev.getName()).thenReturn("song-a");
      when(r2.getSequence()).thenReturn(sPrev);
      show.getRequests().add(r1);
      show.getRequests().add(r2);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      assertThrows(CustomGraphQLExceptionResolver.class, () -> service.addSequenceToQueue("sub", "song-a", 0f, 0f, ""));
    }
  }

  /**
   * PSA-v2 PR-3 (Q6) — request-leader sequence injection on the jukebox path.
   * When {@code Show.requestLeaderSequence} resolves to a real sequence in
   * {@code show.getSequences()}, the leader is injected at the position
   * immediately before the viewer's request so the existing min-position
   * dequeue plays the leader first.
   */
  @Nested
  @DisplayName("addSequenceToQueue leader injection (PSA-v2 PR-3, Q6)")
  class AddSequenceToQueueLeaderInjectionTests {

    @Test
    @DisplayName("requestLeaderSequence set: leader injected at lower position, request at +1; batched write used")
    void leaderInjectedBeforeRequest() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getRequestLeaderSequence()).thenReturn("Leader-Seq");

      Sequence requested = mock(Sequence.class);
      when(requested.getName()).thenReturn("song-a");
      when(requested.getDisplayName()).thenReturn("Song A");
      Sequence leader = mock(Sequence.class);
      when(leader.getName()).thenReturn("Leader-Seq");
      show.getSequences().add(requested);
      show.getSequences().add(leader);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      // Verify the batched write was used with leader at position 1 and the
      // viewer's request at position 2 (leader plays first via min-position
      // dequeue). The leader is marked viewerRequested="LEADER" so it isn't
      // mistaken for a real viewer request.
      verify(showRepository).appendMultipleRequestsAndJukeboxStat(eq("sub"), argThat(reqs ->
          reqs.size() == 2
              && "Leader-Seq".equals(reqs.get(0).getSequence().getName())
              && reqs.get(0).getPosition() == 1
              && "LEADER".equals(reqs.get(0).getViewerRequested())
              && "song-a".equals(reqs.get(1).getSequence().getName())
              && reqs.get(1).getPosition() == 2
              && "1.2.3.4".equals(reqs.get(1).getViewerRequested())
      ), argThat(stat -> "song-a".equals(stat.getName())));

      // The single-row path must NOT be used when a leader fired.
      verify(showRepository, never()).appendRequestAndJukeboxStat(anyString(), any(), any());
    }

    @Test
    @DisplayName("requestLeaderSequence null: no leader injected; existing single-row path used")
    void noLeaderWhenFieldNull() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getRequestLeaderSequence()).thenReturn(null);

      Sequence requested = mock(Sequence.class);
      when(requested.getName()).thenReturn("song-a");
      when(requested.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(requested);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      verify(showRepository).appendRequestAndJukeboxStat(eq("sub"), argThat(req ->
          req.getPosition() == 1 && "1.2.3.4".equals(req.getViewerRequested())
      ), any());
      verify(showRepository, never()).appendMultipleRequestsAndJukeboxStat(anyString(), any(), any());
    }

    @Test
    @DisplayName("requestLeaderSequence empty string: treated as no leader (admin cleared the field)")
    void noLeaderWhenFieldEmpty() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getRequestLeaderSequence()).thenReturn("");

      Sequence requested = mock(Sequence.class);
      when(requested.getName()).thenReturn("song-a");
      when(requested.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(requested);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      verify(showRepository).appendRequestAndJukeboxStat(eq("sub"), any(), any());
      verify(showRepository, never()).appendMultipleRequestsAndJukeboxStat(anyString(), any(), any());
    }

    @Test
    @DisplayName("requestLeaderSequence set but missing from sequences: silently skipped (no leader injected)")
    void noLeaderWhenSequenceMissingFromFpp() {
      Show show = mockShowWithPrefsAndCollections();
      when(show.getRequestLeaderSequence()).thenReturn("Leader-Seq");

      // Only the requested sequence is present; the configured leader is NOT
      // in show.getSequences() (e.g., admin renamed/deleted in FPP).
      Sequence requested = mock(Sequence.class);
      when(requested.getName()).thenReturn("song-a");
      when(requested.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(requested);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      verify(showRepository).appendRequestAndJukeboxStat(eq("sub"), any(), any());
      verify(showRepository, never()).appendMultipleRequestsAndJukeboxStat(anyString(), any(), any());
    }

    @Test
    @DisplayName("requestLeaderSequence equals the requested sequence: no leader injected (review item 9)")
    void noLeaderWhenRequestedSequenceIsTheLeader() {
      // A viewer requests the exact sequence configured as the request leader.
      // Injecting the leader would queue it twice back-to-back, so the leader
      // is skipped and the normal single-row path is used.
      Show show = mockShowWithPrefsAndCollections();
      when(show.getRequestLeaderSequence()).thenReturn("Leader-Seq");

      Sequence leader = mock(Sequence.class);
      when(leader.getName()).thenReturn("Leader-Seq");
      when(leader.getDisplayName()).thenReturn("Leader Seq");
      show.getSequences().add(leader);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "Leader-Seq", 0f, 0f, "");
      assertTrue(result);

      // Single-row path used; the leader is NOT injected as a second row.
      verify(showRepository).appendRequestAndJukeboxStat(eq("sub"), any(), any());
      verify(showRepository, never()).appendMultipleRequestsAndJukeboxStat(anyString(), any(), any());
    }

    @Test
    @DisplayName("voteLeaderSequence set on same show does NOT fire on jukebox path")
    void voteLeaderDoesNotFireOnJukeboxPath() {
      // The two leader fields are independent — voteLeaderSequence is only
      // consulted in the vote-winner promotion path (plugins-api). Setting
      // it on this side should have no effect on jukebox requests.
      Show show = mockShowWithPrefsAndCollections();
      when(show.getRequestLeaderSequence()).thenReturn(null);
      when(show.getVoteLeaderSequence()).thenReturn("Vote-Leader");

      Sequence requested = mock(Sequence.class);
      when(requested.getName()).thenReturn("song-a");
      when(requested.getDisplayName()).thenReturn("Song A");
      Sequence voteLeader = mock(Sequence.class);
      when(voteLeader.getName()).thenReturn("Vote-Leader");
      show.getSequences().add(requested);
      show.getSequences().add(voteLeader);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(1L);

      Boolean result = service.addSequenceToQueue("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      verify(showRepository).appendRequestAndJukeboxStat(eq("sub"), argThat(req ->
          req.getPosition() == 1
      ), any());
      verify(showRepository, never()).appendMultipleRequestsAndJukeboxStat(anyString(), any(), any());
    }

    @Test
    @DisplayName("Same value in both leader fields: jukebox uses requestLeaderSequence (shared leader behavior)")
    void sameLeaderInBothFieldsWorks() {
      // Admin convention: set the same name for "🎵 You picked this!" applied
      // to both request and vote triggers. The jukebox path only reads
      // requestLeaderSequence, so this must still inject normally.
      Show show = mockShowWithPrefsAndCollections();
      when(show.getRequestLeaderSequence()).thenReturn("Shared-Leader");
      when(show.getVoteLeaderSequence()).thenReturn("Shared-Leader");

      Sequence requested = mock(Sequence.class);
      when(requested.getName()).thenReturn("song-a");
      when(requested.getDisplayName()).thenReturn("Song A");
      Sequence shared = mock(Sequence.class);
      when(shared.getName()).thenReturn("Shared-Leader");
      show.getSequences().add(requested);
      show.getSequences().add(shared);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));
      when(showRepository.nextRequestPosition(show)).thenReturn(5L);

      Boolean result = service.addSequenceToQueue("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      verify(showRepository).appendMultipleRequestsAndJukeboxStat(eq("sub"), argThat(reqs ->
          reqs.size() == 2
              && "Shared-Leader".equals(reqs.get(0).getSequence().getName())
              && reqs.get(0).getPosition() == 5
              && "song-a".equals(reqs.get(1).getSequence().getName())
              && reqs.get(1).getPosition() == 6
      ), any());
    }
  }

  @Nested
  @DisplayName("voteForSequence success paths")
  class VoteForSequenceSuccessTests {
    @Test
    @DisplayName("Vote for single sequence succeeds: creates vote, adds voting stat, persists")
    void voteForSingleSequenceSuccess() {
      Show show = mockShowWithPrefsAndCollections();
      // Add a sequence to match by name
      Sequence seq = mock(Sequence.class);
      when(seq.getName()).thenReturn("song-a");
      when(seq.getDisplayName()).thenReturn("Song A");
      show.getSequences().add(seq);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));

      Boolean result = service.voteForSequence("sub", "song-a", 0f, 0f, "");
      assertTrue(result);

      // Verify repository method was called to add new vote with stat
      verify(showRepository).addNewVoteAndStat(eq("sub"), argThat(vote ->
          vote.getSequence() == seq && vote.getVotes() == 1 && vote.getViewersVoted().contains("1.2.3.4")
      ), argThat(stat ->
          "song-a".equals(stat.getName())
      ));
    }

    @Test
    @DisplayName("Vote for sequence group succeeds: delegates to saveSequenceGroupVote and adds voting stat")
    void voteForSequenceGroupSuccess() {
      Show show = mockShowWithPrefsAndCollections();
      // No matching sequence, but a group exists with the given name
      SequenceGroup group = mock(SequenceGroup.class);
      when(group.getName()).thenReturn("GroupX");
      show.getSequenceGroups().add(group);

      when(showRepository.findByShowSubdomainForMutations("sub")).thenReturn(Optional.of(show));

      Boolean result = service.voteForSequence("sub", "GroupX", 0f, 0f, "");
      assertTrue(result);

      // Verify repository method was called to add new group vote with stat
      verify(showRepository).addNewVoteAndStat(eq("sub"), argThat(vote ->
          vote.getSequenceGroup() == group && vote.getVotes() == 1 && vote.getViewersVoted().contains("1.2.3.4")
      ), argThat(stat ->
          "GroupX".equals(stat.getName())
      ));
    }
  }

  @Nested
  @DisplayName("saveSequenceVote private method coverage")
  class SaveSequenceVotePrivateTests {
    @Test
    @DisplayName("Existing vote: increments count, appends viewer IP, updates time, adds stat, persists")
    void existingVoteIncrementPath() throws Exception {
      Show show = mockShowWithPrefsAndCollections();

      // Prepare existing vote for sequence "song-a"
      Sequence seq = mock(Sequence.class);
      when(seq.getName()).thenReturn("song-a");
      Vote existing = Vote.builder()
          .sequence(seq)
          .ownerVoted(false)
          .lastVoteTime(LocalDateTime.now().minusMinutes(5))
          .viewersVoted(new ArrayList<>(List.of("9.9.9.9")))
          .votes(3)
          .build();
      show.getVotes().add(existing);

      // Invoke private method with isGrouped=false
      GraphQLMutationService rawService = new GraphQLMutationService();
      var repoField = GraphQLMutationService.class.getDeclaredField("showRepository");
      repoField.setAccessible(true);
      repoField.set(rawService, showRepository);

      var m = GraphQLMutationService.class.getDeclaredMethod(
          "saveSequenceVote", Show.class, Sequence.class, String.class, String.class, Boolean.class);
      m.setAccessible(true);
      m.invoke(rawService, show, seq, "1.2.3.4", null, Boolean.FALSE);

      // Verify repository method was called to increment existing vote
      verify(showRepository).incrementVoteAndAppendVoter(eq("sub"), eq("song-a"), eq("1.2.3.4"), any(LocalDateTime.class), argThat(stat ->
          stat != null && "song-a".equals(stat.getName())
      ));
    }

    @Test
    @DisplayName("New grouped vote: creates vote with 1001 votes, adds empty viewer IP when blank, no stat, persists")
    void newGroupedVoteCreationPath() throws Exception {
      Show show = mockShowWithPrefsAndCollections();

      Sequence seq = mock(Sequence.class);
      when(seq.getName()).thenReturn("group-seq");

      // Invoke private method with isGrouped=true and empty IP
      GraphQLMutationService rawService = new GraphQLMutationService();
      var repoField = GraphQLMutationService.class.getDeclaredField("showRepository");
      repoField.setAccessible(true);
      repoField.set(rawService, showRepository);

      var m = GraphQLMutationService.class.getDeclaredMethod(
          "saveSequenceVote", Show.class, Sequence.class, String.class, String.class, Boolean.class);
      m.setAccessible(true);
      m.invoke(rawService, show, seq, "", null, Boolean.TRUE);

      // Verify repository method was called to add new grouped vote (no stat for grouped)
      verify(showRepository).addNewVoteAndStat(eq("sub"), argThat(vote ->
          vote.getSequence() == seq && vote.getVotes() == 1001 && vote.getViewersVoted().contains("")
      ), eq(null));
    }
  }

  @Nested
  @DisplayName("saveSequenceGroupVote private method coverage")
  class SaveSequenceGroupVotePrivateTests {
    @Test
    @DisplayName("Existing group vote: increments count, appends viewer IP, updates time, adds stat, persists")
    void existingGroupVoteIncrementPath() throws Exception {
      Show show = mockShowWithPrefsAndCollections();

      // Prepare existing vote for group "GroupG"
      SequenceGroup group = mock(SequenceGroup.class);
      when(group.getName()).thenReturn("GroupG");
      Vote existing = Vote.builder()
          .sequenceGroup(group)
          .ownerVoted(false)
          .lastVoteTime(LocalDateTime.now().minusMinutes(10))
          .viewersVoted(new ArrayList<>(List.of("8.8.8.8")))
          .votes(2)
          .build();
      show.getVotes().add(existing);

      // Raw service with injected repository
      GraphQLMutationService rawService = new GraphQLMutationService();
      var repoField = GraphQLMutationService.class.getDeclaredField("showRepository");
      repoField.setAccessible(true);
      repoField.set(rawService, showRepository);

      var m = GraphQLMutationService.class.getDeclaredMethod(
          "saveSequenceGroupVote", Show.class, SequenceGroup.class, String.class, String.class);
      m.setAccessible(true);
      m.invoke(rawService, show, group, "1.2.3.4", null);

      // Verify repository method was called to increment existing group vote
      verify(showRepository).incrementSequenceGroupVoteAndAppendVoter(eq("sub"), eq("GroupG"), eq("1.2.3.4"), any(LocalDateTime.class), argThat(stat ->
          stat != null && "GroupG".equals(stat.getName())
      ));
    }
  }
}
