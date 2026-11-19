package com.remotefalcon.integration;

import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import io.restassured.config.DecoderConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.*;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * S2 (Season Prep R2): inline data-URI artwork leaves the polled getShow
 * response as a short URL, and the bytes are served once from a cacheable
 * endpoint.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class ArtworkEndpointIntegrationTest {

  private static final String SUB = "artwork-endpoint-it";
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 13, 'I', 'H', 'D', 'R'};
  private static final String DATA_URI = "data:image/png;base64," + Base64.getEncoder().encodeToString(PNG);
  private static final String LINK = "https://cdn.example.com/art.jpg";

  @Inject
  ShowRepository showRepository;

  @BeforeAll
  static void setup() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @BeforeEach
  void setUp() {
    showRepository.findByShowSubdomain(SUB).ifPresent(showRepository::delete);
    Show show = new Show();
    show.setShowSubdomain(SUB);
    show.setShowName("Artwork IT");
    show.setPlayingNow("");
    show.setPlayingNext("");
    show.setPreferences(Preference.builder().build());
    show.setSequenceGroups(new ArrayList<>());
    show.setSequences(new ArrayList<>(List.of(
        Sequence.builder().name("inline").displayName("Inline").order(1).index(0).active(true)
            .visibilityCount(0).imageUrl(DATA_URI).build(),
        Sequence.builder().name("linked").displayName("Linked").order(2).index(1).active(true)
            .visibilityCount(0).imageUrl(LINK).build())));
    show.setRequests(new ArrayList<>(List.of(Request.builder().position(1).viewerRequested("1.2.3.4")
        .sequence(Sequence.builder().name("inline").displayName("Inline").imageUrl(DATA_URI).build()).build())));
    show.setVotes(new ArrayList<>());
    showRepository.persist(show);
  }

  @AfterEach
  void tearDown() {
    showRepository.findByShowSubdomain(SUB).ifPresent(showRepository::delete);
  }

  private static Map<String, Object> getShowQuery() {
    return Map.of("query", """
        query { getShow(showSubdomain: "%s") {
          sequences { name imageUrl }
          requests { sequence { name imageUrl } position }
        } }
        """.formatted(SUB));
  }

  private String inlineReference() {
    return given().contentType(ContentType.JSON).body(getShowQuery())
        .when().post("/graphql")
        .then().statusCode(200)
        .extract().path("data.getShow.sequences.find { it.name == 'inline' }.imageUrl");
  }

  private static String pathOf(String reference) {
    // Test config has no public URL, so the reference is root-relative.
    return reference.substring("/remote-falcon-viewer".length());
  }

  @Test
  @DisplayName("getShow returns a short artwork URL for data URIs and passes links through")
  void getShowReturnsReferences() {
    given().contentType(ContentType.JSON).body(getShowQuery())
        .when().post("/graphql")
        .then().statusCode(200)
        .body("errors", nullValue())
        .body("data.getShow.sequences.find { it.name == 'inline' }.imageUrl",
            matchesRegex("/remote-falcon-viewer/artwork/" + SUB + "/[0-9a-f]{32}\\.png"))
        .body("data.getShow.sequences.find { it.name == 'linked' }.imageUrl", equalTo(LINK))
        .body("data.getShow.requests[0].sequence.imageUrl",
            matchesRegex("/remote-falcon-viewer/artwork/" + SUB + "/[0-9a-f]{32}\\.png"));
  }

  @Test
  @DisplayName("the artwork endpoint serves the decoded bytes with immutable caching headers")
  void endpointServesBytes() {
    String ref = inlineReference();
    String hash = ref.substring(ref.lastIndexOf('/') + 1, ref.lastIndexOf('.'));

    Response response = given().when().get(pathOf(ref));

    assertEquals(200, response.statusCode());
    assertEquals("image/png", response.contentType());
    assertArrayEquals(PNG, response.asByteArray());
    assertEquals("public, max-age=31536000, immutable", response.header("Cache-Control"));
    assertEquals("\"" + hash + "\"", response.header("ETag"));
    assertEquals("nosniff", response.header("X-Content-Type-Options"));
    assertNotNull(response.header("Content-Security-Policy"));
  }

  @Test
  @DisplayName("the extension is cosmetic: the bare hash serves the same bytes")
  void bareHashWorks() {
    String ref = inlineReference();
    String bare = pathOf(ref).substring(0, pathOf(ref).lastIndexOf('.'));

    Response response = given().when().get(bare);

    assertEquals(200, response.statusCode());
    assertArrayEquals(PNG, response.asByteArray());
  }

  @Test
  @DisplayName("If-None-Match with the current ETag returns 304")
  void conditionalRequest() {
    String ref = inlineReference();
    String hash = ref.substring(ref.lastIndexOf('/') + 1, ref.lastIndexOf('.'));

    given().header("If-None-Match", "\"" + hash + "\"")
        .when().get(pathOf(ref))
        .then().statusCode(304);
  }

  @Test
  @DisplayName("a hash that no longer matches any artwork is a non-cacheable 404")
  void wrongHash404() {
    given().when().get("/artwork/" + SUB + "/" + "0".repeat(32) + ".png")
        .then().statusCode(404)
        .header("Cache-Control", "no-store");
  }

  @Test
  @DisplayName("a malformed hash or unknown show is a 404")
  void malformed404() {
    given().when().get("/artwork/" + SUB + "/not-a-hash").then().statusCode(404);
    String ref = inlineReference();
    String file = ref.substring(ref.lastIndexOf('/') + 1);
    given().when().get("/artwork/no-such-show/" + file).then().statusCode(404);
  }

  @Test
  @DisplayName("GraphQL JSON is gzip-compressed when the client accepts it")
  void graphqlCompressed() {
    Response response = given()
        .config(RestAssuredConfig.config().decoderConfig(DecoderConfig.decoderConfig().noContentDecoders()))
        .header("Accept-Encoding", "gzip")
        .contentType(ContentType.JSON).body(getShowQuery())
        .when().post("/graphql");

    assertEquals(200, response.statusCode());
    assertEquals("gzip", response.header("Content-Encoding"));
  }

  @Test
  @DisplayName("artwork bytes are not re-compressed (already-compressed formats)")
  void artworkNotCompressed() {
    String ref = inlineReference();
    Response response = given()
        .config(RestAssuredConfig.config().decoderConfig(DecoderConfig.decoderConfig().noContentDecoders()))
        .header("Accept-Encoding", "gzip")
        .when().get(pathOf(ref));

    assertEquals(200, response.statusCode());
    assertNull(response.header("Content-Encoding"));
  }
}
