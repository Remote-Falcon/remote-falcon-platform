package com.remotefalcon.controlpanel.configuration;

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
 * When Mongo saturated, request threads parked for 30s-2min instead of failing.
 *
 * <p>The customizer is deliberately UNCONDITIONAL (no {@code @Conditional*},
 * no {@code @Profile}): control-panel ships as a GraalVM native image, where
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
