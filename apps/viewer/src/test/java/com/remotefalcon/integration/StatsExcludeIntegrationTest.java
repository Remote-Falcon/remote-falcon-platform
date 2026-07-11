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
import java.util.HashSet;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-end test for stats exclusion (#168): a vote from an operator-excluded
 * IP still registers the vote, but writes no voteEvent and no stats.voting entry,
 * so the operator's test/record traffic doesn't pollute analytics or the daily cap.
 * Uses Testcontainers for MongoDB (CI / Docker-enabled environments).
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class StatsExcludeIntegrationTest {

  @Inject
  ShowRepository showRepository;

  @Inject
  VoteEventRepository voteEventRepository;

  private static final String TEST_SUBDOMAIN = "stats-exclude-test-show";
  private static final String EXCLUDED_IP = "192.168.1.220";

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
  @DisplayName("E2E: a vote from an excluded IP registers + counts toward the cap (voteEvent) but records no voting stat")
  void excludedIp_voteRegistersButNoStats() {
    given()
        .contentType(ContentType.JSON)
        .header("CF-Connecting-IP", EXCLUDED_IP)
        .body(buildGraphQLRequest("""
            mutation {
              voteForSequence(showSubdomain: "%s", name: "Jingle Bells", latitude: 40.7128, longitude: -74.0060)
            }
            """.formatted(TEST_SUBDOMAIN)))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.voteForSequence", is(true));

    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();

    // The vote itself still registered...
    assertEquals(1, show.getVotes().size(), "the vote should still register");
    assertEquals("Jingle Bells", show.getVotes().get(0).getSequence().getName());

    // ...but it left no OPERATOR-ANALYTICS footprint: stats.voting stays empty.
    assertTrue(show.getStats().getVoting().isEmpty(), "no stats.voting entry for an excluded IP");
    // It DOES write a voteEvent — that is the #162 daily-cap counter / audit store,
    // which is separate from operator analytics. #168 excludes a device from STATS,
    // not from the vote cap (cap exemption is #156 votingExemptIps).
    assertEquals(1, voteEventRepository.find("showId", show.id).list().size(),
        "excluded IP still records a voteEvent so the #162 cap counts it");
  }

  private Show createTestShow() {
    Show show = new Show();
    show.setShowSubdomain(TEST_SUBDOMAIN);
    show.setShowName("Stats Exclude Test Show");
    show.setLastLoginIp("10.0.0.1");
    show.setPlayingNow("");
    show.setPlayingNext("");

    Preference preferences = new Preference();
    preferences.setCheckIfVoted(false);
    preferences.setLocationCheckMethod(LocationCheckMethod.NONE);
    preferences.setBlockedViewerIps(new HashSet<>());
    preferences.setStatsExcludedIps(new HashSet<>(List.of(EXCLUDED_IP)));
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
