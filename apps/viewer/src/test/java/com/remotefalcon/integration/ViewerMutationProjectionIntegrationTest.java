package com.remotefalcon.integration;

import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.bson.BsonArray;
import org.bson.BsonBinary;
import org.bson.BsonBinarySubType;
import org.bson.BsonDateTime;
import org.bson.BsonDocument;
import org.bson.BsonObjectId;
import org.bson.BsonString;
import org.bson.UuidRepresentation;
import org.bson.types.ObjectId;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * R7 (Season Capacity Plan, Appendix C): the public mutations
 * {@code updateActiveViewers}, {@code updatePlayingNow} and
 * {@code updatePlayingNext} used to load the entire show document (stats
 * arrays, inline artwork, page HTML) to read one or two fields. Nothing first
 * party calls them, but they are public, so anyone could trigger whale-document
 * loads at will.
 *
 * <p>These tests pin three things over the real GraphQL endpoint and a real
 * Mongo: the {@code find} each mutation sends carries a narrow projection (read
 * from the driver's command stream, not inferred from the Java return value),
 * the stored result is unchanged, and an unknown subdomain still answers
 * UNEXPECTED_ERROR.
 *
 * <p>The seeded show is written as raw BSON in the backfilled shape:
 * {@code pages[].pageId} is a subtype 3 (Java legacy) UUID. A projected read
 * must decode on these shows (memory: viewer-uuid-representation-getshow).
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class ViewerMutationProjectionIntegrationTest {

  private static final String SUBDOMAIN = "r7-projection-show";
  private static final String MISSING_SUBDOMAIN = "r7-no-such-show";
  private static final String OWNER_IP = "fe80::abcd";
  private static final String VIEWER_IP = "203.0.113.7";

  @Inject
  ShowRepository showRepository;

  @Inject
  RecordingFindListener findListener;

  @BeforeEach
  void setUp() {
    rawShows().deleteMany(Filters.eq("showSubdomain", SUBDOMAIN));
    rawShows().insertOne(backfilledWhaleShow());
    findListener.clear();
  }

  @AfterEach
  void tearDown() {
    rawShows().deleteMany(Filters.eq("showSubdomain", SUBDOMAIN));
  }

  // ---- updatePlayingNow ----------------------------------------------------

  @Test
  @DisplayName("updatePlayingNow reads only sequence names and stores the displayName")
  void updatePlayingNow_projectsSequenceNamesAndResolvesDisplayName() {
    graphql("mutation { updatePlayingNow(showSubdomain: \"" + SUBDOMAIN + "\", playingNow: \"WIZARDS\") }")
        .body("data.updatePlayingNow", is(true));

    assertOnlySequenceNameFinds();
    assertEquals("Wizards in Winter", storedString("playingNow"));
  }

  @Test
  @DisplayName("updatePlayingNow keeps the raw value when no sequence matches")
  void updatePlayingNow_unknownSequenceStoresRawValue() {
    graphql("mutation { updatePlayingNow(showSubdomain: \"" + SUBDOMAIN + "\", playingNow: \"Not Synced\") }")
        .body("data.updatePlayingNow", is(true));

    assertEquals("Not Synced", storedString("playingNow"));
  }

  @Test
  @DisplayName("updatePlayingNow keeps the raw value when the matching displayName is blank")
  void updatePlayingNow_blankDisplayNameStoresRawValue() {
    graphql("mutation { updatePlayingNow(showSubdomain: \"" + SUBDOMAIN + "\", playingNow: \"NoDisplay\") }")
        .body("data.updatePlayingNow", is(true));

    assertEquals("NoDisplay", storedString("playingNow"));
  }

  @Test
  @DisplayName("updatePlayingNow on an unknown show answers UNEXPECTED_ERROR")
  void updatePlayingNow_notFound() {
    graphql("mutation { updatePlayingNow(showSubdomain: \"" + MISSING_SUBDOMAIN + "\", playingNow: \"x\") }")
        .body("errors[0].extensions.message", containsString("UNEXPECTED_ERROR"));
  }

  // ---- updatePlayingNext ---------------------------------------------------

  @Test
  @DisplayName("updatePlayingNext reads only sequence names and stores the displayName")
  void updatePlayingNext_projectsSequenceNamesAndResolvesDisplayName() {
    graphql("mutation { updatePlayingNext(showSubdomain: \"" + SUBDOMAIN + "\", playingNext: \"wizards\") }")
        .body("data.updatePlayingNext", is(true));

    assertOnlySequenceNameFinds();
    assertEquals("Wizards in Winter", storedString("playingNext"));
  }

  @Test
  @DisplayName("updatePlayingNext keeps the raw value when no sequence matches")
  void updatePlayingNext_unknownSequenceStoresRawValue() {
    graphql("mutation { updatePlayingNext(showSubdomain: \"" + SUBDOMAIN + "\", playingNext: \"Not Synced\") }")
        .body("data.updatePlayingNext", is(true));

    assertEquals("Not Synced", storedString("playingNext"));
  }

  @Test
  @DisplayName("updatePlayingNext on an unknown show answers UNEXPECTED_ERROR")
  void updatePlayingNext_notFound() {
    graphql("mutation { updatePlayingNext(showSubdomain: \"" + MISSING_SUBDOMAIN + "\", playingNext: \"x\") }")
        .body("errors[0].extensions.message", containsString("UNEXPECTED_ERROR"));
  }

  // ---- updateActiveViewers -------------------------------------------------

  @Test
  @DisplayName("updateActiveViewers reads only lastLoginIp and records a non-owner viewer")
  void updateActiveViewers_projectsLastLoginIpAndRecordsViewer() {
    graphqlFrom(VIEWER_IP, "mutation { updateActiveViewers(showSubdomain: \"" + SUBDOMAIN + "\", viewerId: \"v-1\") }")
        .body("data.updateActiveViewers", is(true));

    List<BsonDocument> finds = findListener.findsForSubdomain(SUBDOMAIN);
    assertFalse(finds.isEmpty(), "expected a projected read of the show");
    for (BsonDocument find : finds) {
      assertEquals(BsonDocument.parse("{\"lastLoginIp\": 1}"), find.getDocument("projection", null),
          "updateActiveViewers must read lastLoginIp only, never the whole show: " + find.toJson());
    }

    BsonDocument stored = storedRaw();
    BsonArray activeViewers = stored.getArray("activeViewers");
    assertEquals(1, activeViewers.size());
    assertEquals(VIEWER_IP, activeViewers.get(0).asDocument().getString("ipAddress").getValue());
    assertEquals("v-1", activeViewers.get(0).asDocument().getString("viewerId").getValue());
    assertEquals(1, stored.getArray("viewerSessions").size());
  }

  @Test
  @DisplayName("updateActiveViewers skips the owner, matching lastLoginIp case-insensitively")
  void updateActiveViewers_ownerIpIsNotRecorded() {
    graphqlFrom(OWNER_IP.toUpperCase(), "mutation { updateActiveViewers(showSubdomain: \"" + SUBDOMAIN + "\") }")
        .body("data.updateActiveViewers", is(true));

    BsonDocument stored = storedRaw();
    assertTrue(stored.getArray("activeViewers").isEmpty());
    assertTrue(stored.getArray("viewerSessions").isEmpty());
  }

  @Test
  @DisplayName("updateActiveViewers on an unknown show answers UNEXPECTED_ERROR")
  void updateActiveViewers_notFound() {
    graphqlFrom(VIEWER_IP, "mutation { updateActiveViewers(showSubdomain: \"" + MISSING_SUBDOMAIN + "\") }")
        .body("errors[0].extensions.message", containsString("UNEXPECTED_ERROR"));
  }

  // ---- repository projections, decoded on a backfilled show ----------------

  @Test
  @DisplayName("projected reads decode on a backfilled show and carry nothing heavy")
  void projectedReads_decodeBackfilledShowWithoutHeavyFields() {
    Show names = showRepository.findSequenceNamesByShowSubdomain(SUBDOMAIN).orElseThrow();
    assertEquals(3, names.getSequences().size());
    Sequence wizards = names.getSequences().get(0);
    assertEquals("wizards", wizards.getName());
    assertEquals("Wizards in Winter", wizards.getDisplayName());
    assertNull(wizards.getImageUrl(), "inline artwork must not ride this read");
    assertNull(names.getStats());
    assertNull(names.getPages());
    assertNull(names.getLastLoginIp());

    Show login = showRepository.findLastLoginIpByShowSubdomain(SUBDOMAIN).orElseThrow();
    assertEquals(OWNER_IP, login.getLastLoginIp());
    assertNull(login.getSequences());
    assertNull(login.getStats());
    assertNull(login.getPages());

    assertTrue(showRepository.findSequenceNamesByShowSubdomain(MISSING_SUBDOMAIN).isEmpty());
    assertTrue(showRepository.findLastLoginIpByShowSubdomain(MISSING_SUBDOMAIN).isEmpty());
  }

  // ---- helpers --------------------------------------------------------------

  private void assertOnlySequenceNameFinds() {
    List<BsonDocument> finds = findListener.findsForSubdomain(SUBDOMAIN);
    assertFalse(finds.isEmpty(), "expected a projected read of the show");
    BsonDocument expected = BsonDocument.parse("{\"sequences.name\": 1, \"sequences.displayName\": 1}");
    for (BsonDocument find : finds) {
      assertEquals(expected, find.getDocument("projection", null),
          "playing now/next must read sequence names only, never the whole show: " + find.toJson());
    }
  }

  private io.restassured.response.ValidatableResponse graphql(String query) {
    return graphqlFrom(VIEWER_IP, query);
  }

  private io.restassured.response.ValidatableResponse graphqlFrom(String ip, String query) {
    return given()
        .contentType(ContentType.JSON)
        .header("CF-Connecting-IP", ip)
        .body(Map.of("query", query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200);
  }

  private MongoCollection<BsonDocument> rawShows() {
    return showRepository.mongoDatabase().getCollection("show", BsonDocument.class);
  }

  private BsonDocument storedRaw() {
    return rawShows().find(Filters.eq("showSubdomain", SUBDOMAIN)).first();
  }

  private String storedString(String field) {
    return storedRaw().getString(field).getValue();
  }

  /**
   * A show shaped like a real big one: artwork inlined on sequences, a long
   * page-stat array, page HTML, and a subtype 3 pageId as left by the backfill.
   */
  private static BsonDocument backfilledWhaleShow() {
    String artwork = "data:image/png;base64," + "A".repeat(64 * 1024);
    BsonArray sequences = new BsonArray(List.of(
        new BsonDocument("name", new BsonString("wizards"))
            .append("displayName", new BsonString("Wizards in Winter"))
            .append("imageUrl", new BsonString(artwork)),
        new BsonDocument("name", new BsonString("NoDisplay"))
            .append("displayName", new BsonString("   "))
            .append("imageUrl", new BsonString(artwork)),
        new BsonDocument("name", new BsonString("Carol"))
            .append("displayName", new BsonString("Carol of the Bells"))));

    BsonArray pageStats = new BsonArray();
    for (int i = 0; i < 2_000; i++) {
      pageStats.add(new BsonDocument("ip", new BsonString("198.51.100." + (i % 250)))
          .append("dateTime", new BsonDateTime(1_760_000_000_000L + i)));
    }

    BsonDocument page = new BsonDocument("name", new BsonString("home"))
        .append("pageId", new BsonBinary(UUID.fromString("0f8fad5b-d9cb-469f-a165-70867728950e"),
            UuidRepresentation.JAVA_LEGACY))
        .append("html", new BsonString("<html>" + "x".repeat(32 * 1024) + "</html>"));
    assertEquals(BsonBinarySubType.UUID_LEGACY.getValue(),
        page.getBinary("pageId").getType(), "seed must use the backfilled subtype 3 shape");

    return new BsonDocument("_id", new BsonObjectId(new ObjectId()))
        .append("showSubdomain", new BsonString(SUBDOMAIN))
        .append("showName", new BsonString("R7 Projection"))
        .append("showToken", new BsonString("tok-r7"))
        .append("lastLoginIp", new BsonString(OWNER_IP))
        .append("sequences", sequences)
        .append("pages", new BsonArray(List.of(page)))
        .append("activeViewers", new BsonArray())
        .append("viewerSessions", new BsonArray())
        .append("stats", new BsonDocument("page", pageStats));
  }
}
