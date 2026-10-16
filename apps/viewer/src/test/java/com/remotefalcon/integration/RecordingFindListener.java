package com.remotefalcon.integration;

import com.mongodb.event.CommandFailedEvent;
import com.mongodb.event.CommandListener;
import com.mongodb.event.CommandStartedEvent;
import com.mongodb.event.CommandSucceededEvent;
import jakarta.inject.Singleton;
import org.bson.BsonDocument;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Test-only record of every {@code find} command the driver sends, so a test
 * can assert what a code path actually asked Mongo for (its projection), not
 * just what the Java method returned. Quarkus registers every
 * {@link CommandListener} bean on the client, so this rides alongside
 * SlowCommandListener in every @QuarkusTest. It only appends to a list.
 */
@Singleton
public class RecordingFindListener implements CommandListener {

  private final List<BsonDocument> finds = new CopyOnWriteArrayList<>();

  @Override
  public void commandStarted(CommandStartedEvent event) {
    if ("find".equals(event.getCommandName())) {
      // The command document is only valid during this callback.
      finds.add(event.getCommand().clone());
    }
  }

  @Override
  public void commandSucceeded(CommandSucceededEvent event) {
  }

  @Override
  public void commandFailed(CommandFailedEvent event) {
  }

  public void clear() {
    finds.clear();
  }

  /** The find commands whose filter is {@code {showSubdomain: <subdomain>}}. */
  public List<BsonDocument> findsForSubdomain(String subdomain) {
    return finds.stream()
        .filter(cmd -> cmd.containsKey("filter"))
        .filter(cmd -> {
          BsonDocument filter = cmd.getDocument("filter");
          return filter.containsKey("showSubdomain")
              && filter.get("showSubdomain").isString()
              && subdomain.equals(filter.getString("showSubdomain").getValue());
        })
        .toList();
  }
}
