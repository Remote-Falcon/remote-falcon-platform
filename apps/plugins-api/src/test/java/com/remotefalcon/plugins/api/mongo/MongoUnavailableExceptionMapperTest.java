package com.remotefalcon.plugins.api.mongo;

import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.MongoTimeoutException;
import com.mongodb.ServerAddress;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.cache.EmptyPollCache;
import com.remotefalcon.plugins.api.cache.UnknownTokenCache;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import com.remotefalcon.plugins.api.repository.ShowRepository.PollState;
import com.remotefalcon.plugins.api.service.PluginService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.when;

/**
 * Appendix D P1-1: a saturated DB must answer the FPP plugin with a fast
 * 503 + Retry-After (which the next plugin release honors), not a 500 with a
 * stack trace after a 30s wait.
 */
@QuarkusTest
class MongoUnavailableExceptionMapperTest {

  private static final String TOKEN = "mapper-test-token";

  @InjectMock
  ShowRepository showRepository;

  @InjectMock
  PluginService pluginService;

  @Inject
  UnknownTokenCache unknownTokenCache;

  @Inject
  EmptyPollCache emptyPollCache;

  @BeforeEach
  void setUp() {
    unknownTokenCache.clear();
    emptyPollCache.clear();
    // The filter probes poll endpoints before the full load; report queued
    // work so the request reaches the full load and the service.
    when(showRepository.findPollStateByShowToken(TOKEN))
        .thenReturn(Optional.of(new PollState(true, true)));
  }

  @Test
  void timeoutInTokenFilterIs503WithRetryAfter() {
    when(showRepository.findByShowToken(TOKEN))
        .thenThrow(new MongoTimeoutException("Timed out after 2000 ms while waiting for a server"));

    given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15")
        .body("message", equalTo("SERVICE_UNAVAILABLE"))
        .body("retryAfterSeconds", equalTo(15));
  }

  @Test
  void timeoutInPollProbeIs503AndDoesNotCacheTokenAsUnknown() {
    when(showRepository.findPollStateByShowToken(TOKEN))
        .thenThrow(new MongoTimeoutException("Timed out after 2000 ms while waiting for a server"));

    given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15");

    assertFalse(unknownTokenCache.isUnknown(TOKEN));
  }

  @Test
  void readTimeoutInEndpointIs503WithRetryAfter() {
    when(showRepository.findByShowToken(TOKEN)).thenReturn(Optional.of(new Show()));
    when(pluginService.nextPlaylistInQueue())
        .thenThrow(new MongoSocketReadTimeoutException("read timed out", new ServerAddress(), null));

    given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15");
  }

  @Test
  void otherFailuresAreNotRemappedTo503() {
    when(showRepository.findByShowToken(TOKEN)).thenReturn(Optional.of(new Show()));
    when(pluginService.nextPlaylistInQueue()).thenThrow(new IllegalStateException("bug"));

    given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(500);
  }
}
