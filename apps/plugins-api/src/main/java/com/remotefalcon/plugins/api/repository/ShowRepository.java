package com.remotefalcon.plugins.api.repository;

import com.mongodb.client.FindIterable;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Projections;
import com.remotefalcon.library.quarkus.entity.Show;
import io.quarkus.mongodb.panache.PanacheMongoRepository;
import jakarta.enterprise.context.ApplicationScoped;

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
