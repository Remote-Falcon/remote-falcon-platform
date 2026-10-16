package com.remotefalcon.controlpanel.configuration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.autoconfigure.availability.AvailabilityHealthContributorAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.availability.AvailabilityProbesAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.endpoint.EndpointAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.health.HealthContributorAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.health.HealthEndpointAutoConfiguration;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.availability.ApplicationAvailabilityAutoConfiguration;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.LivenessState;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Resilience P0-1: the k8s probe groups configured in application.yml must
 * stay UP while Mongo is DOWN. A Mongo stall marking every pod unready (or
 * restart-looping them) is what turned the 2026-10-12 DB saturation into a
 * fleet-wide outage. Plain /actuator/health must still report the DB.
 */
class HealthProbeGroupsTest {

  private final ApplicationContextRunner runner = new ApplicationContextRunner()
      .withInitializer(ctx -> applicationYml().forEach(ctx.getEnvironment().getPropertySources()::addLast))
      .withConfiguration(AutoConfigurations.of(
          ApplicationAvailabilityAutoConfiguration.class,
          EndpointAutoConfiguration.class,
          HealthContributorAutoConfiguration.class,
          HealthEndpointAutoConfiguration.class,
          AvailabilityHealthContributorAutoConfiguration.class,
          AvailabilityProbesAutoConfiguration.class))
      // Stands in for Boot's MongoHealthIndicator during a DB outage.
      .withBean("mongo", HealthIndicator.class, () -> () -> Health.down().build());

  @Test
  void probeGroupsIgnoreMongoButOverallHealthReportsIt() {
    runner.run(ctx -> {
      AvailabilityChangeEvent.publish(ctx, LivenessState.CORRECT);
      AvailabilityChangeEvent.publish(ctx, ReadinessState.ACCEPTING_TRAFFIC);
      HealthEndpoint health = ctx.getBean(HealthEndpoint.class);

      assertThat(health.healthForPath("liveness").getStatus()).isEqualTo(Status.UP);
      assertThat(health.healthForPath("readiness").getStatus()).isEqualTo(Status.UP);
      assertThat(health.health().getStatus()).isEqualTo(Status.DOWN);
    });
  }

  @Test
  void deadNoOpMongoTimeoutPropertyIsGone() {
    // management.health.mongo.timeout is not a Spring Boot property; it did
    // nothing and implied a guard that never existed.
    assertThat(applicationYml()).noneMatch(ps -> ps.containsProperty("management.health.mongo.timeout"));
  }

  private static List<PropertySource<?>> applicationYml() {
    try {
      return new YamlPropertySourceLoader().load("application.yml", new ClassPathResource("application.yml"));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
