package com.remotefalcon.external.api.configuration;

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

import java.lang.reflect.Method;
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
  void customizerBeanIsUnconditional() throws Exception {
    // Native image evaluates @Conditional/@Profile at BUILD time and silently
    // drops a gated bean (issue #160). Meta-annotations count too
    // (@ConditionalOnProperty is itself @Conditional).
    Method bean = MongoConfig.class.getMethod("mongoClientSettingsCustomizer");
    for (MergedAnnotations annotations : new MergedAnnotations[] {
        MergedAnnotations.from(MongoConfig.class), MergedAnnotations.from(bean)}) {
      assertThat(annotations.isPresent(Conditional.class)).isFalse();
      assertThat(annotations.isPresent(Profile.class)).isFalse();
    }
  }
}
