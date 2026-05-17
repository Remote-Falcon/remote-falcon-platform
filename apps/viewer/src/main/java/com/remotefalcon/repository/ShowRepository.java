package com.remotefalcon.repository;

import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.ViewerSession;
import com.remotefalcon.library.quarkus.entity.Show;
import io.quarkus.mongodb.panache.PanacheMongoRepository;
import jakarta.enterprise.context.ApplicationScoped;
import org.bson.conversions.Bson;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

@ApplicationScoped
public class ShowRepository implements PanacheMongoRepository<Show> {
  // V15 security fix — bound the rejectedRequests array so a hostile viewer
  // hammering /addSequenceToQueue with bad payloads can't grow the embedded
  // list past Mongo's 16 MB document limit. 30 days mirrors the heartbeat-gap
  // retention window in PluginService and comfortably covers a Halloween/
  // Christmas show season for the funnel analytics that consume this data.
  private static final long REJECTED_REQUESTS_RETENTION_DAYS = 30L;

  public Optional<Show> findByShowSubdomain(String showSubdomain) {
    return find("showSubdomain", showSubdomain).firstResultOptional();
  }

  public Optional<Show> findByShowSubdomainForViewer(String showSubdomain) {
    // Exclude large fields that viewers don't need
    Show result = mongoCollection()
        .find(Filters.eq("showSubdomain", showSubdomain))
        .projection(
            com.mongodb.client.model.Projections.exclude(
                "stats.page",              // Page stats can be huge
                "stats.voting",            // Voting stats not needed by viewers
                "stats.votingWin",         // Voting win stats not needed
                "stats.jukebox",           // Jukebox stats not needed
                "showToken",               // Sensitive authentication token
                "email",                   // Sensitive PII
                "password",                // Sensitive
                "lastLoginIp",             // Sensitive field
                "lastLoginDate",           // Not needed
                "passwordResetLink",       // Sensitive
                "passwordResetExpiry",     // Not needed
                "apiAccess",               // Not needed by viewers
                "userProfile",             // Not needed by viewers
                "showNotifications",       // Not needed by viewers
                "activeViewers"            // Contains other viewers' IP addresses (PII)
            )
        )
        .first();
    return Optional.ofNullable(result);
  }

  public Optional<Show> findByShowSubdomainForMutations(String showSubdomain) {
    // Optimized query for mutations (queue/vote operations)
    // Excludes large stat arrays but includes necessary fields for validation
    Show result = mongoCollection()
        .find(Filters.eq("showSubdomain", showSubdomain))
        .projection(
            com.mongodb.client.model.Projections.exclude(
                "stats.page",              // Page stats can be huge
                "stats.voting",            // Voting stats not needed
                "stats.votingWin",         // Not needed for mutations
                // Keep stats.jukebox for PSA frequency calculation
                "pages",                   // Not needed for queue/vote
                "showToken",               // Sensitive
                "email",                   // Sensitive PII
                "password",                // Sensitive
                "passwordResetLink",       // Sensitive
                "passwordResetExpiry",     // Not needed
                "apiAccess",               // Not needed
                "userProfile",             // Not needed
                "showNotifications",       // Not needed
                "activeViewers"            // Not needed
            )
        )
        .first();
    return Optional.ofNullable(result);
  }

  public long nextRequestPosition(Show show) {
    if (show == null || show.getRequests() == null || show.getRequests().isEmpty()) {
      return 1L;
    }

    // Find the maximum position in the existing requests and add 1
    return show.getRequests().stream()
        .mapToInt(Request::getPosition)
        .max()
        .orElse(0) + 1;
  }

  /**
   * Allocates a block of positions at once.
   * Returns the starting position. Caller can use startPos, startPos+1, startPos+2, etc.
   * @param show the show object
   * @param count how many positions to allocate
   * @return the starting position of the allocated block
   */
  public long allocatePositionBlock(Show show, int count) {
    if (show == null || show.getRequests() == null || show.getRequests().isEmpty()) {
      return 1L;
    }

    // Find the maximum position in the existing requests and add 1 to get the starting position
    int maxPosition = show.getRequests().stream()
        .mapToInt(Request::getPosition)
        .max()
        .orElse(0);

    return maxPosition + 1;
  }

  public void appendRequest(String showSubdomain, Request request) {
    mongoCollection().updateOne(Filters.eq("showSubdomain", showSubdomain), Updates.push("requests", request));
  }

  public void appendJukeboxStat(String showSubdomain, Stat.Jukebox stat) {
    mongoCollection().updateOne(Filters.eq("showSubdomain", showSubdomain), Updates.push("stats.jukebox", stat));
  }

