package com.remotefalcon.integration;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
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
 * End-to-end test for the collective category request limit (#72): with a
 * Category requestLimit of 1, requesting one member of the category blocks a
 * request for a *different* member of the same category (throttled together),
 * even though each title is individually un-requested.
 * Uses Testcontainers for MongoDB (CI / Docker-enabled environments).
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class CategoryRequestLimitIntegrationTest {

  @Inject
  ShowRepository showRepository;

  private static final String TEST_SUBDOMAIN = "category-request-limit-test-show";
  private static final String TEST_IP = "192.168.1.225";

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
  @DisplayName("E2E: a category requestLimit throttles the whole category collectively")
  void categoryRequestLimit_throttlesCategoryCollectively() {
    // First request: a non-seasonal song — accepted.
    request("Bluey Theme").then().statusCode(200).body("data.addSequenceToQueue", is(true));

    // Second request: a DIFFERENT non-seasonal song — denied, because a member of
    // the "NonSeasonal" category (limit 1) is already within the recent window.
    request("Baby Shark").then()
        .statusCode(200)
        .body("errors", notNullValue())
        .body("errors[0].extensions.message", containsString("SEQUENCE_REQUESTED"));
  }

  private io.restassured.response.Response request(String name) {
    return given()
        .contentType(ContentType.JSON)
        .header("CF-Connecting-IP", TEST_IP)
        .body(buildGraphQLRequest("""
            mutation {
              addSequenceToQueue(showSubdomain: "%s", name: "%s", latitude: 40.7128, longitude: -74.0060)
            }
            """.formatted(TEST_SUBDOMAIN, name)))
        .when()
        .post("/graphql");
  }

  private Show createTestShow() {
    Show show = new Show();
    show.setShowSubdomain(TEST_SUBDOMAIN);
    show.setShowName("Category Request Limit Test Show");
    show.setLastLoginIp("10.0.0.1");
    show.setPlayingNow("");
    show.setPlayingNext("");

    Preference preferences = new Preference();
    preferences.setViewerControlMode(ViewerControlMode.JUKEBOX);
    preferences.setJukeboxDepth(50);          // queue not full
    preferences.setJukeboxRequestLimit(0);    // isolate the category limit from the per-sequence one
    preferences.setCheckIfRequested(false);   // isolate from the already-requested rule
    preferences.setLocationCheckMethod(LocationCheckMethod.NONE);
    preferences.setPsaEnabled(false);
    preferences.setBlockedViewerIps(new java.util.HashSet<>());
    show.setPreferences(preferences);

    // Two non-seasonal songs sharing one category with a collective limit of 1.
    List<Sequence> sequences = new ArrayList<>();
    sequences.add(sequence("Bluey Theme", "NonSeasonal", 1));
    sequences.add(sequence("Baby Shark", "NonSeasonal", 2));
    show.setSequences(sequences);

    List<Category> categories = new ArrayList<>();
    categories.add(Category.builder().name("NonSeasonal").requestLimit(1).build());
    show.setCategories(categories);

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

  private static Sequence sequence(String name, String category, int order) {
    Sequence seq = new Sequence();
    seq.setName(name);
    seq.setDisplayName(name);
    seq.setCategory(category);
    seq.setActive(true);
    seq.setVisible(true);
    seq.setOrder(order);
    return seq;
  }

  private String buildGraphQLRequest(String query) {
    return """
        {
          "query": "%s"
        }
        """.formatted(query.replace("\n", "\\n").replace("\"", "\\\""));
  }
}
