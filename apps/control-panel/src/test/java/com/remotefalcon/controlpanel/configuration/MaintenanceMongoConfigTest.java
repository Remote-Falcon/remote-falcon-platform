package com.remotefalcon.controlpanel.configuration;

import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.internal.MongoClientImpl;
import org.bson.UuidRepresentation;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.data.mongo.MongoDataAutoConfiguration;
import org.springframework.boot.autoconfigure.mongo.MongoAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.MergedAnnotations;
import org.springframework.core.env.Environment;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.convert.MongoConverter;

import java.lang.reflect.Method;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the S8a split: the request-path client keeps its 10s read timeout and
 * its auto-configured beans, while scheduled maintenance gets its own small
 * client with a long read timeout. Builds real (unconnected) clients through
 * Spring Boot's own wiring, so an ordering or back-off mistake shows up here.
 */
class MaintenanceMongoConfigTest {

  private static final String URI = "mongodb://localhost:1/"
      + "?serverSelectionTimeoutMS=30000&socketTimeoutMS=0&maxPoolSize=100&minPoolSize=5";

  private final ApplicationContextRunner runner = new ApplicationContextRunner()
      .withConfiguration(AutoConfigurations.of(MongoAutoConfiguration.class, MongoDataAutoConfiguration.class))
      .withUserConfiguration(MongoConfig.class, MaintenanceMongoConfig.class)
      .withPropertyValues(
          "spring.data.mongodb.uri=" + URI,
          "spring.data.mongodb.database=remote-falcon",
          "spring.data.mongodb.uuid-representation=java-legacy");

  private static MongoClientSettings settingsOf(MongoClient client) {
    return ((MongoClientImpl) client).getSettings();
  }

  @Test
  void maintenanceClientHasLongReadTimeoutAndSmallPool() {
    runner.run(ctx -> {
      MongoClientSettings s = settingsOf(ctx.getBean(MaintenanceMongo.class).client());

      assertThat(s.getSocketSettings().getReadTimeout(TimeUnit.MILLISECONDS)).isEqualTo(120_000);
      assertThat(s.getConnectionPoolSettings().getMaxSize()).isEqualTo(3);
      assertThat(s.getConnectionPoolSettings().getMinSize()).isZero();
      assertThat(s.getClusterSettings().getServerSelectionTimeout(TimeUnit.MILLISECONDS)).isEqualTo(10_000);
    });
  }

  @Test
  void readTimeoutCoversTheObservedNightlyJobs() {
    // Prod 2026-09-30..10-13: retention updateMulti up to 35.3s, DOC_SIZE_ALARM
    // aggregation up to ~30s. Both are single commands on one socket read.
    assertThat(MaintenanceMongoConfig.DEFAULT_SOCKET_READ_TIMEOUT_MS).isGreaterThan(35_300);
    assertThat(MaintenanceMongoConfig.MIN_SOCKET_READ_TIMEOUT_MS).isGreaterThanOrEqualTo(60_000);
  }

  @Test
  void requestPathClientKeepsTenSecondReadTimeout() {
    runner.run(ctx -> {
      MongoClientSettings s = settingsOf(ctx.getBean(MongoClient.class));
      assertThat(s.getSocketSettings().getReadTimeout(TimeUnit.MILLISECONDS)).isEqualTo(10_000);
      assertThat(s.getConnectionPoolSettings().getMaxSize()).isEqualTo(10);
    });
  }

  @Test
  void requestPathBeansAreNotDisplaced() {
    // A MongoClient or MongoOperations bean of our own would make Boot's
    // @ConditionalOnMissingBean auto-config back off and hand request traffic
    // to the maintenance client. Exactly one of each, distinct from ours.
    runner.run(ctx -> {
      assertThat(ctx).hasSingleBean(MongoClient.class);
      assertThat(ctx).hasSingleBean(MongoOperations.class);
      MaintenanceMongo maintenance = ctx.getBean(MaintenanceMongo.class);
      assertThat(maintenance.client()).isNotSameAs(ctx.getBean(MongoClient.class));
      assertThat(maintenance.template()).isNotSameAs(ctx.getBean(MongoTemplate.class));
    });
  }

  @Test
  void inheritsEverythingElseFromTheRequestPathClient() {
    runner.run(ctx -> {
      MongoClientSettings request = settingsOf(ctx.getBean(MongoClient.class));
      MongoClientSettings maintenance = settingsOf(ctx.getBean(MaintenanceMongo.class).client());

      assertThat(maintenance.getUuidRepresentation())
          .isEqualTo(request.getUuidRepresentation())
          .isEqualTo(UuidRepresentation.JAVA_LEGACY);
      assertThat(maintenance.getClusterSettings().getHosts()).isEqualTo(request.getClusterSettings().getHosts());
      assertThat(maintenance.getSocketSettings().getConnectTimeout(TimeUnit.MILLISECONDS))
          .isEqualTo(request.getSocketSettings().getConnectTimeout(TimeUnit.MILLISECONDS));
      assertThat(maintenance.getCommandListeners()).hasAtLeastOneElementOfType(SlowMongoCommandListener.class);
      assertThat(ctx.getBean(MaintenanceMongo.class).template().getDb().getName()).isEqualTo("remote-falcon");
    });
  }

  @Test
  void envOverridesAreReadAtRuntimeAndFloored() {
    runner.withPropertyValues(
            MaintenanceMongoConfig.READ_TIMEOUT_ENV + "=300000",
            MaintenanceMongoConfig.MAX_POOL_ENV + "=2")
        .run(ctx -> {
          MongoClientSettings s = settingsOf(ctx.getBean(MaintenanceMongo.class).client());
          assertThat(s.getSocketSettings().getReadTimeout(TimeUnit.MILLISECONDS)).isEqualTo(300_000);
          assertThat(s.getConnectionPoolSettings().getMaxSize()).isEqualTo(2);
        });
    runner.withPropertyValues(
            MaintenanceMongoConfig.READ_TIMEOUT_ENV + "=5000",
            MaintenanceMongoConfig.MAX_POOL_ENV + "=0")
        .run(ctx -> {
          MongoClientSettings s = settingsOf(ctx.getBean(MaintenanceMongo.class).client());
          assertThat(s.getSocketSettings().getReadTimeout(TimeUnit.MILLISECONDS)).isEqualTo(60_000);
          assertThat(s.getConnectionPoolSettings().getMaxSize()).isEqualTo(1);
        });
  }

  @Test
  void beanIsUnconditional() throws Exception {
    // Native image evaluates @Conditional/@Profile at BUILD time (issue #160).
    Method bean = MaintenanceMongoConfig.class.getMethod("maintenanceMongo",
        ObjectProvider.class, MongoDatabaseFactory.class, MongoConverter.class, Environment.class);
    for (MergedAnnotations annotations : new MergedAnnotations[] {
        MergedAnnotations.from(MaintenanceMongoConfig.class), MergedAnnotations.from(bean)}) {
      assertThat(annotations.isPresent(Conditional.class)).isFalse();
      assertThat(annotations.isPresent(Profile.class)).isFalse();
    }
  }
}