  // V15 — log a refused addSequenceToQueue attempt for the conversion
  // funnel on the Sequences analytics tab. Prune + push must be two separate
  // updates because Mongo rejects $pull and $push on the same field path in
  // one operation. Mirrors the heartbeatGaps/versionChanges pattern in
  // plugins-api PluginService.
  public void appendRejectedRequestStat(String showSubdomain, Stat.RejectedRequest stat) {
    LocalDateTime cutoff = LocalDateTime.now().minusDays(REJECTED_REQUESTS_RETENTION_DAYS);
    var filter = Filters.eq("showSubdomain", showSubdomain);
    mongoCollection().updateOne(filter, Updates.pull("stats.rejectedRequests", Filters.lt("dateTime", cutoff)));
    mongoCollection().updateOne(filter, Updates.push("stats.rejectedRequests", stat));
  }

  public void appendPageStat(String showSubdomain, Stat.Page stat) {
    mongoCollection().updateOne(Filters.eq("showSubdomain", showSubdomain), Updates.push("stats.page", stat));
  }

  public void incrementVoteAndAppendVoter(String showSubdomain, String sequenceName, String voterIp, java.time.LocalDateTime voteTime, Stat.Voting votingStat) {
    if (votingStat != null) {
      mongoCollection().updateOne(
          Filters.and(
              Filters.eq("showSubdomain", showSubdomain),
              Filters.eq("votes.sequence.name", sequenceName)
          ),
          Updates.combine(
              Updates.inc("votes.$.votes", 1),
              Updates.push("votes.$.viewersVoted", voterIp),
              Updates.set("votes.$.lastVoteTime", voteTime),
              Updates.push("stats.voting", votingStat)
          )
      );
    } else {
      mongoCollection().updateOne(
          Filters.and(
              Filters.eq("showSubdomain", showSubdomain),
              Filters.eq("votes.sequence.name", sequenceName)
          ),
          Updates.combine(
              Updates.inc("votes.$.votes", 1),
              Updates.push("votes.$.viewersVoted", voterIp),
              Updates.set("votes.$.lastVoteTime", voteTime)
          )
      );
    }
  }

  public void addNewVoteAndStat(String showSubdomain, com.remotefalcon.library.models.Vote vote, Stat.Voting votingStat) {
    if (votingStat != null) {
      mongoCollection().updateOne(
          Filters.eq("showSubdomain", showSubdomain),
          Updates.combine(
              Updates.push("votes", vote),
              Updates.push("stats.voting", votingStat)
          )
      );
    } else {
      mongoCollection().updateOne(
          Filters.eq("showSubdomain", showSubdomain),
          Updates.push("votes", vote)
      );
    }
  }

  public void incrementSequenceGroupVoteAndAppendVoter(String showSubdomain, String groupName, String voterIp, java.time.LocalDateTime voteTime, Stat.Voting votingStat) {
    mongoCollection().updateOne(
        Filters.and(
            Filters.eq("showSubdomain", showSubdomain),
            Filters.eq("votes.sequenceGroup.name", groupName)
        ),
        Updates.combine(
            Updates.inc("votes.$.votes", 1),
            Updates.push("votes.$.viewersVoted", voterIp),
            Updates.set("votes.$.lastVoteTime", voteTime),
            Updates.push("stats.voting", votingStat)
        )
    );
  }

  public void updateActiveViewer(String showSubdomain, String ipAddress, String viewerId, java.time.LocalDateTime visitTime) {
    // Dedupe by either viewerId (preferred) or IP. We pull on both keys
    // so a viewer who clears localStorage and gets a new viewerId doesn't
    // appear twice in the active list while still on the same IP.
    Bson identityMatch = viewerId != null
        ? Filters.or(Filters.eq("ipAddress", ipAddress), Filters.eq("viewerId", viewerId))
        : Filters.eq("ipAddress", ipAddress);

    mongoCollection().updateOne(
        Filters.eq("showSubdomain", showSubdomain),
        Updates.pull("activeViewers", identityMatch)
    );

    mongoCollection().updateOne(
        Filters.eq("showSubdomain", showSubdomain),
        Updates.push("activeViewers",
            com.remotefalcon.library.models.ActiveViewer.builder()
                .ipAddress(ipAddress)
                .viewerId(viewerId)
                .visitDateTime(visitTime)
                .build()
        )
    );
  }

