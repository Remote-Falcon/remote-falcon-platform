package com.remotefalcon.plugins.api.filters;

import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.cache.EmptyPollCache;
import com.remotefalcon.plugins.api.cache.EmptyPollCache.PollKind;
import com.remotefalcon.plugins.api.cache.UnknownTokenCache;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.model.HighestVotedPlaylistResponse;
import com.remotefalcon.plugins.api.model.NextPlaylistResponse;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import com.remotefalcon.plugins.api.repository.ShowRepository.PollState;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import java.util.Optional;

@Provider
@RequestScoped
public class ShowTokenFilter implements ContainerRequestFilter {

  @Inject
  ShowRepository showRepository;

  @Inject
  ShowContext showContext;

  @Inject
  UnknownTokenCache unknownTokenCache;

  @Inject
  EmptyPollCache emptyPollCache;

  @Override
  public void filter(ContainerRequestContext requestContext) {
    // Skip authentication for health check endpoint
    String path = requestContext.getUriInfo().getPath();
    if (path.endsWith("/actuator/health")) {
      return;
    }

    String showToken = showToken(requestContext);

    if (showToken == null || showToken.isEmpty()) {
      requestContext.abortWith(
          Response.status(Response.Status.UNAUTHORIZED)
              .entity("Missing or invalid show token")
              .build()
      );
      return;
    }

    // Plugins left running on a deleted/archived/rotated-away token poll
    // forever. Answer them from memory instead of Mongo.
    if (unknownTokenCache.isUnknown(showToken)) {
      abortNotFound(requestContext);
      return;
    }

    // Empty-queue short-circuit for the two poll endpoints. Interrupt-mode
    // plugins call these about once a second and nearly always find
    // nothing. "Empty" is answered from a ~2s per-pod cache, else from a
    // tiny two-boolean probe; only a non-empty queue pays for the full
    // show load and the service's dequeue path. See EmptyPollCache for why
    // this can delay a request but never skip or double-play one.
    PollKind pollKind = PollKind.fromPath(path);
    if (pollKind != null) {
      if (emptyPollCache.isEmpty(pollKind, showToken)) {
        abortNothingQueued(requestContext, pollKind);
        return;
      }
      Optional<PollState> pollState = this.showRepository.findPollStateByShowToken(showToken);
      if (pollState.isEmpty()) {
        unknownTokenCache.markUnknown(showToken);
        abortNotFound(requestContext);
        return;
      }
      boolean hasWork = pollKind == PollKind.NEXT_IN_QUEUE
          ? pollState.get().hasRequests()
          : pollState.get().hasVotes();
      if (!hasWork) {
        emptyPollCache.markEmpty(pollKind, showToken);
        abortNothingQueued(requestContext, pollKind);
        return;
      }
    }

    // Heartbeat fast path: /fppHeartbeat only reads showToken +
    // lastFppHeartbeat (PluginService.fppHeartbeat), and it's the
    // highest-frequency plugin call (~every 30s per show fleet-wide).
    // Loading the full filter projection for it moves votes/requests/
    // sequences for nothing.
    Optional<Show> showOptional = path.endsWith("/fppHeartbeat")
        ? this.showRepository.findHeartbeatSliceByShowToken(showToken)
        : this.showRepository.findByShowToken(showToken);
    if (showOptional.isEmpty()) {
      unknownTokenCache.markUnknown(showToken);
      abortNotFound(requestContext);
      return;
    }

    Show show = showOptional.get();
    showContext.setShow(show);
  }

  static String showToken(ContainerRequestContext requestContext) {
    String showToken = requestContext.getHeaderString("showtoken");
    if (showToken == null) {
      showToken = requestContext.getHeaderString("remotetoken");
    }
    return showToken;
  }

  private static void abortNotFound(ContainerRequestContext requestContext) {
    requestContext.abortWith(
        Response.status(Response.Status.NOT_FOUND)
            .entity("Show not found for the provided token")
            .build()
    );
  }

  // Same body the service returns for an empty queue / no votes.
  private static void abortNothingQueued(ContainerRequestContext requestContext, PollKind pollKind) {
    Object body = pollKind == PollKind.NEXT_IN_QUEUE
        ? NextPlaylistResponse.empty()
        : HighestVotedPlaylistResponse.empty();
    requestContext.abortWith(Response.ok(body, MediaType.APPLICATION_JSON_TYPE).build());
  }
}
