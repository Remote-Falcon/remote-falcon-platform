package com.remotefalcon.service;

import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.SequenceGroup;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@QuarkusTest
class GraphQLQueryServiceTest {

  @Inject
  GraphQLQueryService service;

  @InjectMock
  ShowRepository showRepository;

  private Show mockShowWithBasicCollections() {
    Show show = mock(Show.class);
    when(show.getSequences()).thenReturn(new ArrayList<>());
    when(show.getSequenceGroups()).thenReturn(new ArrayList<>());
    when(show.getRequests()).thenReturn(new ArrayList<>());
    return show;
  }

  private Sequence mockSequence(String name, String displayName, int order, boolean active, int visibilityCount,
      String group) {
    Sequence seq = mock(Sequence.class);
    when(seq.getName()).thenReturn(name);
    when(seq.getDisplayName()).thenReturn(displayName);
    when(seq.getOrder()).thenReturn(order);
    when(seq.getActive()).thenReturn(active);
    when(seq.getVisibilityCount()).thenReturn(visibilityCount);
    when(seq.getGroup()).thenReturn(group);
    return seq;
  }

  @Nested
  @DisplayName("getShow")
  class GetShowTests {
    @Test
    @DisplayName("Should set playingNow by matching name and use request with lowest position for playingNext")
    void shouldPopulatePlayingNowAndNextFromRequest() {
      // Show and repository
      Show show = mockShowWithBasicCollections();
      when(show.getPlayingNow()).thenReturn("song1");

      // Sequences: one matches playing now, others filtered
      Sequence s1 = mockSequence("song1", "Song One", 2, true, 0, null);
      Sequence s2 = mockSequence("song2", "Song Two", 1, true, 1, null); // filtered by visibility
      Sequence s3 = mockSequence("song3", "Song Three", 3, false, 0, null); // filtered by active
      show.getSequences().add(s1);
      show.getSequences().add(s2);
      show.getSequences().add(s3);

      // Requests - choose lowest position
      Sequence nextSeq = mockSequence("next", "Next Display", 0, true, 0, null);
      Request r1 = mock(Request.class);
      when(r1.getPosition()).thenReturn(5);
      Request r2 = mock(Request.class);
      when(r2.getPosition()).thenReturn(1);
      when(r2.getSequence()).thenReturn(nextSeq);
      show.getRequests().add(r1);
      show.getRequests().add(r2);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      // When
      Show result = service.getShow("sub");

      // Then - same instance is returned
      assertSame(show, result);

      // playing now updated to display name and sequence set
      verify(show).setPlayingNow("Song One");
      verify(show).setPlayingNowSequence(s1);

      // next from requests
      verify(show).setPlayingNext("Next Display");
      verify(show).setPlayingNextSequence(nextSeq);

      // sequences processed: only s1 remains (filtered and sorted)
      ArgumentCaptor<List<Sequence>> captor = ArgumentCaptor.forClass(List.class);
      verify(show).setSequences(captor.capture());
      List<Sequence> processed = captor.getValue();
      assertEquals(1, processed.size());
      assertSame(s1, processed.get(0));
    }

    @Test
    @DisplayName("Should fall back to schedule when no requests and set playingNext from sequence display name")
    void shouldUseScheduleWhenNoRequests() {
      Show show = mockShowWithBasicCollections();
      when(show.getPlayingNow()).thenReturn("songA");

      Sequence sA = mockSequence("songA", "Song A", 1, true, 0, null);
      Sequence sB = mockSequence("songB", "Song B", 2, true, 0, null);
      show.getSequences().add(sA);
      show.getSequences().add(sB);

      when(show.getPlayingNextFromSchedule()).thenReturn("songB");

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      Show result = service.getShow("sub");
      assertSame(show, result);

      verify(show).setPlayingNow("Song A");
      verify(show).setPlayingNowSequence(sA);

      // No requests, so should pick from schedule "songB" and use display name
      verify(show).setPlayingNext("Song B");
      verify(show).setPlayingNextSequence(sB);
    }

