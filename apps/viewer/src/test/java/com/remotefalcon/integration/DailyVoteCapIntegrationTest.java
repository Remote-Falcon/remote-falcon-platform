package com.remotefalcon.integration;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import com.remotefalcon.repository.VoteEventRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.*;

import java.util.ArrayList;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;

/**
 * End-to-end test for the daily vote cap (#162, ADR-2/ADR-5): with
 * dailyVoteLimit=2 a voter may cast two votes, and the third is denied with
 * DAILY_VOTE_LIMIT_REACHED (the count comes from the voteEvent collection).
 * Uses Testcontainers for MongoDB (CI / Docker-enabled environments).
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class DailyVoteCapIntegrationTest {

  @Inject
  ShowRepository showRepository;

  @Inject
  VoteEventRepository voteEventRepository;

  private static final String TEST_SUBDOMAIN = "daily-vote-cap-test-show";
  private static final String TEST_IP = "192.168.1.215";

  @BeforeAll
  static void beforeAll() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @BeforeEach
  void setUp() {
    showRepository.findByShowSubdomain(TEST_SUBDOMAIN).ifPresent(show -> showRepository.delete(show));
    voteEventRepository.deleteAll();
    showRepository.persist(createTestShow());
  }

  @AfterEach
  void tearDown() {
    showRepository.findByShowSubdomain(TEST_SUBDOMAIN).ifPresent(show -> showRepository.delete(show));
    voteEventRepository.deleteAll();
  }

  @Test
  @DisplayName("E2E: dailyVoteLimit=2 allows two votes then denies the third")
  void dailyVoteLimit_allowsUpToLimitThenDenies() {
    vote().then().statusCode(200).body("data.voteForSequence", is(true));
    vote().then().statusCode(200).body("data.voteForSequence", is(true));

    vote().then()
        .statusCode(200)
        .body("errors", notNullValue())
        .body("errors[0].extensions.message", containsString("DAILY_VOTE_LIMIT_REACHED"));
  }

  private io.restassured.response.Response vote() {
    return given()
        .contentType(ContentType.JSON)
        .header("CF-Connecting-IP", TEST_IP)
        .body(buildGraphQLRequest("""
            mutation {
              voteForSequence(showSubdomain: "%s", name: "Jingle Bells", latitude: 40.7128, longitude: -74.0060)
            }
            """.formatted(TEST_SUBDOMAIN)))
        .when()
        .post("/graphql");
  }

  private Show createTestShow() {
    Show show = new Show();
    show.setShowSubdomain(TEST_SUBDOMAIN);
    show.setShowName("Daily Vote Cap Test Show");
    show.setLastLoginIp("10.0.0.1");
    show.setPlayingNow("");
    show.setPlayingNext("");

    Preference preferences = new Preference();
    preferences.setCheckIfVoted(false); // same IP may vote repeatedly; the cap is what limits it
    preferences.setDailyVoteLimit(2);
    preferences.setLocationCheckMethod(LocationCheckMethod.NONE);
    preferences.setBlockedViewerIps(new java.util.HashSet<>());
    show.setPreferences(preferences);

    Sequence seq = new Sequence();
    seq.setName("Jingle Bells");
    seq.setDisplayName("Jingle Bells");
    seq.setOrder(1);
    List<Sequence> sequences = new ArrayList<>();
    sequences.add(seq);
    show.setSequences(sequences);

    show.setSequenceGroups(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setActiveViewers(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());

    Stat stats = new Stat();
    stats.setPage(new ArrayList<>());
    stats.setJukebox(new ArrayList<>());
    stats.setVoting(new ArrayList<>());
    show.setStats(stats);

    return show;
  }

  private String buildGraphQLRequest(String query) {
    return """
        {
          "query": "%s"
        }
        """.formatted(query.replace("\n", "\\n").replace("\"", "\\\""));
  }
}
