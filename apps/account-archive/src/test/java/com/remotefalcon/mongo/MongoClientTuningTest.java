package com.remotefalcon.mongo;

import com.mongodb.MongoClientSettings;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MongoClientTuningTest {

  @Test
  void setsPoolWaitTimeout() {
    MongoClientSettings settings = new MongoClientTuning(Duration.ofSeconds(10))
        .customize(MongoClientSettings.builder())
        .build();

    assertEquals(10_000, settings.getConnectionPoolSettings().getMaxWaitTime(TimeUnit.MILLISECONDS));
  }

  @Test
  void overridesWaitFromConnectionString() {
    MongoClientSettings settings = new MongoClientTuning(Duration.ofSeconds(10))
        .customize(MongoClientSettings.builder()
            .applyConnectionString(new com.mongodb.ConnectionString("mongodb://localhost/?waitQueueTimeoutMS=120000")))
        .build();

    assertEquals(10_000, settings.getConnectionPoolSettings().getMaxWaitTime(TimeUnit.MILLISECONDS));
  }
}