    @Test
    @DisplayName("Voting mode should ignore stale requests and use schedule for playingNext (#78 regression guard)")
    void votingModeIgnoresRequestsAndUsesSchedule() {
      // Reproduces the #78 scenario: a show in VOTING mode with a stale
      // entry in `requests` (the PSA, left over from a prior jukebox-mode
      // session — voting mode never consumes the request queue via
      // nextPlaylistInQueue). Before the fix, every getShow saw the stale
      // request as the min-by-position and overwrote playingNext with
      // the PSA's displayName, masking the actual scheduled sequence.
      Show show = mockShowWithBasicCollections();
      when(show.getPlayingNow()).thenReturn("WizardsInWinter");

      Preference voting = mock(Preference.class);
      when(voting.getViewerControlMode()).thenReturn(ViewerControlMode.VOTING);
      when(show.getPreferences()).thenReturn(voting);

      // Stale PSA request — should be ignored in voting mode.
      Sequence staleAnnouncement = mockSequence("Announcement", "Announcement", 0, true, 0, null);
      Request stalePsaRequest = mock(Request.class);
      when(stalePsaRequest.getPosition()).thenReturn(1);
      // No need to stub getSequence() — voting-mode path never touches it.
      show.getRequests().add(stalePsaRequest);

      // Actual scheduled next, surfaced by the FPP plugin via
      // updateNextScheduledSequence — this is what playingNext SHOULD be.
      Sequence wizards = mockSequence("WizardsInWinter", "Wizards In Winter", 1, true, 0, null);
      show.getSequences().add(wizards);
      show.getSequences().add(staleAnnouncement);
      when(show.getPlayingNextFromSchedule()).thenReturn("WizardsInWinter");

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      // playingNext must reflect the schedule, NOT the stale PSA request.
      verify(show).setPlayingNext("Wizards In Winter");
      verify(show).setPlayingNextSequence(wizards);
      verify(show, never()).setPlayingNext("Announcement");
      verify(show, never()).setPlayingNextSequence(staleAnnouncement);
    }

    @Test
    @DisplayName("Should replace grouped sequences with single entry using group name and avoid duplicates")
    void shouldReplaceSequencesWithGroups() {
      Show show = mockShowWithBasicCollections();
      when(show.getPlayingNow()).thenReturn("none");

      // Two sequences in same group, both active and visible
      Sequence s1 = mockSequence("a1", "A1", 2, true, 0, "Group1");
      Sequence s2 = mockSequence("a2", "A2", 1, true, 0, "Group1");
      Sequence independent = mockSequence("b", "B", 3, true, 0, null);
      show.getSequences().add(s1);
      show.getSequences().add(s2);
      show.getSequences().add(independent);

      // Group that should replace s2 or s1 only once. Because of sorting by order,
      // s2 (order=1) comes before s1 (order=2) and will be the one kept.
      SequenceGroup group = mock(SequenceGroup.class);
      when(group.getName()).thenReturn("Group1");
      when(group.getVisibilityCount()).thenReturn(0);
      show.getSequenceGroups().add(group);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      ArgumentCaptor<List<Sequence>> captor = ArgumentCaptor.forClass(List.class);
      verify(show).setSequences(captor.capture());
      List<Sequence> processed = captor.getValue();

      // We expect two entries: one for the group (replacing sequences in group), and
      // the independent one
      assertEquals(2, processed.size());
      Sequence grouped = processed.get(0); // due to sorting, grouped entry first
      Sequence other = processed.get(1);

      // Ensure the grouped sequence had its fields updated to group data
      verify(grouped).setName("Group1");
      verify(grouped).setDisplayName("Group1");
      verify(grouped).setVisibilityCount(0);

      assertSame(independent, other);
    }

    @Test
    @DisplayName("Should return null when show not found")
    void shouldReturnNullWhenShowMissing() {
      when(showRepository.findByShowSubdomainForViewer("missing")).thenReturn(Optional.empty());
      Show result = service.getShow("missing");
      assertNull(result);
    }
  }

