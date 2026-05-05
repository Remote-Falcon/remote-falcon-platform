package com.remotefalcon.controlpanel.configuration;

import com.remotefalcon.library.documents.Show;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Collation;
import org.springframework.stereotype.Component;

/**
 * Ensures the production indexes on the {@code show} collection exist at startup.
 *
 * <p>Historically these indexes were applied imperatively via {@code mongosh} against
 * the live cluster, which left fresh environments (local dev, new clusters, ephemeral
 * test envs) silently unindexed until someone remembered to run the script. Wiring
 * them into {@link ApplicationReadyEvent} makes the bootstrap automatic and idempotent:
 * {@link org.springframework.data.mongodb.core.index.IndexOperations#ensureIndex}
 * creates the index if missing, no-ops if an identical spec already exists, and throws
 * if the existing spec differs (which is the desired safety net for accidental drift).
 *
 * <p>Indexes ensured:
 * <ul>
 *   <li>{@code idx_showToken} — unique index on {@code showToken}</li>
 *   <li>{@code idx_email_ci} — unique index on {@code email} with case-insensitive
 *       collation ({@code locale: "en", strength: 2})</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MongoIndexInitializer {

  private final MongoTemplate mongoTemplate;

  @EventListener(ApplicationReadyEvent.class)
  public void ensureShowIndexes() {
    long start = System.currentTimeMillis();
    try {
      mongoTemplate.indexOps(Show.class).ensureIndex(
          new Index()
              .on("showToken", Sort.Direction.ASC)
              .named("idx_showToken")
              .unique()
      );
      mongoTemplate.indexOps(Show.class).ensureIndex(
          new Index()
              .on("email", Sort.Direction.ASC)
              .named("idx_email_ci")
              .unique()
              .collation(Collation.of("en").strength(Collation.ComparisonLevel.secondary()))
      );
      log.info("Show collection indexes ensured in {} ms",
               System.currentTimeMillis() - start);
    } catch (Exception e) {
      // Don't crash startup on a transient Mongo issue or a benign index spec
      // conflict — log loudly and let the pod come up. The deploy-fix is then to
      // investigate the conflict (probably a spec mismatch against an existing
      // index of the same name).
      log.error("Failed to ensure Show indexes: {}", e.getMessage(), e);
    }
  }
}
