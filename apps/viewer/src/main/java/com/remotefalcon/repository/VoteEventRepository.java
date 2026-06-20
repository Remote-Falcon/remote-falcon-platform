package com.remotefalcon.repository;

import com.remotefalcon.entity.VoteEvent;
import io.quarkus.mongodb.panache.PanacheMongoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import org.bson.types.ObjectId;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * Repository for the {@code voteEvent} audit collection (PRD-009 #165, ADR-1).
 * Indexes are created at startup by {@code VoteEventIndexInitializer}.
 */
@ApplicationScoped
public class VoteEventRepository implements PanacheMongoRepository<VoteEvent> {

  /**
   * ADR-5 — free-tier default retention. Stored as a per-document {@code expireAt}
   * so paid tiers can extend per show later without a schema change.
   */
  public static final long DEFAULT_RETENTION_DAYS = 90L;

  /**
   * Append a per-vote audit record (call post-allow). Intended to be invoked
   * fire-and-forget at the call site — a failure here must never block a vote
   * that already succeeded, mirroring {@code upsertViewerSession}.
   */
  public void record(ObjectId showId, String ip, String viewerId, String sequenceName,
                     Float latitude, Float longitude) {
    persist(VoteEvent.of(showId, ip, viewerId, sequenceName, latitude, longitude,
        LocalDateTime.now(ZoneOffset.UTC), DEFAULT_RETENTION_DAYS));
  }
}