  @Nested
  @DisplayName("activeViewerPage")
  class ActiveViewerPageTests {
    @Test
    @DisplayName("Returns html of active page when present")
    void returnsActivePageHtml() {
      Show show = mock(Show.class);
      List<ViewerPage> pages = new ArrayList<>();
      ViewerPage inactive = mock(ViewerPage.class);
      when(inactive.getActive()).thenReturn(false);
      ViewerPage active = mock(ViewerPage.class);
      when(active.getActive()).thenReturn(true);
      when(active.getHtml()).thenReturn("<h1>Active</h1>");
      pages.add(inactive);
      pages.add(active);
      when(show.getPages()).thenReturn(pages);

      when(showRepository.findPagesOnlyByShowSubdomain("sub")).thenReturn(Optional.of(show));

      String html = service.activeViewerPage("sub");
      assertEquals("<h1>Active</h1>", html);
    }

    @Test
    @DisplayName("Returns empty string when no active page exists")
    void returnsEmptyWhenNoActive() {
      Show show = mock(Show.class);
      List<ViewerPage> pages = new ArrayList<>();
      ViewerPage inactive = mock(ViewerPage.class);
      when(inactive.getActive()).thenReturn(false);
      pages.add(inactive);
      when(show.getPages()).thenReturn(pages);

      when(showRepository.findPagesOnlyByShowSubdomain("sub")).thenReturn(Optional.of(show));

      String html = service.activeViewerPage("sub");
      assertEquals("", html);
    }

    @Test
    @DisplayName("Returns empty string when show not found")
    void returnsEmptyWhenShowMissing() {
      when(showRepository.findPagesOnlyByShowSubdomain("missing")).thenReturn(Optional.empty());
      String html = service.activeViewerPage("missing");
      assertEquals("", html);
    }

    @Test
    @DisplayName("Returns empty string when pages list is null")
    void returnsEmptyWhenPagesNull() {
      Show show = mock(Show.class);
      when(show.getPages()).thenReturn(null);
      when(showRepository.findPagesOnlyByShowSubdomain("sub")).thenReturn(Optional.of(show));
      String html = service.activeViewerPage("sub");
      assertEquals("", html);
    }
  }

  // ---- PSA-v2 PR-4 — Q2 isSongLike skip predicate in updatePlayingNext ----

  @Nested
  @DisplayName("updatePlayingNext (PSA-v2 Q2 skip predicate)")
  class PsaV2PlayingNextTests {

    // Return a real Preference, not a mock: these helpers are evaluated INSIDE
    // when(show.getPreferences()).thenReturn(jukeboxPrefs()), so stubbing inside
    // a mock here starts a nested when() while the outer stubbing is still
    // ongoing — Mockito throws UnfinishedStubbingException (and, since these
    // classes don't use MockitoExtension, the dirty state leaks into the next
    // test class). A plain builder is behaviorally identical here; only
    // viewerControlMode is read by updatePlayingNext's skip predicate.
    private Preference jukeboxPrefs() {
      return Preference.builder().viewerControlMode(ViewerControlMode.JUKEBOX).build();
    }

    private Preference votingPrefs() {
      return Preference.builder().viewerControlMode(ViewerControlMode.VOTING).build();
    }

    @Test
    @DisplayName("Jukebox: PSA at front of queue is skipped, next song reported")
    void jukeboxSkipsPsaAtFront() {
      Show show = mockShowWithBasicCollections();
      when(show.getPreferences()).thenReturn(jukeboxPrefs());
      when(show.getPlayingNow()).thenReturn("");
      when(show.getPsaSequences()).thenReturn(new ArrayList<>(List.of(
          PsaSequence.builder().name("PSA1").build())));
      when(show.getRequestLeaderSequence()).thenReturn(null);
      when(show.getVoteLeaderSequence()).thenReturn(null);

      Sequence psa = mockSequence("PSA1", "PSA One", 1, true, 0, null);
      Sequence song = mockSequence("Song1", "Song One", 2, true, 0, null);
      show.getSequences().add(psa);
      show.getSequences().add(song);

      Request psaReq = mock(Request.class);
      when(psaReq.getPosition()).thenReturn(1);
      when(psaReq.getSequence()).thenReturn(psa);
      Request songReq = mock(Request.class);
      when(songReq.getPosition()).thenReturn(2);
      when(songReq.getSequence()).thenReturn(song);
      show.getRequests().add(psaReq);
      show.getRequests().add(songReq);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      verify(show).setPlayingNext("Song One");
      verify(show).setPlayingNextSequence(song);
      verify(show, never()).setPlayingNext("PSA One");
    }

