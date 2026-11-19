package com.remotefalcon.plugins.api.integration;

import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.cache.UnknownTokenCache;
import com.remotefalcon.plugins.api.ratelimit.PluginRateLimiter;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.junit.mockito.InjectSpy;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Season Capacity Plan R2: the per-token rate limit end to end in enforce
 * mode, with a tiny limit so a few calls trip it. The other integration
 * tests run in the default {@code log} mode, which never rejects.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
@TestProfile(RateLimitIntegrationTest.EnforceProfile.class)
class RateLimitIntegrationTest {

  public static class EnforceProfile implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
      return Map.of(
          "plugins-api.rate-limit.mode", "enforce",
          "plugins-api.rate-limit.other.per-minute", "1",
          "plugins-api.rate-limit.other.burst", "2");
    }
  }

  private static final String TOKEN = "rate-limit-token";
  private static final String OTHER_TOKEN = "rate-limit-other-token";
  private static final String BASE_PATH = "/remote-falcon-plugins-api";

  @InjectSpy
  ShowRepository showRepository;

  @Inject
  PluginRateLimiter rateLimiter;

  @Inject
  UnknownTokenCache unknownTokenCache;

  @BeforeAll
  static void setupRestAssured() {
    RestAssured.basePath = BASE_PATH;
  }

  @BeforeEach
  void setUp() {
    deleteShows();
    rateLimiter.clear();
    unknownTokenCache.clear();
    showRepository.persist(createShow(TOKEN, "rate-limit-show"));
    showRepository.persist(createShow(OTHER_TOKEN, "rate-limit-other-show"));
    clearInvocations(showRepository);
  }

  @AfterEach
  void tearDown() {
    deleteShows();
    rateLimiter.clear();
  }

  private static Response preferences(String token) {
    return given().header("remotetoken", token).get("/remotePreferences");
  }

  @Test
  void overTheLimitIs429WithRetryAfterAndNeverReachesMongo() {
    preferences(TOKEN).then().statusCode(200);
    preferences(TOKEN).then().statusCode(200);
    clearInvocations(showRepository);

    Response limited = preferences(TOKEN);
    limited.then().statusCode(429)
        .body("message", equalTo("RATE_LIMITED"));
    long retryAfter = Long.parseLong(limited.getHeader("Retry-After"));
    assertTrue(retryAfter >= 1 && retryAfter <= 60, "Retry-After " + retryAfter);

    verify(showRepository, never()).findByShowToken(anyString());
  }

  @Test
  void anotherShowIsUnaffected() {
    for (int i = 0; i < 4; i++) {
      preferences(TOKEN);
    }
    preferences(TOKEN).then().statusCode(429);

    preferences(OTHER_TOKEN).then().statusCode(200);
  }

  @Test
  void missingTokenStillGetsTheAuthError() {
    for (int i = 0; i < 5; i++) {
      given().get("/remotePreferences").then().statusCode(401);
    }
  }

  @Test
  void healthCheckIsNeverLimited() {
    for (int i = 0; i < 5; i++) {
      int status = given().header("remotetoken", TOKEN).get("/actuator/health").statusCode();
      assertEquals(200, status);
    }
  }

  private void deleteShows() {
    for (String token : List.of(TOKEN, OTHER_TOKEN)) {
      Show.mongoCollection().deleteMany(com.mongodb.client.model.Filters.eq("showToken", token));
    }
  }

  private static Show createShow(String token, String subdomain) {
    Show show = new Show();
    show.setShowToken(token);
    show.setShowName("Rate Limit Show");
    show.setShowSubdomain(subdomain);
    show.setSequences(new ArrayList<>());
    show.setSequenceGroups(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setPreferences(Preference.builder()
        .viewerControlEnabled(true)
        .viewerControlMode(ViewerControlMode.JUKEBOX)
        .hideSequenceCount(0)
        .managePsa(false)
        .psaEnabled(false)
        .psaFrequency(3)
        .resetVotes(true)
        .sequencesPlayed(0)
        .build());
    return show;
  }
}
