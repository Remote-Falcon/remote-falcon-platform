package com.remotefalcon.mongo;

import com.mongodb.MongoClientSettings;
import io.quarkus.mongodb.runtime.MongoClientCustomizer;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Sets the connection-pool wait timeout (driver maxWaitTime, the
 * waitQueueTimeoutMS URI option), which has no quarkus.mongodb.* property.
 * The driver default is 2 minutes. Applied after the connection string and
 * the quarkus.mongodb.* properties. Unconditional bean, value read at
 * runtime: native-image safe. Appendix D §3 (2026-10-12 incident).
 */
@ApplicationScoped
public class MongoClientTuning implements MongoClientCustomizer {

  private final Duration waitQueueTimeout;

  public MongoClientTuning(
      @ConfigProperty(name = "remotefalcon.mongodb.wait-queue-timeout", defaultValue = "10S")
      Duration waitQueueTimeout) {
    this.waitQueueTimeout = waitQueueTimeout;
  }

  @Override
  public MongoClientSettings.Builder customize(MongoClientSettings.Builder builder) {
    return builder.applyToConnectionPoolSettings(
        pool -> pool.maxWaitTime(waitQueueTimeout.toMillis(), TimeUnit.MILLISECONDS));
  }
}
