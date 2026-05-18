package com.remotefalcon.controller;

import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.service.GraphQLMutationService;
import com.remotefalcon.service.GraphQLQueryService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@QuarkusTest
class GraphQLControllerTest {

  @Inject
  GraphQLController controller;

  @InjectMock
  GraphQLMutationService mutationService;

  @InjectMock
  GraphQLQueryService queryService;

  // Controller normalizes the @DefaultValue("") viewerId via emptyToNull(),
  // so service-level mocks/verifications match `null`, not "".

  @Test
  @DisplayName("insertViewerPageStats delegates to mutation service and returns result")
  void testInsertViewerPageStats() {
    LocalDateTime now = LocalDateTime.now();
    when(mutationService.insertViewerPageStats("sub", now, null)).thenReturn(true);

    Boolean result = controller.insertViewerPageStats("sub", now, "");

    assertTrue(result);
    verify(mutationService).insertViewerPageStats("sub", now, null);
  }

  @Test
  @DisplayName("updateActiveViewers delegates to mutation service and returns result")
  void testUpdateActiveViewers() {
    when(mutationService.updateActiveViewers("sub", null)).thenReturn(true);

    Boolean result = controller.updateActiveViewers("sub", "");

    assertTrue(result);
    verify(mutationService).updateActiveViewers("sub", null);
  }

  @Test
  @DisplayName("updatePlayingNow delegates to mutation service and returns result")
  void testUpdatePlayingNow() {
    when(mutationService.updatePlayingNow("sub", "Track A")).thenReturn(true);

    Boolean result = controller.updatePlayingNow("sub", "Track A");

    assertTrue(result);
    verify(mutationService).updatePlayingNow("sub", "Track A");
  }

  @Test
  @DisplayName("updatePlayingNext delegates to mutation service and returns result")
  void testUpdatePlayingNext() {
    when(mutationService.updatePlayingNext("sub", "Track B")).thenReturn(true);

    Boolean result = controller.updatePlayingNext("sub", "Track B");

    assertTrue(result);
    verify(mutationService).updatePlayingNext("sub", "Track B");
  }

  @Test
  @DisplayName("addSequenceToQueue delegates to mutation service and returns result")
  void testAddSequenceToQueue() {
    when(mutationService.addSequenceToQueue("sub", "Song", 1.23f, 4.56f, null)).thenReturn(true);

    Boolean result = controller.addSequenceToQueue("sub", "Song", 1.23, 4.56, "");

    assertTrue(result);
    verify(mutationService).addSequenceToQueue("sub", "Song", 1.23f, 4.56f, null);
  }

  @Test
  @DisplayName("voteForSequence delegates to mutation service and returns result")
  void testVoteForSequence() {
    when(mutationService.voteForSequence("sub", "Song", 1.23f, 4.56f, null)).thenReturn(true);

    Boolean result = controller.voteForSequence("sub", "Song", 1.23, 4.56, "");

    assertTrue(result);
    verify(mutationService).voteForSequence("sub", "Song", 1.23f, 4.56f, null);
  }

  @Test
  @DisplayName("getShow delegates to query service and returns the show")
  void testGetShow() {
    Show show = mock(Show.class);
    when(queryService.getShow("sub")).thenReturn(show);

    Show actual = controller.getShow("sub");

    assertSame(show, actual);
    verify(queryService).getShow("sub");
  }

  @Test
  @DisplayName("activeViewerPage delegates to query service and returns the page")
  void testActiveViewerPage() {
    when(queryService.activeViewerPage("sub")).thenReturn("PAGE");

    String page = controller.activeViewerPage("sub");

    assertEquals("PAGE", page);
    verify(queryService).activeViewerPage("sub");
  }
}
