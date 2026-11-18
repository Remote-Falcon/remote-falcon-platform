package com.remotefalcon.mongo;

import com.mongodb.MongoTimeoutException;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.smallrye.faulttolerance.api.CircuitBreakerState;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S5b end to end against a Mongo that is not there: real repositories, real
 * driver timeouts. After the request-volume threshold of timeouts the breaker
 * opens, and calls then fail at once with the existing 503 + Retry-After
 * (REST) / SERVICE_UNAVAILABLE (GraphQL) instead of waiting out the driver.
 */
@QuarkusTest
@TestProfile(MongoCircuitBreakerIntegrationTest.UnreachableMongo.class)
class MongoCircuitBreakerIntegrationTest {

  private static final long SELECTION_TIMEOUT_MS = 500;

  public static class UnreachableMongo implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
      return Map.of(
          "quarkus.devservices.enabled", "false",
          "quarkus.mongodb.connection-string", "mongodb://127.0.0.1:1",
          "quarkus.mongodb.server-selection-timeout", SELECTION_TIMEOUT_MS + "ms",
          "remotefalcon.mongodb.circuit-breaker.enabled", "true",
          "remotefalcon.mongodb.circuit-breaker.request-volume-threshold", "4",
          // 1.0: the breaker opens only if every counted call in the window
          // failed, so this also proves the interceptor does not count the
          // always-succeeding Panache mongoCollection() calls.
          "remotefalcon.mongodb.circuit-breaker.failure-ratio", "1.0",
          "remotefalcon.mongodb.circuit-breaker.delay", "60S",
          "remotefalcon.mongodb.circuit-breaker.success-threshold", "1");
    }
  }

  @Inject
  MongoCircuitBreaker breaker;

  @BeforeAll
  static void basePath() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @BeforeEach
  void closeBreaker() {
    breaker.reset();
  }

  private static void getShowIsUnavailable() {
    given()
        .contentType(ContentType.JSON)
        .body(Map.of("query", "{ getShow(showSubdomain: \"cb\") { showName } }"))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("errors[0].extensions.message", equalTo("SERVICE_UNAVAILABLE"))
        .body("errors[0].extensions.retryAfterSeconds", equalTo(15));
  }

  private void tripBreaker() {
    for (int i = 0; i < 4; i++) {
      getShowIsUnavailable();
    }
    assertEquals(CircuitBreakerState.OPEN, breaker.state());
  }

  @Test
  @DisplayName("Driver timeouts open the breaker; GraphQL then answers SERVICE_UNAVAILABLE without waiting")
  void graphqlFailsFastWhenOpen() {
    assertEquals(CircuitBreakerState.CLOSED, breaker.state());
    tripBreaker();

    long start = System.nanoTime();
    getShowIsUnavailable();
    long elapsedMs = (System.nanoTime() - start) / 1_000_000;
    assertTrue(elapsedMs < SELECTION_TIMEOUT_MS,
        "open breaker should not wait for server selection, took " + elapsedMs + "ms");
  }

  @Test
  @DisplayName("Open breaker: REST request/vote get 503 + Retry-After: 15")
  void restIs503WhenOpen() {
    tripBreaker();

    given()
        .contentType(ContentType.JSON)
        .body(Map.of("showSubdomain", "cb", "sequence", "Song"))
        .when()
        .post("/addSequenceToQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15")
        .body("message", equalTo("SERVICE_UNAVAILABLE"))
        .time(lessThan(SELECTION_TIMEOUT_MS));

    given()
        .contentType(ContentType.JSON)
        .body(Map.of("showSubdomain", "cb", "sequence", "Song"))
        .when()
        .post("/voteForSequence")
        .then()
        .statusCode(503)
        .header("Retry-After", "15");
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
