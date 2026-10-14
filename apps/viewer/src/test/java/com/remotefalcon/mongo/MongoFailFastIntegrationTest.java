package com.remotefalcon.mongo;

import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.MongoTimeoutException;
import com.mongodb.ServerAddress;
import com.remotefalcon.service.GraphQLMutationService;
import com.remotefalcon.service.GraphQLQueryService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * End-to-end check of the viewer's Mongo fail-fast contract (Appendix D P1-1)
 * through the real HTTP stack: GraphQL gets a typed SERVICE_UNAVAILABLE error,
 * REST gets 503 + Retry-After.
 */
@QuarkusTest
class MongoFailFastIntegrationTest {

  @BeforeAll
  static void basePath() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @InjectMock
  GraphQLQueryService queryService;

  @InjectMock
  GraphQLMutationService mutationService;

  private static String graphql(String query) {
    return given()
        .contentType(ContentType.JSON)
        .body(Map.of("query", query))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .extract().asString();
  }

  @Test
  @DisplayName("GraphQL query: MongoTimeoutException becomes extensions.message SERVICE_UNAVAILABLE + retryAfterSeconds")
  void graphqlQueryTimeoutIsTyped() {
    when(queryService.activeViewerPage(anyString()))
        .thenThrow(new MongoTimeoutException("Timed out after 2000 ms while waiting for a server"));

    given()
        .contentType(ContentType.JSON)
        .body(Map.of("query", "{ getActiveViewerPage(showSubdomain: \"sub\") }"))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("errors[0].extensions.message", equalTo("SERVICE_UNAVAILABLE"))
        .body("errors[0].extensions.retryAfterSeconds", equalTo(15));
  }

  @Test
  @DisplayName("GraphQL mutation: wrapped socket read timeout is found in the cause chain")
  void graphqlMutationWrappedReadTimeoutIsTyped() {
    when(mutationService.updateActiveViewers(anyString(), any()))
        .thenThrow(new RuntimeException("wrapper",
            new MongoSocketReadTimeoutException("read timed out", new ServerAddress(), null)));

    given()
        .contentType(ContentType.JSON)
        .body(Map.of("query", "mutation { updateActiveViewers(showSubdomain: \"sub\") }"))
        .when()
        .post("/graphql")
        .then()
        .statusCode(200)
        .body("errors[0].extensions.message", equalTo("SERVICE_UNAVAILABLE"));
  }

  @Test
  @DisplayName("GraphQL: a non-Mongo failure is NOT reported as SERVICE_UNAVAILABLE")
  void graphqlOtherFailureUnchanged() {
    when(queryService.activeViewerPage(anyString())).thenThrow(new IllegalStateException("bug"));

    String body = graphql("{ getActiveViewerPage(showSubdomain: \"sub\") }");

    org.junit.jupiter.api.Assertions.assertFalse(body.contains("SERVICE_UNAVAILABLE"), body);
  }

  @Test
  @DisplayName("REST: MongoTimeoutException maps to 503 with Retry-After: 15")
  void restTimeoutIs503() {
    when(mutationService.addSequenceToQueue(anyString(), anyString(), any(), any(), any(), any()))
        .thenThrow(new MongoTimeoutException("Timed out after 1000 ms while waiting for a connection"));

    given()
        .contentType(ContentType.JSON)
        .body(Map.of("showSubdomain", "sub", "sequence", "Song"))
        .when()
        .post("/addSequenceToQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15")
        .body("message", equalTo("SERVICE_UNAVAILABLE"));
  }

  @Test
  @DisplayName("REST: MongoSocketReadTimeoutException maps to 503 with Retry-After: 15")
  void restReadTimeoutIs503() {
    when(mutationService.voteForSequence(anyString(), anyString(), any(), any(), any()))
        .thenThrow(new MongoSocketReadTimeoutException("read timed out", new ServerAddress(), null));

    given()
        .contentType(ContentType.JSON)
        .body(Map.of("showSubdomain", "sub", "sequence", "Song"))
        .when()
        .post("/voteForSequence")
        .then()
        .statusCode(503)
        .header("Retry-After", "15");
  }
}