    @Test
    @DisplayName("Jukebox: PSA-PSA-Song queue → reports the song after multi-skip")
    void jukeboxMultiSkipPsas() {
      Show show = mockShowWithBasicCollections();
      when(show.getPreferences()).thenReturn(jukeboxPrefs());
      when(show.getPlayingNow()).thenReturn("");
      when(show.getPsaSequences()).thenReturn(new ArrayList<>(List.of(
          PsaSequence.builder().name("PSA1").build(),
          PsaSequence.builder().name("PSA2").build())));
      when(show.getRequestLeaderSequence()).thenReturn(null);
      when(show.getVoteLeaderSequence()).thenReturn(null);

      Sequence song = mockSequence("Song1", "Song One", 1, true, 0, null);
      show.getSequences().add(song);

      // Build sequence mocks BEFORE the outer when() — calling a stubbing
      // helper inside when(...).thenReturn(...) is a nested when()
      // (UnfinishedStubbingException).
      Sequence psa1Seq = mockSequence("PSA1", "PSA One", 0, true, 0, null);
      Request psa1Req = mock(Request.class);
      when(psa1Req.getPosition()).thenReturn(1);
      when(psa1Req.getSequence()).thenReturn(psa1Seq);
      Sequence psa2Seq = mockSequence("PSA2", "PSA Two", 0, true, 0, null);
      Request psa2Req = mock(Request.class);
      when(psa2Req.getPosition()).thenReturn(2);
      when(psa2Req.getSequence()).thenReturn(psa2Seq);
      Request songReq = mock(Request.class);
      when(songReq.getPosition()).thenReturn(3);
      when(songReq.getSequence()).thenReturn(song);
      show.getRequests().add(psa1Req);
      show.getRequests().add(psa2Req);
      show.getRequests().add(songReq);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      verify(show).setPlayingNext("Song One");
      verify(show).setPlayingNextSequence(song);
    }

    @Test
    @DisplayName("Jukebox: leader sequence at front is skipped, next song reported")
    void jukeboxSkipsLeader() {
      Show show = mockShowWithBasicCollections();
      when(show.getPreferences()).thenReturn(jukeboxPrefs());
      when(show.getPlayingNow()).thenReturn("");
      when(show.getPsaSequences()).thenReturn(new ArrayList<>());
      when(show.getRequestLeaderSequence()).thenReturn("ReqLeader");
      when(show.getVoteLeaderSequence()).thenReturn(null);

      Sequence song = mockSequence("Song1", "Song One", 1, true, 0, null);
      show.getSequences().add(song);

      Sequence leaderSeq = mockSequence("ReqLeader", "Request Leader", 0, true, 0, null);
      Request leaderReq = mock(Request.class);
      when(leaderReq.getPosition()).thenReturn(1);
      when(leaderReq.getSequence()).thenReturn(leaderSeq);
      Request songReq = mock(Request.class);
      when(songReq.getPosition()).thenReturn(2);
      when(songReq.getSequence()).thenReturn(song);
      show.getRequests().add(leaderReq);
      show.getRequests().add(songReq);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      verify(show).setPlayingNext("Song One");
      verify(show).setPlayingNextSequence(song);
    }

