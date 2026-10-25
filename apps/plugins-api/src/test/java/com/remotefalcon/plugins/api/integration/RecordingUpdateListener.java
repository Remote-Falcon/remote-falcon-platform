package com.remotefalcon.plugins.api.integration;

import com.mongodb.event.CommandListener;
import com.mongodb.event.CommandStartedEvent;
import jakarta.inject.Singleton;
import org.bson.BsonDocument;
import org.bson.BsonValue;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Test-only driver listener that records the update statements sent to the
 * {@code show} collection. Quarkus registers every {@link CommandListener}
 * bean on the Mongo client, so integration tests can assert on the exact
 * operators a code path sends (e.g. "a normal heartbeat never sends $pull")
 * rather than inferring them from the resulting document state.
 */
@Singleton
public class RecordingUpdateListener implements CommandListener {

  private final List<BsonDocument> showUpdates = new CopyOnWriteArrayList<>();

  @Override
  public void commandStarted(CommandStartedEvent event) {
    if (!"update".equals(event.getCommandName())) {
      return;
    }
    BsonDocument command = event.getCommand();
    BsonValue collection = command.get("update");
    if (collection == null || !collection.isString() || !"show".equals(collection.asString().getValue())) {
      return;
    }
    // In OP_MSG the statements may arrive as a document sequence rather than
    // an inline "updates" array; the driver folds them back into the
    // command document it hands to listeners either way.
    BsonValue updates = command.get("updates");
    if (updates != null && updates.isArray()) {
      for (BsonValue statement : updates.asArray()) {
        showUpdates.add(statement.asDocument().getDocument("u").clone());
      }
    }
  }

  /** The update documents ({@code u}) sent to the show collection since the last clear. */
  public List<BsonDocument> showUpdates() {
    return List.copyOf(showUpdates);
  }

  public void clear() {
    showUpdates.clear();
  }
}
