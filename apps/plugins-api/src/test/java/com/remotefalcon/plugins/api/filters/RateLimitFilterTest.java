package com.remotefalcon.plugins.api.filters;

import com.remotefalcon.plugins.api.ratelimit.PluginRateLimiter;
import com.remotefalcon.plugins.api.ratelimit.PluginRateLimiter.Mode;
import com.remotefalcon.plugins.api.ratelimit.TokenBucketLimiter;
import com.remotefalcon.plugins.api.ratelimit.TokenBucketLimiter.Limit;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RateLimitFilterTest {

  private static final String TOKEN_A = "abcdefghijklmnopqrstuvwxy";
  private static final String TOKEN_B = "zyxwvutsrqponmlkjihgfedcb";

  private final AtomicLong nanos = new AtomicLong(1_000_000_000L);
  private final List<String> warnings = new ArrayList<>();

  private RateLimitFilter filter(Mode mode) {
    PluginRateLimiter limiter = new PluginRateLimiter(
        mode,
        new Limit(120, 30),
        new Limit(6, 3),
        new Limit(60, 30),
        new TokenBucketLimiter(1000, Duration.ofMinutes(10), nanos::get));
    RateLimitFilter filter = new RateLimitFilter();
    filter.limiter = limiter;
    filter.warnSink = warnings::add;
    return filter;
  }

  private static ContainerRequestContext request(String path, String remoteToken) {
    ContainerRequestContext ctx = mock(ContainerRequestContext.class);
    UriInfo uriInfo = mock(UriInfo.class);
    when(uriInfo.getPath()).thenReturn(path);
    when(ctx.getUriInfo()).thenReturn(uriInfo);
    when(ctx.getHeaderString("remotetoken")).thenReturn(remoteToken);
    return ctx;
  }

  /** Sends {@code count} requests 1s apart; returns how many were aborted. */
  private int send(RateLimitFilter filter, String path, String token, int count) {
    int aborted = 0;
    for (int i = 0; i < count; i++) {
      nanos.addAndGet(Duration.ofSeconds(1).toNanos());
      ContainerRequestContext ctx = request(path, token);
      filter.filter(ctx);
      try {
        verify(ctx, never()).abortWith(any());
      } catch (AssertionError e) {
        aborted++;
      }
    }
    return aborted;
  }

  @Test
  void logModeNeverRejectsButLogsOncePerMinute() {
    RateLimitFilter filter = filter(Mode.LOG);

    // The broken install: syncPlaylists at 1/s for 3 minutes.
    assertEquals(0, send(filter, "/syncPlaylists", TOKEN_A, 180));

    assertEquals(3, warnings.size(), warnings.toString());
    String line = warnings.get(0);
    assertTrue(line.startsWith("RATE_LIMIT token=abcdef\u2026 endpoint=/syncPlaylists rate="), line);
    assertTrue(line.contains("mode=log"), line);
    assertTrue(!line.contains(TOKEN_A), "never log the whole token: " + line);
    // A 1/s loop reads as about 60/min (sliding-window estimate).
    assertTrue(warnings.get(2).matches(".* rate=(59|60|61)/min .*"), warnings.get(2));
  }

  @Test
  void enforceModeReturns429WithRetryAfter() {
    RateLimitFilter filter = filter(Mode.ENFORCE);
    assertEquals(0, send(filter, "/syncPlaylists", TOKEN_A, 3));

    // Burst spent; the 4th, 1s later, has only 0.1 of a token.
    nanos.addAndGet(Duration.ofSeconds(1).toNanos());
    ContainerRequestContext ctx = request("/syncPlaylists", TOKEN_A);
    filter.filter(ctx);

    ArgumentCaptor<Response> response = ArgumentCaptor.forClass(Response.class);
    verify(ctx).abortWith(response.capture());
    assertEquals(429, response.getValue().getStatus());
    long retryAfter = Long.parseLong(response.getValue().getHeaderString("Retry-After"));
    assertTrue(retryAfter >= 1 && retryAfter <= 10, "Retry-After " + retryAfter);
    assertEquals(1, warnings.size());
    assertTrue(warnings.get(0).contains("mode=enforce"), warnings.get(0));
  }

  @Test
  void tokensAreIndependent() {
    RateLimitFilter filter = filter(Mode.ENFORCE);
    send(filter, "/syncPlaylists", TOKEN_A, 10);

    assertEquals(0, send(filter, "/syncPlaylists", TOKEN_B, 1));
  }

  @Test
  void endpointsAreIndependent() {
    RateLimitFilter filter = filter(Mode.ENFORCE);
    send(filter, "/syncPlaylists", TOKEN_A, 10);

    assertEquals(0, send(filter, "/fppHeartbeat", TOKEN_A, 1),
        "a sync loop must not cost the show its heartbeat");
  }

  @Test
  void normalTrafficIsNeverLimited() {
    RateLimitFilter filter = filter(Mode.ENFORCE);
    // Old plugins (no 2s floor) poll at 1/s in interrupt mode: an hour of it.
    assertEquals(0, send(filter, "/nextPlaylistInQueue", TOKEN_A, 3600));
    assertEquals(0, send(filter, "/highestVotedPlaylist", TOKEN_A, 600));
    assertEquals(0, send(filter, "/updateWhatsPlaying", TOKEN_A, 600));
    assertTrue(warnings.isEmpty(), warnings.toString());
  }

  @Test
  void missingTokenPassesThroughToAuth() {
    RateLimitFilter filter = filter(Mode.ENFORCE);
    assertEquals(0, send(filter, "/syncPlaylists", null, 50));
    assertEquals(0, send(filter, "/syncPlaylists", "", 50));
  }

  @Test
  void offModeNeverLimitsOrLogs() {
    RateLimitFilter filter = filter(Mode.OFF);
    assertEquals(0, send(filter, "/syncPlaylists", TOKEN_A, 200));
    assertTrue(warnings.isEmpty());
  }

  @Test
  void healthCheckIsNeverLimited() {
    RateLimitFilter filter = filter(Mode.ENFORCE);
    assertEquals(0, send(filter, "/actuator/health", TOKEN_A, 500));
  }

  @Test
  void modeParsesLeniently() {
    assertEquals(Mode.OFF, Mode.parse("off"));
    assertEquals(Mode.ENFORCE, Mode.parse(" ENFORCE "));
    assertEquals(Mode.LOG, Mode.parse("log"));
    assertEquals(Mode.LOG, Mode.parse("bogus"), "an unknown value falls back to the safe default");
    assertEquals(Mode.LOG, Mode.parse(null));
  }
}
