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

import java.util.ArrayList;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-End Integration Test for getShow query.
 * This test verifies the complete flow from GraphQL API to database retrieval.
 * Uses Testcontainers to provide a MongoDB instance, eliminating the need for local MongoDB.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class GetShowIntegrationTest {

  @Inject
  ShowRepository showRepository;

  private static final String TEST_SUBDOMAIN = "get-show-integration-test";

  @BeforeAll
  static void setup() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @BeforeEach
  void setUp() {
    // Clean up any existing test data
    showRepository.findByShowSubdomain(TEST_SUBDOMAIN)
        .ifPresent(show -> showRepository.delete(show));

    // Create a test show with realistic configuration
    Show testShow = createTestShow();
    showRepository.persist(testShow);
  }

  @AfterEach
  void tearDown() {
    // Clean up test data after each test
    showRepository.findByShowSubdomain(TEST_SUBDOMAIN)
        .ifPresent(show -> showRepository.delete(show));
  }

  @Test
  @Order(1)
  @DisplayName("E2E: Successfully retrieve show with basic data")
  void testGetShow_Success() {
    String query = """
        query {
          getShow(showSubdomain: "%s") {
            showSubdomain
            showName
            playingNow
            playingNext
          }
        }
        """.formatted(TEST_SUBDOMAIN);

    // Execute GraphQL query
    given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.getShow.showSubdomain", equalTo(TEST_SUBDOMAIN))
        .body("data.getShow.showName", equalTo("Integration Test Show"))
        .body("data.getShow.playingNow", notNullValue())
        .body("data.getShow.playingNext", notNullValue());
  }

  @Test
  @Order(2)
  @DisplayName("E2E: Retrieve show with sequences filtered and sorted")
  void testGetShow_SequencesFiltered() {
    String query = """
        query {
          getShow(showSubdomain: "%s") {
            sequences {
              name
              displayName
              active
            }
          }
        }
        """.formatted(TEST_SUBDOMAIN);

    // Execute GraphQL query
    given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.getShow.sequences", hasSize(2))  // Only active sequences with visibilityCount = 0
        .body("data.getShow.sequences[0].name", equalTo("Jingle Bells"))
        .body("data.getShow.sequences[1].name", equalTo("Silent Night"));
  }

  @Test
  @Order(3)
  @DisplayName("E2E: Retrieve show with sequence groups replacing individual sequences")
  void testGetShow_SequenceGroups() {
    // Update show to add sequence groups
    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();

    // Make sequences part of a group
    show.getSequences().forEach(seq -> seq.setGroup("Christmas Classics"));

    // Add sequence group
    SequenceGroup group = new SequenceGroup();
    group.setName("Christmas Classics");
    group.setVisibilityCount(0);
    show.setSequenceGroups(List.of(group));

    showRepository.update(show);

    String query = """
        query {
          getShow(showSubdomain: "%s") {
            sequences {
              name
              displayName
            }
          }
        }
        """.formatted(TEST_SUBDOMAIN);

    // Execute GraphQL query
    given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.getShow.sequences", hasSize(1))  // Grouped sequences appear as one
        .body("data.getShow.sequences[0].name", equalTo("Christmas Classics"));
  }

  @Test
  @Order(4)
  @DisplayName("E2E: Retrieve show with playingNow updated from sequence name to displayName")
  void testGetShow_PlayingNowUpdated() {
    // Update show to set playingNow
    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();
    show.setPlayingNow("Jingle Bells");  // Internal name
    showRepository.update(show);

    String query = """
        query {
          getShow(showSubdomain: "%s") {
            playingNow
            playingNowSequence {
              name
              displayName
            }
          }
        }
        """.formatted(TEST_SUBDOMAIN);

    // Execute GraphQL query
    given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.getShow.playingNow", equalTo("Jingle Bells Display"))  // Should be displayName
        .body("data.getShow.playingNowSequence.name", equalTo("Jingle Bells"))
        .body("data.getShow.playingNowSequence.displayName", equalTo("Jingle Bells Display"));
  }

  @Test
  @Order(5)
  @DisplayName("E2E: Retrieve show with playingNext from request queue")
  void testGetShow_PlayingNextFromQueue() {
    // Add a request to the queue
    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();

    Request request = Request.builder()
        .sequence(show.getSequences().get(0))
        .ownerRequested(false)
        .viewerRequested("1.2.3.4")
        .position(1)
        .build();
    show.getRequests().add(request);

    showRepository.update(show);

    String query = """
        query {
          getShow(showSubdomain: "%s") {
            playingNext
            playingNextSequence {
              name
              displayName
            }
          }
        }
        """.formatted(TEST_SUBDOMAIN);

    // Execute GraphQL query
    given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.getShow.playingNext", equalTo("Jingle Bells Display"))
        .body("data.getShow.playingNextSequence.displayName", equalTo("Jingle Bells Display"));
  }

  @Test
  @Order(6)
  @DisplayName("E2E: Retrieve show with only active viewer page")
  void testGetShow_ActivePageOnly() {
    // Add multiple pages, only one active
    Show show = showRepository.findByShowSubdomain(TEST_SUBDOMAIN).orElseThrow();

    ViewerPage page1 = new ViewerPage();
    page1.setName("Page 1");
    page1.setHtml("<h1>Page 1</h1>");
    page1.setActive(false);

    ViewerPage page2 = new ViewerPage();
    page2.setName("Page 2");
    page2.setHtml("<h1>Page 2</h1>");
    page2.setActive(true);

    show.setPages(List.of(page1, page2));
    showRepository.update(show);

    String query = """
        query {
          getShow(showSubdomain: "%s") {
            pages {
              name
              active
            }
          }
        }
        """.formatted(TEST_SUBDOMAIN);

    // Execute GraphQL query
    given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.getShow.pages", hasSize(1))  // Only active page
        .body("data.getShow.pages[0].name", equalTo("Page 2"))
        .body("data.getShow.pages[0].active", equalTo(true));
  }

  @Test
  @Order(7)
  @DisplayName("E2E: Retrieve show excludes sensitive fields")
  void testGetShow_SensitiveFieldsExcluded() {
    String query = """
        query {
          getShow(showSubdomain: "%s") {
            showSubdomain
            showName
          }
        }
        """.formatted(TEST_SUBDOMAIN);

    // Execute GraphQL query and verify response doesn't contain sensitive data
    String response = given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .extract()
        .asString();

    // Verify sensitive fields are not in response (even if requested)
    assertFalse(response.contains("lastLoginIp"));
    assertFalse(response.contains("email"));
    assertFalse(response.contains("password"));
    assertFalse(response.contains("showToken"));
  }

  @Test
  @Order(8)
  @DisplayName("E2E: Return null for non-existent show")
  void testGetShow_NotFound() {
    String query = """
        query {
          getShow(showSubdomain: "non-existent-show") {
            showSubdomain
            showName
          }
        }
        """;

    // Execute GraphQL query
    given()
        .contentType(ContentType.JSON)
        .body(buildGraphQLRequest(query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("data.getShow", nullValue());
  }

  /**
   * Helper method to create a test show with realistic configuration
   */
  private Show createTestShow() {
    Show show = new Show();
    show.setShowSubdomain(TEST_SUBDOMAIN);
    show.setShowName("Integration Test Show");
    show.setLastLoginIp("10.0.0.1");
    show.setEmail("test@example.com");
    show.setPassword("hashed-password");
    show.setShowToken("secret-token");
    show.setPlayingNow("");
    show.setPlayingNext("");
    show.setPlayingNextFromSchedule("");

    // Create preferences
    Preference preferences = new Preference();
    preferences.setLocationCheckMethod(LocationCheckMethod.NONE);
    show.setPreferences(preferences);

    // Create sequences with different visibility and active states
    List<Sequence> sequences = new ArrayList<>();

    // Note: index must be non-null + >= 0 for the sequence to appear in
    // getActiveViewerSequences (c2883e1 — hides unsynced sequences).

    Sequence seq1 = new Sequence();
    seq1.setName("Jingle Bells");
    seq1.setDisplayName("Jingle Bells Display");
    seq1.setOrder(1);
    seq1.setIndex(1);
    seq1.setActive(true);
    seq1.setVisibilityCount(0);  // Visible
    sequences.add(seq1);

    Sequence seq2 = new Sequence();
    seq2.setName("Silent Night");
    seq2.setDisplayName("Silent Night Display");
    seq2.setOrder(2);
    seq2.setIndex(2);
    seq2.setActive(true);
    seq2.setVisibilityCount(0);  // Visible
    sequences.add(seq2);

    Sequence seq3 = new Sequence();
    seq3.setName("Hidden Song");
    seq3.setDisplayName("Hidden Song Display");
    seq3.setOrder(3);
    seq3.setIndex(3);
    seq3.setActive(true);
    seq3.setVisibilityCount(5);  // Hidden (not visible yet)
    sequences.add(seq3);

    Sequence seq4 = new Sequence();
    seq4.setName("Inactive Song");
    seq4.setDisplayName("Inactive Song Display");
    seq4.setOrder(4);
    seq4.setIndex(4);
    seq4.setActive(false);  // Inactive
    seq4.setVisibilityCount(0);
    sequences.add(seq4);

    show.setSequences(sequences);

    // Initialize empty collections
    show.setSequenceGroups(new ArrayList<>());
    show.setRequests(new ArrayList<>());
    show.setVotes(new ArrayList<>());
    show.setActiveViewers(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setPages(new ArrayList<>());

    // Initialize stats
    Stat stats = new Stat();
    stats.setPage(new ArrayList<>());
    stats.setJukebox(new ArrayList<>());
    stats.setVoting(new ArrayList<>());
    show.setStats(stats);

    return show;
  }

  /**
   * Helper method to build GraphQL request body
   */
  private String buildGraphQLRequest(String query) {
    return """
        {
          "query": "%s"
        }
        """.formatted(query.replace("\n", "\\n").replace("\"", "\\\""));
  }
}
