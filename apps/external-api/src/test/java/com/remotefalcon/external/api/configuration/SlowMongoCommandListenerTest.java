package com.remotefalcon.external.api.configuration;

import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.RequestContext;
import com.mongodb.ServerAddress;
import com.mongodb.connection.ClusterId;
import com.mongodb.connection.ConnectionDescription;
import com.mongodb.connection.ServerId;
import com.mongodb.event.CommandFailedEvent;
import com.mongodb.event.CommandStartedEvent;
import com.mongodb.event.CommandSucceededEvent;
import org.bson.BsonDocument;
import org.bson.BsonInt32;
import org.bson.BsonInt64;
import org.bson.BsonString;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(OutputCaptureExtension.class)
class SlowMongoCommandListenerTest {

  private static final ConnectionDescription CONN =
      new ConnectionDescription(new ServerId(new ClusterId(), new ServerAddress()));
  private static final RequestContext NO_CTX = null;

  private final SlowMongoCommandListener listener = new SlowMongoCommandListener();

  @Test
  void logsCommandsOverThreshold(CapturedOutput out) {
    start(1, "find", new BsonDocument("find", new BsonString("show")));
    listener.commandSucceeded(succeeded(1, "find", 251));

    assertThat(out).contains("MONGO_SLOW cmd=find coll=show ms=251");
  }

  @Test
  void ignoresCommandsAtOrUnderThreshold(CapturedOutput out) {
    start(2, "find", new BsonDocument("find", new BsonString("show")));
    listener.commandSucceeded(succeeded(2, "find", 250));

    assertThat(out).doesNotContain("MONGO_SLOW");
  }

  @Test
  void logsSlowFailuresWithExceptionClass(CapturedOutput out) {
    start(3, "update", new BsonDocument("update", new BsonString("show")));
    listener.commandFailed(new CommandFailedEvent(NO_CTX, 1L, 3, CONN, "remote-falcon", "update",
        TimeUnit.MILLISECONDS.toNanos(10_000), new MongoSocketReadTimeoutException("t", new ServerAddress(), null)));

    assertThat(out).contains("MONGO_SLOW cmd=update coll=show ms=10000 failed=MongoSocketReadTimeoutException");
  }

  @Test
  void getMoreReadsTheCollectionField(CapturedOutput out) {
    start(4, "getMore", new BsonDocument("getMore", new BsonInt64(42)).append("collection", new BsonString("show")));
    listener.commandSucceeded(succeeded(4, "getMore", 900));

    assertThat(out).contains("MONGO_SLOW cmd=getMore coll=show ms=900");
  }

  @Test
  void databaseLevelCommandsLogADash() {
    assertThat(SlowMongoCommandListener.collectionOf("aggregate", new BsonDocument("aggregate", new BsonInt32(1))))
        .isEqualTo("-");
    assertThat(SlowMongoCommandListener.collectionOf("ping", new BsonDocument("ping", new BsonInt32(1))))
        .isEqualTo("-");
  }

  @Test
  void unmatchedSucceededEventStillLogs(CapturedOutput out) {
    listener.commandSucceeded(succeeded(99, "find", 300));

    assertThat(out).contains("MONGO_SLOW cmd=find coll=- ms=300");
  }

  private void start(int requestId, String cmd, BsonDocument command) {
    listener.commandStarted(new CommandStartedEvent(NO_CTX, 1L, requestId, CONN, "remote-falcon", cmd, command));
  }

  private static CommandSucceededEvent succeeded(int requestId, String cmd, long ms) {
    return new CommandSucceededEvent(NO_CTX, 1L, requestId, CONN, "remote-falcon", cmd,
        new BsonDocument(), TimeUnit.MILLISECONDS.toNanos(ms));
  }
}
