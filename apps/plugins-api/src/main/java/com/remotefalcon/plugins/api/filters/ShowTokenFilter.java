package com.remotefalcon.plugins.api.filters;

import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
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


  @Override
  public void filter(ContainerRequestContext requestContext) {
    // Skip authentication for health check endpoint
    String path = requestContext.getUriInfo().getPath();
    if (path.endsWith("/actuator/health")) {
      return;
    }

    String showToken = requestContext.getHeaderString("showtoken");
    if (showToken == null) {
      showToken = requestContext.getHeaderString("remotetoken");
    }

    if (showToken == null || showToken.isEmpty()) {
      requestContext.abortWith(
          Response.status(Response.Status.UNAUTHORIZED)
              .entity("Missing or invalid show token")
              .build()
      );
      return;
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
      requestContext.abortWith(
          Response.status(Response.Status.NOT_FOUND)
              .entity("Show not found for the provided token")
              .build()
      );
      return;
    }

    Show show = showOptional.get();
    showContext.setShow(show);
  }


}
