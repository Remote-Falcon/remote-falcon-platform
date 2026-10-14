package com.remotefalcon.mongo;

import com.mongodb.ServerAddress;
import com.mongodb.connection.ClusterId;
import com.mongodb.connection.ConnectionDescription;
import com.mongodb.connection.ServerId;
import com.mongodb.event.CommandFailedEvent;
import com.mongodb.event.CommandStartedEvent;
import com.mongodb.event.CommandSucceededEvent;
import org.bson.BsonDocument;
import org.bson.BsonInt64;
import org.bson.BsonString;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SlowCommandListenerTest {

  private static final ConnectionDescription CONNECTION =
      new ConnectionDescription(new ServerId(new ClusterId(), new ServerAddress()));

  private final List<String> lines = new ArrayList<>();
  private final SlowCommandListener listener = new SlowCommandListener(Duration.ofMillis(250), lines::add);

  private static CommandStartedEvent started(int requestId, String name, BsonDocument command) {
    return new CommandStartedEvent(null, 1L, requestId, CONNECTION, "remote-falcon", name, command);
  }

  private static CommandSucceededEvent succeeded(int requestId, String name, long millis) {
    return new CommandSucceededEvent(null, 1L, requestId, CONNECTION, "remote-falcon", name,
        new BsonDocument(), TimeUnit.MILLISECONDS.toNanos(millis));
  }

  @Test
  void logsSlowCommandWithCollection() {
    listener.commandStarted(started(1, "find", new BsonDocument("find", new BsonString("show"))));
    listener.commandSucceeded(succeeded(1, "find", 812));

    assertEquals(List.of("MONGO_SLOW cmd=find coll=show ms=812"), lines);
  }

  @Test
  void ignoresFastCommand() {
    listener.commandStarted(started(2, "update", new BsonDocument("update", new BsonString("show"))));
    listener.commandSucceeded(succeeded(2, "update", 249));

    assertTrue(lines.isEmpty());
  }

  @Test
  void thresholdIsInclusive() {
    listener.commandStarted(started(3, "find", new BsonDocument("find", new BsonString("show"))));
    listener.commandSucceeded(succeeded(3, "find", 250));

    assertEquals(1, lines.size());
  }

  @Test
  void logsSlowFailureWithFlag() {
    listener.commandStarted(started(4, "aggregate", new BsonDocument("aggregate", new BsonString("voteEvent"))));
    listener.commandFailed(new CommandFailedEvent(null, 1L, 4, CONNECTION, "remote-falcon", "aggregate",
        TimeUnit.MILLISECONDS.toNanos(5000), new RuntimeException("read timed out")));

    assertEquals(List.of("MONGO_SLOW cmd=aggregate coll=voteEvent ms=5000 failed=true"), lines);
  }

  @Test
  void getMoreReadsCollectionField() {
    BsonDocument getMore = new BsonDocument("getMore", new BsonInt64(42L)).append("collection", new BsonString("show"));
    listener.commandStarted(started(5, "getMore", getMore));
    listener.commandSucceeded(succeeded(5, "getMore", 300));

    assertEquals(List.of("MONGO_SLOW cmd=getMore coll=show ms=300"), lines);
  }

  @Test
  void commandWithoutCollectionUsesDash() {
    listener.commandSucceeded(succeeded(6, "ping", 400));

    assertEquals(List.of("MONGO_SLOW cmd=ping coll=- ms=400"), lines);
  }

  @Test
  void zeroThresholdDisables() {
    SlowCommandListener disabled = new SlowCommandListener(Duration.ZERO, lines::add);
    disabled.commandStarted(started(7, "find", new BsonDocument("find", new BsonString("show"))));
    disabled.commandSucceeded(succeeded(7, "find", 10_000));

    assertTrue(lines.isEmpty());
  }

  @Test
  void collectionOfHandlesEmptyAndNonStringValues() {
    assertEquals("-", SlowCommandListener.collectionOf("find", new BsonDocument()));
    assertEquals("-", SlowCommandListener.collectionOf("find", null));
    assertEquals("-", SlowCommandListener.collectionOf("hello", new BsonDocument("hello", new BsonInt64(1))));
  }
}
