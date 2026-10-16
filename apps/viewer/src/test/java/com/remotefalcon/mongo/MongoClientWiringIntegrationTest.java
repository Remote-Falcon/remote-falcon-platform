package com.remotefalcon.mongo;

import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.internal.MongoClientImpl;
import com.remotefalcon.integration.MongoTestResource;
import io.quarkus.arc.ClientProxy;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import org.bson.Document;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.concurrent.TimeUnit;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Proves the Appendix D settings reach the real driver client, not just the
 * properties file: timeouts, pool caps, the customizer's pool wait, the
 * slow-command listener, and Mongo being out of the readiness group.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class MongoClientWiringIntegrationTest {

  @Inject
  MongoClient mongoClient;

  @BeforeAll
  static void basePath() {
    RestAssured.basePath = "/remote-falcon-viewer";
  }

  @Test
  void driverSettingsMatchFailFastBudget() {
    MongoClientSettings settings = ((MongoClientImpl) ClientProxy.unwrap(mongoClient)).getSettings();

    assertEquals(2000, settings.getClusterSettings().getServerSelectionTimeout(TimeUnit.MILLISECONDS));
    assertEquals(2000, settings.getSocketSettings().getConnectTimeout(TimeUnit.MILLISECONDS));
    assertEquals(8000, settings.getSocketSettings().getReadTimeout(TimeUnit.MILLISECONDS));
    assertEquals(15, settings.getConnectionPoolSettings().getMaxSize());
    assertEquals(2, settings.getConnectionPoolSettings().getMinSize());
    assertEquals(1000, settings.getConnectionPoolSettings().getMaxWaitTime(TimeUnit.MILLISECONDS));
    assertTrue(settings.getCommandListeners().stream().anyMatch(l -> ClientProxy.unwrap(l) instanceof SlowCommandListener),
        "SlowCommandListener must be registered on the client: " + settings.getCommandListeners());
  }

  @Test
  void poolGaugesAreExported() {
    // Touch the client so the pool (and its gauges) exist.
    mongoClient.getDatabase("admin").runCommand(new Document("ping", 1));
    given().when().get("/q/metrics").then().statusCode(200).body(containsString("mongodb_driver_pool_checkedout"));
  }

  @Test
  void healthProbesDoNotTouchMongo() {
    given().when().get("/q/health/ready").then().statusCode(200).body("checks", empty());
    given().when().get("/q/health/started").then().statusCode(200).body("status", equalTo("UP"));
    given().when().get("/q/health/live").then().statusCode(200);
  }
}
