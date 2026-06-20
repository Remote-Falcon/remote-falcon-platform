package com.remotefalcon.config;

import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.remotefalcon.repository.VoteEventRepository;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.util.concurrent.TimeUnit;

/**
 * Ensures the {@code voteEvent} indexes at startup (idempotent) — PRD-009,
 * ADR-1 + ADR-5.
 *
 * <ul>
 *   <li>{@code {showId, ip, votedAt}} compound — turns the #162 daily-cap count
 *       and the #164/#168 lookups into an index scan.</li>
 *   <li>{@code {expireAt}} TTL with {@code expireAfterSeconds=0} — each document's
 *       own {@code expireAt} drives deletion, enabling per-show / per-tier
 *       retention (ADR-5).</li>
 * </ul>
 *
 * <p>{@code createIndex} is idempotent; creating an index also implicitly creates
 * the collection if it doesn't exist yet.
 */
@ApplicationScoped
public class VoteEventIndexInitializer {
  private static final Logger LOG = Logger.getLogger(VoteEventIndexInitializer.class);

  @Inject
  VoteEventRepository voteEventRepository;

  void onStart(@Observes StartupEvent event) {
    try {
      voteEventRepository.mongoCollection()
          .createIndex(Indexes.ascending("showId", "ip", "votedAt"));
      voteEventRepository.mongoCollection()
          .createIndex(Indexes.ascending("expireAt"), new IndexOptions().expireAfter(0L, TimeUnit.SECONDS));
      LOG.info("voteEvent indexes ensured");
    } catch (Exception e) {
      // Don't fail startup on index creation — log and continue. A missing index
      // can be created out-of-band; failing the pod over it would be worse.
      LOG.warnf("Failed to ensure voteEvent indexes: %s", e.getMessage());
    }
  }
}
