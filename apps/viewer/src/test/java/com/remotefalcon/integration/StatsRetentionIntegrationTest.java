package com.remotefalcon.integration;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-end test for the embedded stat-array retention prune (PRD-009 #132,
 * ADR-5): a stat append first prunes entries older than the 90-day window, so
 * the array can't grow unbounded toward Mongo's 16 MB document limit.
 * Uses Testcontainers for MongoDB (CI / Docker-enabled environments).
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class StatsRetentionIntegrationTest {

  @Inject
  ShowRepository showRepository;

  private static final String TEST_SUBDOMAIN = "stats-retention-test-show";
  private static final String TEST_IP = "192.168.1.210";

  @BeforeAll
  static void beforeAll() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @BeforeEach
  void setUp() {
    showRepository.findByShowSubdomain(TEST_SUBDOMAIN).ifPresent(show -> showRepository.delete(show));
    showRepository.persist(createTestShow());
  }

  @AfterEach
  void tearDown() {
    showRepository.findByShowSubdomain(TEST_SUBDOMAIN).ifPresent(show -> showRepository.delete(show));
  }

  @Test
  @DisplayName("E2E: a vote prunes stats.voting entries older than the retention window")
  void vote_prunesExpiredVotingStats() {
    // Seed one stat well outside the 90-day window and one inside it.
    Show seeded = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();
    seeded.getStats().getVoting().add(Stat.Voting.builder()
        .name("Old Song").dateTime(LocalDateTime.now().minusDays(120)).build());
    seeded.getStats().getVoting().add(Stat.Voting.builder()
        .name("Recent Song").dateTime(LocalDateTime.now().minusDays(10)).build());
    showRepository.update(seeded);

    given()
        .contentType(ContentType.JSON)
        .header("CF-Connecting-IP", TEST_IP)
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

    List<Stat.Voting> voting = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow().getStats().getVoting();
    List<String> names = voting.stream().map(Stat.Voting::getName).toList();

    assertFalse(names.contains("Old Song"), "the 120-day-old stat should be pruned");
    assertTrue(names.contains("Recent Song"), "the 10-day-old stat should be retained");
    assertTrue(names.contains("Jingle Bells"), "the new vote's stat should be appended");
  }

  private Show createTestShow() {
    Show show = new Show();
    show.setShowSubdomain(TEST_SUBDOMAIN);
    show.setShowName("Stats Retention Test Show");
    show.setLastLoginIp("10.0.0.1");
    show.setPlayingNow("");
    show.setPlayingNext("");

    Preference preferences = new Preference();
    preferences.setCheckIfVoted(false);
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
