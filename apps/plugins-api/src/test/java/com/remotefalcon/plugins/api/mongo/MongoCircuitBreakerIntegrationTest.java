package com.remotefalcon.plugins.api.mongo;

import com.mongodb.MongoTimeoutException;
import com.remotefalcon.plugins.api.cache.EmptyPollCache;
import com.remotefalcon.plugins.api.cache.UnknownTokenCache;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.smallrye.faulttolerance.api.CircuitBreakerState;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * S5b end to end against a Mongo that is not there: the real token filter and
 * repository, real driver timeouts. After the request-volume threshold of
 * timeouts the breaker opens and plugin calls get the existing 503 +
 * Retry-After at once instead of waiting out server selection.
 */
@QuarkusTest
@TestProfile(MongoCircuitBreakerIntegrationTest.UnreachableMongo.class)
class MongoCircuitBreakerIntegrationTest {

  private static final long SELECTION_TIMEOUT_MS = 500;
  private static final String TOKEN = "circuit-breaker-test-token";

  public static class UnreachableMongo implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
      return Map.of(
          "quarkus.devservices.enabled", "false",
          "quarkus.mongodb.connection-string", "mongodb://127.0.0.1:1",
          "quarkus.mongodb.server-selection-timeout", SELECTION_TIMEOUT_MS + "ms",
          "remotefalcon.mongodb.circuit-breaker.enabled", "true",
          "remotefalcon.mongodb.circuit-breaker.request-volume-threshold", "4",
          // 1.0: opens only if every counted call failed, which also proves the
          // always-succeeding Panache mongoCollection() calls are not counted.
          "remotefalcon.mongodb.circuit-breaker.failure-ratio", "1.0",
          "remotefalcon.mongodb.circuit-breaker.delay", "60S",
          "remotefalcon.mongodb.circuit-breaker.success-threshold", "1");
    }
  }

  @Inject
  MongoCircuitBreaker breaker;

  @Inject
  UnknownTokenCache unknownTokenCache;

  @Inject
  EmptyPollCache emptyPollCache;

  @BeforeEach
  void reset() {
    breaker.reset();
    unknownTokenCache.clear();
    emptyPollCache.clear();
  }

  private static io.restassured.response.ValidatableResponse poll() {
    return given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15")
        .body("message", equalTo("SERVICE_UNAVAILABLE"));
  }

  @Test
  @DisplayName("Driver timeouts open the breaker; plugin calls then get 503 + Retry-After without waiting")
  void failsFastWhenOpen() {
    assertEquals(CircuitBreakerState.CLOSED, breaker.state());
    for (int i = 0; i < 4; i++) {
      poll();
    }
    assertEquals(CircuitBreakerState.OPEN, breaker.state());

    poll().time(lessThan(SELECTION_TIMEOUT_MS));
    given()
        .header("showtoken", TOKEN)
        .contentType(io.restassured.http.ContentType.JSON)
        .when()
        .post("/fppHeartbeat")
        .then()
        .statusCode(503)
        .header("Retry-After", "15")
        .time(lessThan(SELECTION_TIMEOUT_MS));
  }

  @Test
  @DisplayName("Non-Mongo failures never open the breaker")
  void otherFailuresDoNotCount() {
    for (int i = 0; i < 20; i++) {
      assertThrows(IllegalStateException.class, () -> breaker.call(() -> {
        throw new IllegalStateException("bug");
      }));
    }
    assertEquals(CircuitBreakerState.CLOSED, breaker.state());
    assertThrows(MongoTimeoutException.class, () -> breaker.call(() -> {
      throw new MongoTimeoutException("down");
    }));
  }
}
