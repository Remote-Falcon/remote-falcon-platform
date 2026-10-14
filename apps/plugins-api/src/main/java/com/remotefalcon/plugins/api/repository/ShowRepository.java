package com.remotefalcon.plugins.api.repository;

import com.mongodb.client.FindIterable;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Projections;
import com.remotefalcon.library.quarkus.entity.Show;
import io.quarkus.mongodb.panache.PanacheMongoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import org.bson.Document;

import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class ShowRepository implements PanacheMongoRepository<Show> {
  /**
   * The per-request Show load behind {@code ShowTokenFilter} — every plugin
   * call goes through this, so it runs at listener-poll frequency for the
   * whole fleet. Excludes everything the plugin endpoints never read.
   *
   * <p>Safe to exclude because every write in this service is a targeted
   * {@code updateOne} ({@code $set}/{@code $push}/{@code $pull} on specific
   * paths) — the loaded Show is never written back whole, so a missing field
   * here can't erase data. The one stats sub-array that IS read-modify-written
   * from this load is {@code stats.votingWin}
   * (PluginService highestVotedSequence), which is why it stays included.
   *
   * <p>Two groups of exclusions:
   * <ul>
   *   <li><b>Operator telemetry the plugin never reads</b> — viewerSessions
   *       and stats.page are the unbounded whales (thousands of entries on an
   *       active show); activeViewers, rejectedRequests, showNotifications,
   *       heartbeatGaps, versionChanges are smaller but equally unread.
   *       heartbeatGaps/versionChanges are written by this service, but only
   *       via push/pull with freshly-built values — never read off the doc.</li>
   *   <li><b>Credentials and profile</b> — password, MFA config, reset
   *       tokens, API access, user profile. The filter authenticates by the
   *       showToken lookup itself; nothing downstream reads these, so they
   *       shouldn't ride along on every heartbeat.</li>
   * </ul>
   */
  public Optional<Show> findByShowToken(String showToken) {
    FindIterable<Show> result = mongoCollection()
        .find(Filters.eq("showToken", showToken))
        .projection(Projections.fields(
            Projections.exclude(
                "pages",
                "stats.page",
                "stats.voting",
                "stats.jukebox",
                "stats.rejectedRequests",
                "viewerSessions",
                "activeViewers",
                "showNotifications",
                "heartbeatGaps",
                "versionChanges",
                "password",
                "passwordResetLink",
                "passwordResetExpiry",
                "mfa",
                "apiAccess",
                "userProfile",
                "serviceToken"
            )
        ));

    Show show = result.first();
    return Optional.ofNullable(show);
  }

  /**
   * Minimal slice for the /fppHeartbeat fast path: the endpoint only reads
   * showToken (for the update filter) and lastFppHeartbeat (rate limit + gap
   * detection). Heartbeats are the highest-frequency call the plugin makes
   * (~every 30s per show), so they shouldn't haul votes/requests/sequences
   * on every beat the way the general filter load does.
   */
  public Optional<Show> findHeartbeatSliceByShowToken(String showToken) {
    FindIterable<Show> result = mongoCollection()
        .find(Filters.eq("showToken", showToken))
        .projection(Projections.fields(
            Projections.include("showToken", "lastFppHeartbeat")
        ));

    return Optional.ofNullable(result.first());
  }

  /**
   * Whether a show has anything queued, without loading it. Backs the
   * empty-queue short-circuit on the two plugin poll endpoints, which
   * interrupt-mode plugins call about once a second and which almost always
   * find nothing.
   *
   * <p>Returns two computed booleans and no document fields, so the reply is
   * a few bytes instead of the filter projection (sequences alone are ~30 KB,
   * up to ~1 MB on artwork shows). It's still one indexed lookup, and
   * WiredTiger still has to page the doc in to evaluate {@code $size}. The
   * saving is the serialize/transfer/decode work, not cache residency.
   *
   * <p>Empty also doubles as "no such token", so the filter can negatively
   * cache unknown tokens from the same call.
   */
  public Optional<PollState> findPollStateByShowToken(String showToken) {
    Document result = mongoCollection()
        .withDocumentClass(Document.class)
        .find(Filters.eq("showToken", showToken))
        .projection(new Document("_id", 0)
            .append("hasRequests", nonEmptyArray("$requests"))
            .append("hasVotes", nonEmptyArray("$votes")))
        .first();
    if (result == null) {
      return Optional.empty();
    }
    return Optional.of(new PollState(
        Boolean.TRUE.equals(result.getBoolean("hasRequests")),
        Boolean.TRUE.equals(result.getBoolean("hasVotes"))));
  }

  /** {@code {$cond: [{$isArray: field}, {$gt: [{$size: field}, 0]}, false]}}: null/missing count as empty. */
  private static Document nonEmptyArray(String fieldRef) {
    return new Document("$cond", List.of(
        new Document("$isArray", fieldRef),
        new Document("$gt", List.of(new Document("$size", fieldRef), 0)),
        false));
  }

  /** Result of {@link #findPollStateByShowToken}. */
  public record PollState(boolean hasRequests, boolean hasVotes) {
  }

  /**
   * Pages metadata only (name + active flag) for the viewer-page FPP command
   * (PRD-016). findByShowToken() deliberately excludes `pages` so the
   * high-frequency listener polls never haul viewer-page HTML; this targeted
   * lookup includes the pages array but still leaves the HTML behind.
   */
  public Optional<Show> findPagesMetaByShowToken(String showToken) {
    FindIterable<Show> result = mongoCollection()
        .find(Filters.eq("showToken", showToken))
        .projection(Projections.fields(
            Projections.include("showToken", "pages.name", "pages.active")
        ));

    return Optional.ofNullable(result.first());
  }
}
