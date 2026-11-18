package com.remotefalcon.plugins.api.filters;

import com.remotefalcon.plugins.api.ratelimit.PluginRateLimiter;
import com.remotefalcon.plugins.api.ratelimit.PluginRateLimiter.Mode;
import com.remotefalcon.plugins.api.ratelimit.TokenBucketLimiter.Decision;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

import java.util.Map;
import java.util.function.Consumer;

/**
 * Per-show-token rate limit, keyed by the plugin's show token.
 *
 * <p>Runs before {@link ShowTokenFilter} (lower priority value runs first),
 * so a rejected call never reaches Mongo. A call without a token passes
 * through untouched and gets ShowTokenFilter's 401.
 *
 * <p>{@code log} mode (the default) never rejects; it writes one
 * {@code RATE_LIMIT} WARN line per token and endpoint per minute while over
 * the limit, so the limits can be checked against real traffic before
 * {@code enforce} is switched on. {@code enforce} answers 429 with
 * {@code Retry-After}, which the FPP plugin treats like the Mongo 503: a
 * backoff floor, clamped to 120s.
 */
@Provider
@Priority(Priorities.AUTHENTICATION)
public class RateLimitFilter implements ContainerRequestFilter {

  private static final Logger LOG = Logger.getLogger(RateLimitFilter.class);
  private static final int TOKEN_PREFIX_LENGTH = 6;
  public static final String CODE = "RATE_LIMITED";

  @Inject
  PluginRateLimiter limiter;

  Consumer<String> warnSink = LOG::warn;

  @Override
  public void filter(ContainerRequestContext requestContext) {
    Mode mode = limiter.mode();
    if (mode == Mode.OFF) {
      return;
    }
    String path = requestContext.getUriInfo().getPath();
    if (path.endsWith("/actuator/health")) {
      return;
    }
    String showToken = ShowTokenFilter.showToken(requestContext);
    if (showToken == null || showToken.isEmpty()) {
      return;
    }

    Decision decision = limiter.check(path, showToken);
    if (decision.allowed()) {
      return;
    }
    if (decision.logNow()) {
      warnSink.accept(logLine(showToken, path, decision, mode));
    }
    if (mode == Mode.ENFORCE) {
      requestContext.abortWith(tooManyRequests(decision.retryAfterSeconds()));
    }
  }

  private String logLine(String showToken, String path, Decision decision, Mode mode) {
    String prefix = showToken.length() > TOKEN_PREFIX_LENGTH
        ? showToken.substring(0, TOKEN_PREFIX_LENGTH)
        : showToken;
    return String.format("RATE_LIMIT token=%s\u2026 endpoint=%s rate=%d/min limit=%s mode=%s",
        prefix, path, decision.observedPerMinute(),
        PluginRateLimiter.describeLimit(limiter.limitFor(path)), mode.label());
  }

  static Response tooManyRequests(long retryAfterSeconds) {
    return Response.status(Response.Status.TOO_MANY_REQUESTS)
        .header("Retry-After", String.valueOf(retryAfterSeconds))
        .type(MediaType.APPLICATION_JSON_TYPE)
        .entity(Map.of("message", CODE, "retryAfterSeconds", retryAfterSeconds))
        .build();
  }
}
