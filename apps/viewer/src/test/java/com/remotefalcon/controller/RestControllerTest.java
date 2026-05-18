package com.remotefalcon.controller;

import com.remotefalcon.exception.CustomGraphQLExceptionResolver;
import com.remotefalcon.request.RequestVoteRequest;
import com.remotefalcon.response.RequestVoteResponse;
import com.remotefalcon.service.GraphQLMutationService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@QuarkusTest
class RestControllerTest {

  @Inject
  RestController controller;

  @InjectMock
  GraphQLMutationService mutationService;

  private RequestVoteRequest buildRequest() {
    return RequestVoteRequest.builder()
        .showSubdomain("sub")
        .sequence("Song")
        .viewerLatitude(1.23f)
        .viewerLongitude(4.56f)
        .build();
  }

  @Test
  @DisplayName("addSequenceToQueue returns empty message on success and delegates to service")
  void addSequenceToQueue_success() {
    when(mutationService.addSequenceToQueue("sub", "Song", 1.23f, 4.56f, null)).thenReturn(true);

    RequestVoteRequest request = buildRequest();
    RequestVoteResponse response = controller.addSequenceToQueue(request);

    assertNotNull(response);
    assertNull(response.getMessage(), "Expected no message on success");
    verify(mutationService).addSequenceToQueue("sub", "Song", 1.23f, 4.56f, null);
  }

  @Test
  @DisplayName("addSequenceToQueue returns error message when CustomGraphQLExceptionResolver is thrown")
  void addSequenceToQueue_error() {
    when(mutationService.addSequenceToQueue(anyString(), anyString(), anyFloat(), anyFloat(), any()))
        .thenThrow(new CustomGraphQLExceptionResolver("Queue error"));

    RequestVoteResponse response = controller.addSequenceToQueue(buildRequest());

    assertNotNull(response);
    assertEquals("Queue error", response.getMessage());
    verify(mutationService).addSequenceToQueue("sub", "Song", 1.23f, 4.56f, null);
  }

  @Test
  @DisplayName("voteForSequence returns empty message on success and delegates to service")
  void voteForSequence_success() {
    when(mutationService.voteForSequence("sub", "Song", 1.23f, 4.56f, null)).thenReturn(true);

    RequestVoteResponse response = controller.voteForSequence(buildRequest());

    assertNotNull(response);
    assertNull(response.getMessage(), "Expected no message on success");
    verify(mutationService).voteForSequence("sub", "Song", 1.23f, 4.56f, null);
  }

  @Test
  @DisplayName("voteForSequence returns error message when CustomGraphQLExceptionResolver is thrown")
  void voteForSequence_error() {
    when(mutationService.voteForSequence(anyString(), anyString(), anyFloat(), anyFloat(), any()))
        .thenThrow(new CustomGraphQLExceptionResolver("Vote error"));

    RequestVoteResponse response = controller.voteForSequence(buildRequest());

    assertNotNull(response);
    assertEquals("Vote error", response.getMessage());
    verify(mutationService).voteForSequence("sub", "Song", 1.23f, 4.56f, null);
  }
}
