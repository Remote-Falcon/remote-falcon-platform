package com.remotefalcon.external.api.configuration;

import com.mongodb.event.CommandFailedEvent;
import com.mongodb.event.CommandListener;
import com.mongodb.event.CommandStartedEvent;
import com.mongodb.event.CommandSucceededEvent;
import lombok.extern.slf4j.Slf4j;
import org.bson.BsonDocument;
import org.bson.BsonValue;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Logs one line per Mongo command slower than {@link #THRESHOLD_MS}:
 * {@code MONGO_SLOW cmd=<name> coll=<collection> ms=<elapsed>}. DO Managed
 * Mongo has no slow-query or current-op view, so this is the only per-command
 * latency signal we get. Failed commands over the threshold get a trailing
 * {@code failed=<ExceptionClass>}. Lines ship to PostHog via the OTel
 * collector, where a log alert counts them.
 */
@Slf4j
public class SlowMongoCommandListener implements CommandListener {

  static final long THRESHOLD_MS = 250;
  // Guard against an unbounded map if a started event is ever orphaned.
  private static final int MAX_IN_FLIGHT = 10_000;

  private final Map<Integer, String> collectionByRequestId = new ConcurrentHashMap<>();

  @Override
  public void commandStarted(CommandStartedEvent event) {
    if (collectionByRequestId.size() >= MAX_IN_FLIGHT) {
      collectionByRequestId.clear();
    }
    collectionByRequestId.put(event.getRequestId(), collectionOf(event.getCommandName(), event.getCommand()));
  }

  @Override
  public void commandSucceeded(CommandSucceededEvent event) {
    String coll = collectionByRequestId.remove(event.getRequestId());
    long ms = event.getElapsedTime(TimeUnit.MILLISECONDS);
    if (ms > THRESHOLD_MS) {
      log.warn(format(event.getCommandName(), coll, ms));
    }
  }

  @Override
  public void commandFailed(CommandFailedEvent event) {
    String coll = collectionByRequestId.remove(event.getRequestId());
    long ms = event.getElapsedTime(TimeUnit.MILLISECONDS);
    if (ms > THRESHOLD_MS) {
      log.warn(format(event.getCommandName(), coll, ms) + " failed="
          + event.getThrowable().getClass().getSimpleName());
    }
  }

  static String format(String cmd, String coll, long ms) {
    return "MONGO_SLOW cmd=" + cmd + " coll=" + (coll == null ? "-" : coll) + " ms=" + ms;
  }

  /**
   * Collection-level commands (find, aggregate, update, insert, delete,
   * count, ...) carry {@code <commandName>: "<collection>"}. getMore names
   * the collection in a separate "collection" field. Anything else gets "-".
   */
  static String collectionOf(String commandName, BsonDocument command) {
    try {
      BsonValue value = "getMore".equals(commandName)
          ? command.get("collection")
          : command.get(commandName);
      return value != null && value.isString() ? value.asString().getValue() : "-";
    } catch (RuntimeException e) {
      return "-";
    }
  }
}
