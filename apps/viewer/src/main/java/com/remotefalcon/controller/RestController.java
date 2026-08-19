package com.remotefalcon.controller;

import com.remotefalcon.exception.CustomGraphQLExceptionResolver;
import com.remotefalcon.request.RequestVoteRequest;
import com.remotefalcon.response.RequestVoteResponse;
import com.remotefalcon.service.GraphQLMutationService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;

@ApplicationScoped
@Path("/")
public class RestController {
  @Inject
  GraphQLMutationService graphQLMutationService;

  @POST
  @Path("/addSequenceToQueue")
  @Consumes(MediaType.APPLICATION_JSON)
  public RequestVoteResponse addSequenceToQueue(RequestVoteRequest request) {
    try {
      this.graphQLMutationService.addSequenceToQueue(
          request.getShowSubdomain(),
          request.getSequence(),
          request.getViewerLatitude(),
          request.getViewerLongitude(),
          request.getViewerId(),
          // PRD-019 — REST callers don't report browser permission state, so a
          // rejection here can't be split into permission-vs-out-of-range and
          // stays in the plain INVALID_LOCATION bucket. Additive field on
          // RequestVoteRequest if a REST client ever needs the split.
          null);
      return RequestVoteResponse.builder().build();
    } catch (CustomGraphQLExceptionResolver e) {
      Object messageObj = e.getExtensions().get("message");
      String message = messageObj != null ? messageObj.toString() : "An error occurred";
      return RequestVoteResponse.builder()
          .message(message)
          .build();
    }
  }

  @POST
  @Path("/voteForSequence")
  @Consumes(MediaType.APPLICATION_JSON)
  public RequestVoteResponse voteForSequence(RequestVoteRequest request) {
    try {
      this.graphQLMutationService.voteForSequence(
          request.getShowSubdomain(),
          request.getSequence(),
          request.getViewerLatitude(),
          request.getViewerLongitude(),
          request.getViewerId());
      return RequestVoteResponse.builder().build();
    } catch (CustomGraphQLExceptionResolver e) {
      Object messageObj = e.getExtensions().get("message");
      String message = messageObj != null ? messageObj.toString() : "An error occurred";
      return RequestVoteResponse.builder()
          .message(message)
          .build();
    }
  }
}
