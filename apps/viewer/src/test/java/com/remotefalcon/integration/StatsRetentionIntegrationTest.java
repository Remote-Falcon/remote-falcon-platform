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
 * End-to-end tests for the embedded stat-array write behavior.
 *
 * <p>History: until 2026-08 every stat append ran a 90-day {@code $pull}
 * before its push (PRD-009 #132, ADR-5) — doubling the Mongo writes on the
 * viewer hot path and silently overriding the nightly sweep's 18-month
 * retention. Appends are now a single write; retention belongs exclusively
 * to control-panel's {@code purgeStaleStatsForAllShows}, and the only
 * viewer-side bound is a {@code $slice} hard cap that keeps the newest
 * {@code STAT_ARRAY_HARD_CAP} entries as a runaway backstop.
 *
 * <p>Uses Testcontainers for MongoDB (CI / Docker-enabled environments).
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
  @DisplayName("E2E: a vote no longer prunes old stats — retention is the nightly sweep's job")
  void vote_keepsOldStats_retentionBelongsToTheSweep() {
    // Seed one stat far older than the old 90-day window and one recent.
    // Both must survive the append: the viewer write path does retention
    // zero times, not once per vote.
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

    assertTrue(names.contains("Old Song"),
        "old stats must survive viewer writes — 18-month retention is purgeStaleStatsForAllShows' job");
    assertTrue(names.contains("Recent Song"), "the 10-day-old stat should be retained");
    assertTrue(names.contains("Jingle Bells"), "the new vote's stat should be appended");
  }

  @Test
  @DisplayName("appendPageStat: $slice hard cap keeps the newest entries")
  void appendPageStat_capsArrayAtHardLimit_keepingNewest() {
    // Seed the array exactly at the cap, then append one more. The $slice
    // backstop must hold the array at the cap and drop the OLDEST entry.
    final int cap = 50_000;
    Show seeded = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();
    List<Stat.Page> pages = new ArrayList<>(cap);
    LocalDateTime base = LocalDateTime.now().minusDays(30);
    for (int i = 0; i < cap; i++) {
      pages.add(Stat.Page.builder().ip("seed-" + i).dateTime(base.plusSeconds(i)).build());
    }
    seeded.getStats().setPage(pages);
    showRepository.update(seeded);

    showRepository.appendPageStat(TEST_SUBDOMAIN,
        Stat.Page.builder().ip("the-newest").dateTime(LocalDateTime.now()).build());

    List<Stat.Page> after = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow().getStats().getPage();
    assertEquals(cap, after.size(), "array must not grow past STAT_ARRAY_HARD_CAP");
    assertEquals("the-newest", after.get(after.size() - 1).getIp(), "newest entry must be kept");
    assertFalse(after.stream().anyMatch(pg -> "seed-0".equals(pg.getIp())),
        "the oldest entry must be the one sliced away");
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