  /**
   * PRD A1 — viewer session window upsert (issue #131 race fix).
   *
   * Atomically extends an existing open session for this visitor (matched on
   * viewerId if present, else IP) where lastSeen is within {@value #SESSION_WINDOW_MINUTES}
   * minutes. If no open session exists, appends a new one tagged with
   * today's local date.
   *
   * Race protection — this method is called from page-stat, active-viewer,
   * addSequenceToQueue, and voteForSequence. Two threads from the same viewer
   * within the dwell window must NOT each push a fresh session entry.
   *
   *   1. Bump uses {@code $elemMatch} so the {@code $}-positional operator
   *      targets the single array element that matches identity AND open-window
   *      together. Without $elemMatch, Mongo evaluates the predicates
   *      independently across the array and can match disjoint elements,
   *      defeating the in-place bump and falling through to the push branch.
   *
   *   2. Push is guarded by a {@code $ne}-style filter that requires NO
   *      session element with matching identity AND open lastSeen to exist.
   *      If a concurrent writer raced ahead and created the session, the
   *      guard makes the second writer's push a no-op (modifiedCount=0),
   *      eliminating the duplicate. Two truly distinct visitors still each
   *      get their own session because their identity predicates differ.
   */
  public void upsertViewerSession(String showSubdomain, String ipAddress, String viewerId, LocalDateTime now) {
    final long SESSION_WINDOW_MINUTES = 5L;
    LocalDateTime windowStart = now.minusMinutes(SESSION_WINDOW_MINUTES);

    // Identity predicate applied INSIDE a single array element. viewerId-first
    // (preferred — stable across IP changes); IP fallback only when this
    // viewer has no viewerId yet (legacy events, cleared localStorage).
    Bson identityElemPredicate = viewerId != null
        ? Filters.eq("viewerId", viewerId)
        : Filters.and(
            Filters.eq("viewerId", null),
            Filters.eq("ip", ipAddress));

    // Open-session matcher: identity AND lastSeen-within-window must hold on
    // the SAME array element. $elemMatch guarantees this; bare top-level
    // dotted predicates do not.
    Bson openSessionElemMatch = Filters.elemMatch(
        "viewerSessions",
        Filters.and(identityElemPredicate, Filters.gte("lastSeen", windowStart))
    );

    // Step 1 — try to bump in place. $-positional targets the elemMatch hit.
    var bumpResult = mongoCollection().updateOne(
        Filters.and(
            Filters.eq("showSubdomain", showSubdomain),
            openSessionElemMatch
        ),
        Updates.combine(
            Updates.set("viewerSessions.$.lastSeen", now),
            Updates.inc("viewerSessions.$.eventCount", 1)
        )
    );

    if (bumpResult.getModifiedCount() == 0) {
      // Step 2 — no open session existed (or matched). Push a fresh one,
      // but ONLY if no concurrent writer already created an open session
      // for this identity. The $not($elemMatch) guard makes this push
      // race-safe: if a sibling request just pushed, the filter fails and
      // we silently skip — no duplicate.
      ViewerSession newSession = ViewerSession.builder()
          .ip(ipAddress)
          .viewerId(viewerId)
          .nightDate(now.toLocalDate())
          .firstSeen(now)
          .lastSeen(now)
          .eventCount(1)
          .build();
      mongoCollection().updateOne(
          Filters.and(
              Filters.eq("showSubdomain", showSubdomain),
              Filters.not(openSessionElemMatch)
          ),
          Updates.push("viewerSessions", newSession)
      );
    }
  }

  public void updatePlayingNow(String showSubdomain, String playingNow) {
    mongoCollection().updateOne(
        Filters.eq("showSubdomain", showSubdomain),
        Updates.set("playingNow", playingNow)
    );
  }

  public void updatePlayingNext(String showSubdomain, String playingNext) {
    mongoCollection().updateOne(
        Filters.eq("showSubdomain", showSubdomain),
        Updates.set("playingNext", playingNext)
    );
  }

  public void appendRequestAndJukeboxStat(String showSubdomain, Request request, Stat.Jukebox stat) {
    mongoCollection().updateOne(
        Filters.eq("showSubdomain", showSubdomain),
        Updates.combine(
            Updates.push("requests", request),
            Updates.push("stats.jukebox", stat)
        )
    );
  }

  public void appendMultipleRequestsAndJukeboxStat(String showSubdomain, java.util.List<Request> requests,
      Stat.Jukebox stat) {
    mongoCollection().updateOne(
        Filters.eq("showSubdomain", showSubdomain),
        Updates.combine(
            Updates.pushEach("requests", requests),
            Updates.push("stats.jukebox", stat)
        )
    );
  }

  public void updatePsaSequences(String showSubdomain, java.util.List<com.remotefalcon.library.models.PsaSequence> psaSequences) {
    mongoCollection().updateOne(
        Filters.eq("showSubdomain", showSubdomain),
        Updates.set("psaSequences", psaSequences)
    );
  }

  public long appendPageStatIfNotOwner(String showSubdomain, String clientIp, Stat.Page stat) {
    // Only append stat if clientIp is different from lastLoginIp (owner's IP)
    var result = mongoCollection().updateOne(
        Filters.and(
            Filters.eq("showSubdomain", showSubdomain),
            Filters.ne("lastLoginIp", clientIp)
        ),
        Updates.push("stats.page", stat)
    );
    return result.getModifiedCount();
  }

  public Optional<Show> findPagesOnlyByShowSubdomain(String showSubdomain) {
    // Optimized query that ONLY fetches the pages array (not the entire Show document)
    // This is the sweet spot for performance:
    // - Minimal network transfer (only pages array, typically 5-10 KB)
    // - Minimal disk I/O (MongoDB only needs to read pages field)
    // - Simple Java iteration over 1-5 pages is negligible vs query overhead
    Show result = mongoCollection()
        .find(Filters.eq("showSubdomain", showSubdomain))
        .projection(
            com.mongodb.client.model.Projections.include("pages")
        )
        .first();
    return Optional.ofNullable(result);
  }
}
