package com.remotefalcon.controlpanel.configuration;

import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.internal.MongoClientImpl;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.mongo.MongoAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.MergedAnnotations;
import org.springframework.core.env.Environment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import java.lang.reflect.Method;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the Mongo fail-fast settings (resilience P0-2) and proves they survive
 * Spring Boot's own wiring: the customizer must run AFTER the standard one that
 * applies spring.data.mongodb.uri, or URI options (and driver defaults) win.
 */
class MongoConfigTest {

  // Every option set to the old driver defaults / worse, so a customizer that
  // runs too early (or not at all) fails each assertion.
  private static final String URI_WITH_LOOSE_OPTIONS = "mongodb://localhost:1/remote-falcon"
      + "?serverSelectionTimeoutMS=30000&connectTimeoutMS=10000&socketTimeoutMS=0"
      + "&maxPoolSize=100&minPoolSize=5&waitQueueTimeoutMS=120000";

  private final ApplicationContextRunner runner = new ApplicationContextRunner()
      .withConfiguration(AutoConfigurations.of(MongoAutoConfiguration.class))
      .withUserConfiguration(MongoConfig.class)
      .withPropertyValues("spring.data.mongodb.uri=" + URI_WITH_LOOSE_OPTIONS);

  @Test
  void customizerOverridesUriOptionsInTheRealClient() {
    runner.run(ctx -> {
      MongoClientSettings s = ((MongoClientImpl) ctx.getBean(MongoClient.class)).getSettings();

      assertThat(s.getClusterSettings().getServerSelectionTimeout(TimeUnit.MILLISECONDS)).isEqualTo(3_000);
      assertThat(s.getSocketSettings().getConnectTimeout(TimeUnit.MILLISECONDS)).isEqualTo(3_000);
      assertThat(s.getSocketSettings().getReadTimeout(TimeUnit.MILLISECONDS)).isEqualTo(10_000);
      assertThat(s.getConnectionPoolSettings().getMaxSize()).isEqualTo(10);
      assertThat(s.getConnectionPoolSettings().getMinSize()).isEqualTo(2);
      assertThat(s.getConnectionPoolSettings().getMaxWaitTime(TimeUnit.MILLISECONDS)).isEqualTo(2_000);
      assertThat(s.getCommandListeners()).hasAtLeastOneElementOfType(SlowMongoCommandListener.class);
    });
  }

  @Test
  void requestPathReadTimeoutIsTenSeconds() {
    // S8a: the nightly jobs that needed 60s now run on MaintenanceMongo, so a
    // wedged request socket is released after 10s. MaintenanceMongoConfigTest
    // pins the long timeout on the maintenance client.
    assertThat(MongoConfig.SOCKET_READ_TIMEOUT_MS).isEqualTo(10_000);
  }

  @Test
  void seasonKnobsOverrideTheDefaultsFromProperties() {
    runner.withPropertyValues(
            "rf.mongo.server-selection-timeout-ms=4000",
            "rf.mongo.connect-timeout-ms=5000",
            "rf.mongo.socket-read-timeout-ms=45000",
            "rf.mongo.max-pool-size=25",
            "rf.mongo.min-pool-size=3",
            "rf.mongo.max-wait-time-ms=1500")
        .run(ctx -> {
          MongoClientSettings s = ((MongoClientImpl) ctx.getBean(MongoClient.class)).getSettings();

          assertThat(s.getClusterSettings().getServerSelectionTimeout(TimeUnit.MILLISECONDS)).isEqualTo(4_000);
          assertThat(s.getSocketSettings().getConnectTimeout(TimeUnit.MILLISECONDS)).isEqualTo(5_000);
          assertThat(s.getSocketSettings().getReadTimeout(TimeUnit.MILLISECONDS)).isEqualTo(45_000);
          assertThat(s.getConnectionPoolSettings().getMaxSize()).isEqualTo(25);
          assertThat(s.getConnectionPoolSettings().getMinSize()).isEqualTo(3);
          assertThat(s.getConnectionPoolSettings().getMaxWaitTime(TimeUnit.MILLISECONDS)).isEqualTo(1_500);
        });
  }

  @Test
  void seasonKnobsReadTheKubernetesEnvVarSpelling() {
    // The k8s manifest sets RF_MONGO_MAX_POOL_SIZE etc. Spring maps that onto
    // rf.mongo.max-pool-size at runtime, which is what makes these knobs work
    // in the native image without a rebuild.
    runner.withInitializer(ctx -> ctx.getEnvironment().getPropertySources().addFirst(
            new SystemEnvironmentPropertySource("test-env", Map.of(
                "RF_MONGO_MAX_POOL_SIZE", "30",
                "RF_MONGO_MAX_WAIT_TIME_MS", "2500"))))
        .run(ctx -> {
          MongoClientSettings s = ((MongoClientImpl) ctx.getBean(MongoClient.class)).getSettings();

          assertThat(s.getConnectionPoolSettings().getMaxSize()).isEqualTo(30);
          assertThat(s.getConnectionPoolSettings().getMaxWaitTime(TimeUnit.MILLISECONDS)).isEqualTo(2_500);
        });
  }

  @Test
  void seasonKnobsRejectAnUnusablePool() {
    runner.withPropertyValues("rf.mongo.max-pool-size=2", "rf.mongo.min-pool-size=5")
        .run(ctx -> assertThat(ctx).hasFailed()
            .getFailure().hasStackTraceContaining("rf.mongo.min-pool-size"));
    runner.withPropertyValues("rf.mongo.max-pool-size=0")
        .run(ctx -> assertThat(ctx).hasFailed()
            .getFailure().hasStackTraceContaining("rf.mongo.max-pool-size"));
  }

  @Test
  void customizerBeanIsUnconditional() throws Exception {
    // Native image evaluates @Conditional/@Profile at BUILD time and silently
    // drops a gated bean (issue #160). Meta-annotations count too
    // (@ConditionalOnProperty is itself @Conditional).
    Method bean = MongoConfig.class.getMethod("mongoClientSettingsCustomizer", Environment.class);
    for (MergedAnnotations annotations : new MergedAnnotations[] {
        MergedAnnotations.from(MongoConfig.class), MergedAnnotations.from(bean)}) {
      assertThat(annotations.isPresent(Conditional.class)).isFalse();
      assertThat(annotations.isPresent(Profile.class)).isFalse();
    }
  }
}
