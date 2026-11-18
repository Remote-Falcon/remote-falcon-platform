package com.remotefalcon.controlpanel.configuration;

import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.mongo.MongoClientSettingsBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.convert.MongoConverter;

import java.util.concurrent.TimeUnit;

/**
 * A second, small Mongo client for scheduled maintenance (Season Prep S8a).
 *
 * <p>The nightly 09:00 UTC jobs are single server-side commands that run far
 * longer than any request: prod logs (2026-09-30..10-13) show the retention
 * {@code updateMulti} at 10-35s and the DOC_SIZE_ALARM aggregation at 12-30s.
 * Driver 5.0.x has no per-operation timeout, so while they shared the request
 * client, its socket read timeout had to be 60s for every request. With the
 * jobs here, {@link MongoConfig#SOCKET_READ_TIMEOUT_MS} drops to 10s.
 *
 * <p>Settings start from exactly what the request-path client gets (every
 * {@link MongoClientSettingsBuilderCustomizer} in order: Spring Boot's URI,
 * UUID representation and SSL handling, then {@link MongoConfig}'s fail-fast
 * values and slow-command listener), then override the read timeout and pool.
 * Only the timeouts and pool differ, so the two clients cannot drift on
 * anything that affects how documents are read or written.
 *
 * <p>Unconditional, and the overrides are read from the environment inside the
 * {@code @Bean} method at runtime: control-panel is a GraalVM native image,
 * where {@code @Conditional} is evaluated at build time (issue #160).
 * Optional env overrides: {@value #READ_TIMEOUT_ENV}, {@value #MAX_POOL_ENV}.
 */
@Configuration
public class MaintenanceMongoConfig {

  static final String READ_TIMEOUT_ENV = "MONGO_MAINTENANCE_SOCKET_READ_TIMEOUT_MS";
  static final String MAX_POOL_ENV = "MONGO_MAINTENANCE_MAX_POOL_SIZE";

  /** ~3.4x the slowest observed nightly command (35.3s). */
  static final int DEFAULT_SOCKET_READ_TIMEOUT_MS = 120_000;
  /** An override can lengthen the timeout, never shrink it below the nightly jobs' needs. */
  static final int MIN_SOCKET_READ_TIMEOUT_MS = 60_000;
  /** The jobs run one at a time behind SchedulerLock; 3 leaves room for an overlap. */
  static final int DEFAULT_MAX_POOL_SIZE = 3;
  /** Nothing idle between runs: the jobs fire hourly at most. */
  static final int MIN_POOL_SIZE = 0;
  /** Batch work can wait out a short primary election rather than fail the night. */
  static final int SERVER_SELECTION_TIMEOUT_MS = 10_000;
  static final int MAX_WAIT_TIME_MS = 10_000;

  @Bean(destroyMethod = "close")
  public MaintenanceMongo maintenanceMongo(
      ObjectProvider<MongoClientSettingsBuilderCustomizer> customizers,
      MongoDatabaseFactory requestPathFactory,
      MongoConverter converter,
      Environment env) {
    MongoClient client = MongoClients.create(settings(customizers, env));
    // Same database name the auto-configured factory resolved (MONGO_URI has
    // no database; it comes from spring.data.mongodb.database).
    String database = requestPathFactory.getMongoDatabase().getName();
    MongoTemplate template = new MongoTemplate(new SimpleMongoClientDatabaseFactory(client, database), converter);
    return new MaintenanceMongo(client, template);
  }

  static MongoClientSettings settings(
      ObjectProvider<MongoClientSettingsBuilderCustomizer> customizers, Environment env) {
    int readTimeoutMs = Math.max(env.getProperty(READ_TIMEOUT_ENV, Integer.class, DEFAULT_SOCKET_READ_TIMEOUT_MS),
        MIN_SOCKET_READ_TIMEOUT_MS);
    int maxPool = Math.max(env.getProperty(MAX_POOL_ENV, Integer.class, DEFAULT_MAX_POOL_SIZE), 1);

    MongoClientSettings.Builder builder = MongoClientSettings.builder();
    customizers.orderedStream().forEach(c -> c.customize(builder));
    return builder
        .applyToClusterSettings(cluster ->
            cluster.serverSelectionTimeout(SERVER_SELECTION_TIMEOUT_MS, TimeUnit.MILLISECONDS))
        .applyToSocketSettings(socket -> socket.readTimeout(readTimeoutMs, TimeUnit.MILLISECONDS))
        .applyToConnectionPoolSettings(pool -> pool
            .maxSize(maxPool)
            .minSize(MIN_POOL_SIZE)
            .maxWaitTime(MAX_WAIT_TIME_MS, TimeUnit.MILLISECONDS))
        .build();
  }
}
