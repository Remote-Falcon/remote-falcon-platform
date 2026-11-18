package com.remotefalcon.cache;

import com.mongodb.MongoTimeoutException;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Map;
import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * S5a through the real GraphQL stack: once getShow has loaded a show, a Mongo
 * timeout is answered with that show (within max age) instead of
 * SERVICE_UNAVAILABLE, and past max age the error comes back.
 */
@QuarkusTest
@TestProfile(ServeStaleIntegrationTest.ServeStaleOn.class)
class ServeStaleIntegrationTest {

  private static final long MAX_AGE_MS = 1_500;

  public static class ServeStaleOn implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
      return Map.of(
          "remotefalcon.viewer.serve-stale.enabled", "true",
          // Fresh window 0 so every poll goes to the repository mock.
          "remotefalcon.viewer.serve-stale.fresh", "0ms",
          "remotefalcon.viewer.serve-stale.max-age", MAX_AGE_MS + "ms");
    }
  }

  @InjectMock
  ShowRepository showRepository;

  @Inject
  ServeStaleShowCache cache;

  @BeforeAll
  static void basePath() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @BeforeEach
  void clearCache() {
    cache.clear();
  }

  private static Show show(String name) {
    Show show = new Show();
    show.setShowSubdomain("stale");
    show.setShowName(name);
    show.setPreferences(new Preference());
    show.setSequences(new ArrayList<>());
    show.setSequenceGroups(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    return show;
  }

  private static ValidatableResponse getShow() {
    return given()
        .contentType(ContentType.JSON)
        .body(Map.of("query", "{ getShow(showSubdomain: \"stale\") { showName } }"))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200);
  }

  private void mongoDown() {
    when(showRepository.findByShowSubdomainForViewer(anyString()))
        .thenThrow(new MongoTimeoutException("Timed out after 2000 ms while waiting for a server"));
  }

  @Test
  @DisplayName("Mongo timeout within max age: serves the last good show")
  void servesLastGoodShow() {
    when(showRepository.findByShowSubdomainForViewer(anyString())).thenReturn(Optional.of(show("Live")));
    getShow().body("data.getShow.showName", equalTo("Live"));

    mongoDown();
    getShow()
        .body("errors", nullValue())
        .body("data.getShow.showName", equalTo("Live"));
  }

  @Test
  @DisplayName("Mongo timeout past max age: SERVICE_UNAVAILABLE as before")
  void errorsPastMaxAge() throws InterruptedException {
    when(showRepository.findByShowSubdomainForViewer(anyString())).thenReturn(Optional.of(show("Live")));
    getShow().body("data.getShow.showName", equalTo("Live"));

    Thread.sleep(MAX_AGE_MS + 200);
    mongoDown();
    getShow()
        .body("errors[0].extensions.message", equalTo("SERVICE_UNAVAILABLE"))
        .body("errors[0].extensions.retryAfterSeconds", equalTo(15));
  }

  @Test
  @DisplayName("Mongo timeout with nothing cached: SERVICE_UNAVAILABLE")
  void errorsWithNothingCached() {
    mongoDown();
    getShow().body("errors[0].extensions.message", equalTo("SERVICE_UNAVAILABLE"));
  }
}
