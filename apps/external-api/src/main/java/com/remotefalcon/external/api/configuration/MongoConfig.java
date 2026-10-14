package com.remotefalcon.external.api.configuration;

import org.springframework.boot.autoconfigure.mongo.MongoClientSettingsBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

import java.util.concurrent.TimeUnit;

/**
 * Mongo driver fail-fast settings (2026-10-12 saturation incident, Appendix D
 * P0-2 / P1-6). Before this, every setting was a driver default: 30s server
 * selection, 100-connection pool, 2-minute pool wait, infinite socket read.
 *
 * <p>Deliberately UNCONDITIONAL (no {@code @Conditional*}, no
 * {@code @Profile}): external-api ships as a GraalVM native image, where
 * conditions are evaluated at build time and a gated bean is silently compiled
 * out (issue #160).
 *
 * <p>Ordered last so it runs after Spring Boot's standard customizer, which
 * applies {@code spring.data.mongodb.uri}. These values therefore win over any
 * matching options on the connection string.
 */
@Configuration
public class MongoConfig {

  static final int SERVER_SELECTION_TIMEOUT_MS = 3_000;
  static final int CONNECT_TIMEOUT_MS = 3_000;
  // external-api runs only single-show, request-scoped queries (no batch or
  // scheduled work), so 10s is far above any legitimate command.
  static final int SOCKET_READ_TIMEOUT_MS = 10_000;
  static final int MAX_POOL_SIZE = 10;
  static final int MIN_POOL_SIZE = 2;
  static final int MAX_WAIT_TIME_MS = 2_000;

  @Bean
  @Order(Ordered.LOWEST_PRECEDENCE)
  public MongoClientSettingsBuilderCustomizer mongoClientSettingsCustomizer() {
    return builder -> builder
        .applyToClusterSettings(cluster ->
            cluster.serverSelectionTimeout(SERVER_SELECTION_TIMEOUT_MS, TimeUnit.MILLISECONDS))
        .applyToSocketSettings(socket -> socket
            .connectTimeout(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(SOCKET_READ_TIMEOUT_MS, TimeUnit.MILLISECONDS))
        .applyToConnectionPoolSettings(pool -> pool
            .maxSize(MAX_POOL_SIZE)
            .minSize(MIN_POOL_SIZE)
            .maxWaitTime(MAX_WAIT_TIME_MS, TimeUnit.MILLISECONDS))
        .addCommandListener(new SlowMongoCommandListener());
  }
}
