package com.remotefalcon.entity;

import io.quarkus.mongodb.panache.PanacheMongoEntity;
import io.quarkus.mongodb.panache.common.MongoEntity;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.bson.types.ObjectId;

import java.time.LocalDateTime;

/**
 * Per-vote audit record — PRD-remote-falcon-009 (#165), ADR-1 + ADR-5.
 *
 * <p>Stored in its own {@code voteEvent} collection (not embedded in the Show
 * document). Keyed on the immutable Show {@code _id} ({@link #showId}), not the
 * mutable {@code showSubdomain} (cf. issue #159). Geo is coarse (2 dp);
 * {@link #votedAt} / {@link #expireAt} are UTC.
 *
 * <p>Retention is a per-document {@link #expireAt} + a TTL index
 * ({@code expireAfterSeconds: 0}), so the window is per-show configurable
 * (ADR-5: free-tier default 90d).
 */
@Data
@Builder
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@MongoEntity(collection = "voteEvent")
public class VoteEvent extends PanacheMongoEntity {
  private ObjectId showId;
  private String ip;
  private String viewerId;
  private String sequenceName;
  private Double latitude;
  private Double longitude;
  private LocalDateTime votedAt;
  private LocalDateTime expireAt;

  /**
   * Build a vote-event record: coarsens geo (ADR-5), stamps {@code votedAt} and
   * {@code expireAt = votedAt + retentionDays}. Pure factory — unit-testable
   * without a database.
   *
   * @param votedAtUtc the vote time in UTC
   * @param retentionDays per-show retention window (ADR-5 free-tier default 90)
   */
  public static VoteEvent of(ObjectId showId, String ip, String viewerId, String sequenceName,
                             Float latitude, Float longitude, LocalDateTime votedAtUtc, long retentionDays) {
    return VoteEvent.builder()
        .showId(showId)
        .ip(ip)
        .viewerId(viewerId)
        .sequenceName(sequenceName)
        .latitude(coarsen(latitude))
        .longitude(coarsen(longitude))
        .votedAt(votedAtUtc)
        .expireAt(votedAtUtc.plusDays(retentionDays))
        .build();
  }

  /**
   * ADR-5 — store coarse geo only: round to 2 decimal places (~1 km), never the
   * precise GPS-gate coordinates. Null-safe.
   */
  static Double coarsen(Float coord) {
    if (coord == null) {
      return null;
    }
    return Math.round(coord * 100.0) / 100.0;
  }
}
