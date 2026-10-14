package com.remotefalcon.plugins.api.mongo;

import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.MongoTimeoutException;
import com.mongodb.ServerAddress;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.repository.ShowRepository;
import com.remotefalcon.plugins.api.service.PluginService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.Mockito.when;

/**
 * Appendix D P1-1: a saturated DB must answer the FPP plugin with a fast
 * 503 + Retry-After (which the next plugin release honors), not a 500 with a
 * stack trace after a 30s wait.
 */
@QuarkusTest
class MongoUnavailableExceptionMapperTest {

  private static final String TOKEN = "mapper-test-token";

  @InjectMock
  ShowRepository showRepository;

  @InjectMock
  PluginService pluginService;

  @Test
  void timeoutInTokenFilterIs503WithRetryAfter() {
    when(showRepository.findByShowToken(TOKEN))
        .thenThrow(new MongoTimeoutException("Timed out after 2000 ms while waiting for a server"));

    given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15")
        .body("message", equalTo("SERVICE_UNAVAILABLE"))
        .body("retryAfterSeconds", equalTo(15));
  }

  @Test
  void readTimeoutInEndpointIs503WithRetryAfter() {
    when(showRepository.findByShowToken(TOKEN)).thenReturn(Optional.of(new Show()));
    when(pluginService.nextPlaylistInQueue())
        .thenThrow(new MongoSocketReadTimeoutException("read timed out", new ServerAddress(), null));

    given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(503)
        .header("Retry-After", "15");
  }

  @Test
  void otherFailuresAreNotRemappedTo503() {
    when(showRepository.findByShowToken(TOKEN)).thenReturn(Optional.of(new Show()));
    when(pluginService.nextPlaylistInQueue()).thenThrow(new IllegalStateException("bug"));

    given()
        .header("showtoken", TOKEN)
        .when()
        .get("/nextPlaylistInQueue")
        .then()
        .statusCode(500);
  }
}