    @Test
    @DisplayName("Voting mode: playingNextFromSchedule is a PSA → playingNext not set")
    void votingModeScheduleIsPsa_doesNotLeakPsaName() {
      // #56 — FPP reports a PSA in playingNextFromSchedule because FPP
      // doesn't know what PSAs are. We must filter on the RF side.
      Show show = mockShowWithBasicCollections();
      when(show.getPreferences()).thenReturn(votingPrefs());
      when(show.getPlayingNow()).thenReturn("");
      when(show.getPsaSequences()).thenReturn(new ArrayList<>(List.of(
          PsaSequence.builder().name("PSA1").build())));
      when(show.getRequestLeaderSequence()).thenReturn(null);
      when(show.getVoteLeaderSequence()).thenReturn(null);
      when(show.getPlayingNextFromSchedule()).thenReturn("PSA1");

      Sequence psaSeq = mockSequence("PSA1", "PSA Display", 1, true, 0, null);
      show.getSequences().add(psaSeq);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      // playingNext must NOT be updated to the PSA name.
      verify(show, never()).setPlayingNext("PSA Display");
      verify(show, never()).setPlayingNextSequence(psaSeq);
      // ...and any stale value is cleared rather than left to leak (item 11).
      verify(show).setPlayingNext("");
    }

    @Test
    @DisplayName("Voting mode: playingNextFromSchedule is a regular song → reports that song")
    void votingModeScheduleIsSong_reportsIt() {
      Show show = mockShowWithBasicCollections();
      when(show.getPreferences()).thenReturn(votingPrefs());
      when(show.getPlayingNow()).thenReturn("");
      when(show.getPsaSequences()).thenReturn(new ArrayList<>(List.of(
          PsaSequence.builder().name("PSA1").build())));
      when(show.getRequestLeaderSequence()).thenReturn(null);
      when(show.getVoteLeaderSequence()).thenReturn(null);
      when(show.getPlayingNextFromSchedule()).thenReturn("Song1");

      Sequence song = mockSequence("Song1", "Song One", 1, true, 0, null);
      show.getSequences().add(song);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      verify(show).setPlayingNext("Song One");
      verify(show).setPlayingNextSequence(song);
    }

    @Test
    @DisplayName("Voting mode: playingNextFromSchedule is a leader → playingNext not set")
    void votingModeScheduleIsLeader_doesNotLeakLeaderName() {
      Show show = mockShowWithBasicCollections();
      when(show.getPreferences()).thenReturn(votingPrefs());
      when(show.getPlayingNow()).thenReturn("");
      when(show.getPsaSequences()).thenReturn(new ArrayList<>());
      when(show.getRequestLeaderSequence()).thenReturn(null);
      when(show.getVoteLeaderSequence()).thenReturn("VoteLeader");
      when(show.getPlayingNextFromSchedule()).thenReturn("VoteLeader");

      Sequence leader = mockSequence("VoteLeader", "Vote Leader Display", 1, true, 0, null);
      show.getSequences().add(leader);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      verify(show, never()).setPlayingNext("Vote Leader Display");
      verify(show, never()).setPlayingNextSequence(leader);
      // Stale value cleared rather than left to leak (review item 11).
      verify(show).setPlayingNext("");
    }

    @Test
    @DisplayName("Jukebox: queue with only PSAs → falls through to schedule (PSA in schedule also filtered)")
    void jukeboxAllPsaQueue_fallsThroughAndFiltersScheduledPsa() {
      Show show = mockShowWithBasicCollections();
      when(show.getPreferences()).thenReturn(jukeboxPrefs());
      when(show.getPlayingNow()).thenReturn("");
      when(show.getPsaSequences()).thenReturn(new ArrayList<>(List.of(
          PsaSequence.builder().name("PSA1").build())));
      when(show.getRequestLeaderSequence()).thenReturn(null);
      when(show.getVoteLeaderSequence()).thenReturn(null);
      when(show.getPlayingNextFromSchedule()).thenReturn("PSA1");

      Sequence psa = mockSequence("PSA1", "PSA One", 1, true, 0, null);
      show.getSequences().add(psa);
      Request psaReq = mock(Request.class);
      when(psaReq.getPosition()).thenReturn(1);
      when(psaReq.getSequence()).thenReturn(psa);
      show.getRequests().add(psaReq);

      when(showRepository.findByShowSubdomainForViewer("sub")).thenReturn(Optional.of(show));

      service.getShow("sub");

      // Neither the queue scan nor the schedule fallback should surface the PSA.
      verify(show, never()).setPlayingNext("PSA One");
      verify(show, never()).setPlayingNextSequence(psa);
    }
  }
}
