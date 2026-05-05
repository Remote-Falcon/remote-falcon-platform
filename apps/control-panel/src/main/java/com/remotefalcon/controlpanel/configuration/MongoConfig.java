package com.remotefalcon.controlpanel.configuration;

import org.springframework.boot.autoconfigure.mongo.MongoClientSettingsBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MongoConfig {

  // Pre-warm the connection pool on startup so the first query per pod
  // doesn't pay TCP+TLS+auth handshake. See PERF-FIX-PLAN.md (Fix 4).
  @Bean
  public MongoClientSettingsBuilderCustomizer mongoClientSettingsCustomizer() {
    return builder -> builder.applyToConnectionPoolSettings(pool ->
        pool.minSize(5).maxSize(100));
  }
}
