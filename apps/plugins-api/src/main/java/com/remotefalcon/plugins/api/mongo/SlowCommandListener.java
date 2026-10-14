package com.remotefalcon.plugins.api.mongo;

import com.mongodb.event.CommandFailedEvent;
import com.mongodb.event.CommandListener;
import com.mongodb.event.CommandStartedEvent;
import com.mongodb.event.CommandSucceededEvent;
import jakarta.inject.Singleton;
import jakarta.inject.Inject;
import org.bson.BsonDocument;
import org.bson.BsonValue;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Logs {@code MONGO_SLOW cmd=<name> coll=<collection> ms=<elapsed>} for any
 * driver command slower than the threshold. DO Managed Mongo exposes no
 * slow-query or currentOp view, so this is the only per-query latency signal
 * we get; the line ships to PostHog through the OTel collector.
 *
 * <p>Quarkus registers every {@link CommandListener} bean on the Mongo client
 * (see MongoClients#createMongoConfiguration). The bean is unconditional and
 * the threshold is read at runtime, so nothing here is decided at native-image
 * build time (memory note: control-panel-native-image-conditional-beans).
 * Set {@code remotefalcon.mongodb.slow-command-threshold=0} to disable.
 */
@Singleton
public class SlowCommandListener implements CommandListener {

  private static final Logger LOG = Logger.getLogger(SlowCommandListener.class);
  // Guard against an unbounded map if the driver ever skipped a completion
  // event. Far above any realistic in-flight count (pool max is 15).
  private static final int MAX_IN_FLIGHT = 10_000;

  private final long thresholdMillis;
  private final Consumer<String> sink;
  private final Map<Integer, String> collectionByRequestId = new ConcurrentHashMap<>();

  @Inject
  public SlowCommandListener(
      @ConfigProperty(name = "remotefalcon.mongodb.slow-command-threshold", defaultValue = "250ms")
      Duration threshold) {
    this(threshold, LOG::warn);
  }

  SlowCommandListener(Duration threshold, Consumer<String> sink) {
    this.thresholdMillis = threshold.toMillis();
    this.sink = sink;
  }

  @Override
  public void commandStarted(CommandStartedEvent event) {
    if (!enabled()) {
      return;
    }
    if (collectionByRequestId.size() >= MAX_IN_FLIGHT) {
      collectionByRequestId.clear();
    }
    // The command document is only valid during this callback, so pull the
    // collection name out now.
    collectionByRequestId.put(event.getRequestId(), collectionOf(event.getCommandName(), event.getCommand()));
  }

  @Override
  public void commandSucceeded(CommandSucceededEvent event) {
    if (!enabled()) {
      return;
    }
    String collection = collectionByRequestId.remove(event.getRequestId());
    report(event.getCommandName(), collection, event.getElapsedTime(TimeUnit.MILLISECONDS), false);
  }

  @Override
  public void commandFailed(CommandFailedEvent event) {
    if (!enabled()) {
      return;
    }
    String collection = collectionByRequestId.remove(event.getRequestId());
    report(event.getCommandName(), collection, event.getElapsedTime(TimeUnit.MILLISECONDS), true);
  }

  private boolean enabled() {
    return thresholdMillis > 0;
  }

  private void report(String commandName, String collection, long elapsedMillis, boolean failed) {
    if (elapsedMillis < thresholdMillis) {
      return;
    }
    sink.accept("MONGO_SLOW cmd=" + commandName
        + " coll=" + (collection == null ? "-" : collection)
        + " ms=" + elapsedMillis
        + (failed ? " failed=true" : ""));
  }

  /**
   * For collection-scoped commands the first key is the command name and its
   * value is the collection ({@code {find: "show", ...}}). getMore carries the
   * collection in a separate field. Anything else (hello, ping, endSessions)
   * has no collection.
   */
  static String collectionOf(String commandName, BsonDocument command) {
    if (command == null || command.isEmpty()) {
      return "-";
    }
    BsonValue value = "getMore".equals(commandName) ? command.get("collection") : command.get(commandName);
    return value != null && value.isString() ? value.asString().getValue() : "-";
  }
}
