package com.remotefalcon.integration;

import com.remotefalcon.entity.VoteEvent;
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
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-end test for the per-vote audit collection (PRD-009 #165, ADR-1/ADR-5):
 * a successful vote writes one {@code voteEvent} document keyed on the immutable
 * Show id with a per-doc expiry, and a rejected vote writes none (post-allow).
 * Uses Testcontainers for MongoDB (CI / Docker-enabled environments).
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class VoteEventIntegrationTest {

  @Inject
  ShowRepository showRepository;

  @Inject
  VoteEventRepository voteEventRepository;

  private static final String TEST_SUBDOMAIN = "voteevent-integration-test-show";
  private static final String TEST_IP = "192.168.1.205";

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
  @DisplayName("E2E: a successful sequence vote writes one voteEvent keyed on the immutable show id")
  void sequenceVote_writesVoteEvent() {
    vote("Jingle Bells", TEST_IP);

    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();
    List<VoteEvent> events = voteEventRepository.find("showId", show.id).list();

    assertEquals(1, events.size(), "exactly one voteEvent should be recorded");
    VoteEvent event = events.get(0);
    assertEquals(show.id, event.getShowId());
    assertEquals("Jingle Bells", event.getSequenceName());
    assertEquals(TEST_IP, event.getIp());
    assertNotNull(event.getVotedAt());
    assertEquals(event.getVotedAt().plusDays(VoteEventRepository.DEFAULT_RETENTION_DAYS), event.getExpireAt(),
        "expireAt must be votedAt + the retention window (drives the TTL index)");
  }

  @Test
  @DisplayName("E2E: a successful group vote writes a voteEvent named for the group")
  void groupVote_writesVoteEvent() {
    vote("Christmas Classics", TEST_IP);

    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();
    List<VoteEvent> events = voteEventRepository.find("showId", show.id).list();

    assertEquals(1, events.size());
    assertEquals("Christmas Classics", events.get(0).getSequenceName());
  }

  @Test
  @DisplayName("E2E: a rejected vote (blocked IP) writes no voteEvent (post-allow only)")
  void rejectedVote_writesNoVoteEvent() {
    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();
    show.getPreferences().getBlockedViewerIps().add(TEST_IP);
    showRepository.update(show);

    given()
        .contentType(ContentType.JSON)
        .header("CF-Connecting-IP", TEST_IP)
        .body(buildGraphQLRequest(voteMutation("Jingle Bells")))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("errors", org.hamcrest.Matchers.notNullValue());

    assertEquals(0, voteEventRepository.find("showId", show.id).list().size(),
        "no voteEvent should be written for a rejected vote");
  }

  private void vote(String name, String ip) {
    given()
        .contentType(ContentType.JSON)
        .header("CF-Connecting-IP", ip)
        .body(buildGraphQLRequest(voteMutation(name)))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.voteForSequence", is(true));
  }

  private String voteMutation(String name) {
    return """
        mutation {
          voteForSequence(
            showSubdomain: "%s",
            name: "%s",
            latitude: 40.7128,
            longitude: -74.0060
          )
        }
        """.formatted(TEST_SUBDOMAIN, name);
  }

  private Show createTestShow() {
    Show show = new Show();
    show.setShowSubdomain(TEST_SUBDOMAIN);
    show.setShowName("VoteEvent Integration Test Show");
    show.setLastLoginIp("10.0.0.1");
    show.setPlayingNow("");
    show.setPlayingNext("");

    Preference preferences = new Preference();
    preferences.setCheckIfVoted(false);
    preferences.setLocationCheckMethod(LocationCheckMethod.NONE);
    preferences.setBlockedViewerIps(new java.util.HashSet<>());
    show.setPreferences(preferences);

    List<Sequence> sequences = new ArrayList<>();
    Sequence seq1 = new Sequence();
    seq1.setName("Jingle Bells");
    seq1.setDisplayName("Jingle Bells");
    seq1.setOrder(1);
    sequences.add(seq1);
    show.setSequences(sequences);

    List<SequenceGroup> sequenceGroups = new ArrayList<>();
    SequenceGroup group = new SequenceGroup();
    group.setName("Christmas Classics");
    group.setVisibilityCount(0);
    sequenceGroups.add(group);
    show.setSequenceGroups(sequenceGroups);

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
