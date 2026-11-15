package com.remotefalcon.controlpanel.configuration;

import org.springframework.boot.autoconfigure.mongo.MongoClientSettingsBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;

import java.util.concurrent.TimeUnit;

/**
 * Mongo driver fail-fast settings (2026-10-12 saturation incident, Appendix D
 * P0-2 / P1-6). Before this, every setting was a driver default: 30s server
 * selection, 100-connection pool, 2-minute pool wait, infinite socket read.
 * When Mongo saturated, request threads parked for 30s-2min instead of failing.
 *
 * <p>The customizer is deliberately UNCONDITIONAL (no {@code @Conditional*},
 * no {@code @Profile}): control-panel ships as a GraalVM native image, where
 * conditions are evaluated at build time and a gated bean is silently compiled
 * out (issue #160).
 *
 * <p>Season knobs: each value below is a DEFAULT. At runtime it can be
 * overridden by the property {@code rf.mongo.<name>} or, in k8s, the env var
 * {@code RF_MONGO_<NAME>} (e.g. {@code RF_MONGO_MAX_POOL_SIZE=15}); Spring maps
 * the env spelling onto the property. The values are read from the
 * {@link Environment} when the bean is created, so they change with a pod
 * restart, not an image rebuild. Table: docs/SERVICES.md "Season knobs".
 *
 * <p>Ordered last so it runs after Spring Boot's standard customizer, which
 * applies {@code spring.data.mongodb.uri}. These values therefore win over any
 * matching options on the connection string.
 */
@Configuration
public class MongoConfig {

  static final int SERVER_SELECTION_TIMEOUT_MS = 3_000;
  static final int CONNECT_TIMEOUT_MS = 3_000;
  /**
   * NOT the 10s the resilience plan proposed. The nightly 09:00 UTC jobs are
   * single server-side commands that legitimately run far longer: prod logs
   * (2026-09-30..10-13) show the retention {@code updateMulti} at 10-35s and
   * the DOC_SIZE_ALARM aggregation at 12-30s. A 10s read timeout would fail
   * both every night. Driver 5.0.x has no per-operation timeout (CSOT needs
   * 5.2+), so the socket timeout is client-wide; 60s still bounds a wedged
   * socket (was infinite). The bulkheads for request paths are the 3s
   * selection and 2s pool wait below. Tighten once the nightly jobs run on
   * their own client.
   */
  static final int SOCKET_READ_TIMEOUT_MS = 60_000;
  static final int MAX_POOL_SIZE = 10;
  static final int MIN_POOL_SIZE = 2;
  static final int MAX_WAIT_TIME_MS = 2_000;

  static final String PREFIX = "rf.mongo.";

  @Bean
  @Order(Ordered.LOWEST_PRECEDENCE)
  public MongoClientSettingsBuilderCustomizer mongoClientSettingsCustomizer(Environment env) {
    int serverSelectionTimeoutMs =
        knob(env, "server-selection-timeout-ms", SERVER_SELECTION_TIMEOUT_MS, 1);
    int connectTimeoutMs = knob(env, "connect-timeout-ms", CONNECT_TIMEOUT_MS, 1);
    int socketReadTimeoutMs = knob(env, "socket-read-timeout-ms", SOCKET_READ_TIMEOUT_MS, 1);
    int maxPoolSize = knob(env, "max-pool-size", MAX_POOL_SIZE, 1);
    int minPoolSize = knob(env, "min-pool-size", MIN_POOL_SIZE, 0);
    int maxWaitTimeMs = knob(env, "max-wait-time-ms", MAX_WAIT_TIME_MS, 0);
    if (minPoolSize > maxPoolSize) {
      throw new IllegalStateException(PREFIX + "min-pool-size (" + minPoolSize
          + ") must not exceed " + PREFIX + "max-pool-size (" + maxPoolSize + ")");
    }
    return builder -> builder
        .applyToClusterSettings(cluster ->
            cluster.serverSelectionTimeout(serverSelectionTimeoutMs, TimeUnit.MILLISECONDS))
        .applyToSocketSettings(socket -> socket
            .connectTimeout(connectTimeoutMs, TimeUnit.MILLISECONDS)
            .readTimeout(socketReadTimeoutMs, TimeUnit.MILLISECONDS))
        .applyToConnectionPoolSettings(pool -> pool
            .maxSize(maxPoolSize)
            .minSize(minPoolSize)
            .maxWaitTime(maxWaitTimeMs, TimeUnit.MILLISECONDS))
        .addCommandListener(new SlowMongoCommandListener());
  }

  /** Reads {@code rf.mongo.<name>}, falling back to the default; fails startup below {@code min}. */
  private static int knob(Environment env, String name, int defaultValue, int min) {
    Integer value = env.getProperty(PREFIX + name, Integer.class, defaultValue);
    if (value < min) {
      throw new IllegalStateException(PREFIX + name + " must be >= " + min + ", got " + value);
    }
    return value;
  }
}
