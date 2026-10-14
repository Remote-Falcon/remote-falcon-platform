package com.remotefalcon.plugins.api.mongo;

import com.mongodb.MongoClientSettings;
import io.quarkus.mongodb.runtime.MongoClientCustomizer;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Sets the connection-pool wait timeout (driver maxWaitTime, the
 * waitQueueTimeoutMS URI option). Quarkus has no
 * {@code quarkus.mongodb.*} property for it, and the driver default is
 * 2 minutes: on 2026-10-12 pool exhaustion parked worker threads that long.
 * With a 1s wait the pool is the bulkhead and excess requests fail fast as
 * 503s (MongoTimeoutException, mapped in MongoUnavailableExceptionMappers).
 *
 * <p>Quarkus applies this customizer after the connection string and the
 * quarkus.mongodb.* properties, so it wins over a waitQueueTimeoutMS on the
 * URI. Unconditional bean, value read at runtime: native-image safe.
 */
@ApplicationScoped
public class MongoClientTuning implements MongoClientCustomizer {

  private final Duration waitQueueTimeout;

  public MongoClientTuning(
      @ConfigProperty(name = "remotefalcon.mongodb.wait-queue-timeout", defaultValue = "1S")
      Duration waitQueueTimeout) {
    this.waitQueueTimeout = waitQueueTimeout;
  }

  @Override
  public MongoClientSettings.Builder customize(MongoClientSettings.Builder builder) {
    return builder.applyToConnectionPoolSettings(
        pool -> pool.maxWaitTime(waitQueueTimeout.toMillis(), TimeUnit.MILLISECONDS));
  }
}
