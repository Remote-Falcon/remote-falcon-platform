package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.Sequence;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.Aggregation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ShowRepository extends MongoRepository<Show, String> {
    @Transactional
    void deleteByShowToken(String showToken);
    Optional<Show> findByShowToken(String showToken);
    Optional<Show> findByShowSubdomain(String showSubdomain);
    Optional<Show> findByShowName(String showName);

    // Public, unauth `wrappedSummary` projection — load ONLY the fields
    // needed to compute the season summary. Explicitly excludes password,
    // apiAccess, showToken, lastLoginIp, viewerSessions.ip, etc. so that
    // sensitive material never enters the JVM heap on the public path.
    //
    // Lookup is by the random capability-URL token (`preferences.wrappedShareToken`),
    // NOT by subdomain — subdomains are enumerable via `showsOnAMap` and
    // a guessable URL is no security boundary. The token is the credential.
    @Query(value = "{ 'preferences.wrappedShareToken': ?0 }",
            fields = "{ 'showName': 1, 'showSubdomain': 1, " +
                     "'preferences.wrappedPublic': 1, 'preferences.wrappedShareToken': 1, " +
                     "'stats.page': 1, 'stats.jukebox': 1, 'stats.voting': 1, " +
                     "'sequences.name': 1, 'sequences.duration': 1, " +
                     "'viewerSessions.viewerId': 1, 'viewerSessions.ip': 1, " +
                     "'viewerSessions.firstSeen': 1, 'viewerSessions.lastSeen': 1 }")
    Optional<Show> findByWrappedShareTokenForWrapped(String wrappedShareToken);

    // Case-insensitive email lookup that uses the idx_email_ci index (collation strength=2).
    // Spring Data's derived findByEmailIgnoreCase uses $regex /i which can't use the index.
    @Query(value = "{ 'email': ?0 }", collation = "{ 'locale': 'en', 'strength': 2 }")
    Optional<Show> findByEmailCollation(String email);

    Optional<Show> findByPasswordResetLinkAndPasswordResetExpiryGreaterThan(String passwordResetLink, LocalDateTime passwordResetExpiry);
    List<Show> findByPreferencesNotificationPreferencesEnableFppHeartbeatIsTrueAndLastFppHeartbeatBefore(LocalDateTime lastFppHeartbeat);
    // Admin show-name autosuggest. Case-insensitive prefix match on
    // showName, index-backed by idx_showName (plain btree). Caller passes
    // PageRequest.of(0, 25) to cap the result set server-side. Returns
    // full Show documents with ONLY the showName field populated.
    //
    // Two important Mongo behaviors driving the shape of this query:
    //
    //   1. Collation indexes CANNOT be used for $regex queries even
    //      with matching collation (SERVER-44284). So the index here
    //      is plain btree, and we use $options: 'i' for case-
    //      insensitivity at the matcher level.
    //
    //   2. Spring Data MongoDB substitutes ?N placeholders OUTSIDE
    //      string literals only. The caller must therefore build the
    //      full regex pattern (anchor + escaped user input) in Java
    //      and pass it as a plain ?0 value. The caller MUST anchor
    //      the regex with ^ for the planner to use the index range
    //      scan; without ^ the planner falls back to a COLLSCAN
    //      across every doc.
    //
    // Verified by explain() on dev (2598 shows): IXSCAN on idx_showName,
    // ~3ms for "^lights" with $options: 'i' and limit=25.
    //
    // Why prefix-only: a contains-anywhere regex cannot use ANY index in
    // MongoDB. The trade-off: typing "lights" no longer matches
    // "Killarney Lane Lights" -- only shows whose name starts with
    // "lights*". Standard autosuggest UX (Mongo Atlas Search would be
    // required for contains-match; not on the roadmap).
    @Query(value = "{ 'showName': { '$regex': ?0, '$options': 'i' } }",
            fields = "{ 'showName': 1 }")
    List<Show> findByShowNameStartingWith(String anchoredRegexPattern, Pageable pageable);

    @Query(value = "{ 'preferences.showOnMap': true, " +
                   "'preferences.showLatitude':  { $gte: -90,  $lte: 90 }, " +
                   "'preferences.showLongitude': { $gte: -180, $lte: 180 }, " +
                   "$or: [ { 'preferences.showLatitude': { $ne: 0 } }, { 'preferences.showLongitude': { $ne: 0 } } ] }",
            fields = "{ 'showName': 1, 'preferences.showLatitude': 1, 'preferences.showLongitude': 1, 'preferences.showOnMap': 1 }")
    List<Show> getShowsOnMap();

    @Aggregation(pipeline = {
            "{ '$match': { 'showToken' : ?0 } }",
            "{ '$project': { 'sequences' : 1 } }",
            "{ '$unwind': '$sequences' }",
            "{ '$replaceRoot': { 'newRoot': '$sequences' } }"
    })
    List<Sequence> getSequencesByShowToken(String showToken);

    // ─────────────────────────────────────────────────────────────────────
    // Pattern A — read-only projection variants. The dashboard read paths used
    // to load the ENTIRE Show (5–10 MB on a populated season) just to read one
    // sub-array; these load only what each path needs. See Query-Perf-Audit
    // and mirror the viewer service's findByShowSubdomainForViewer pattern.
    //
    // SAFETY RULE: each returns a PARTIALLY-POPULATED Show — excluded fields
    // are null. Spring Data save() is a full-document REPLACE, so a Show loaded
    // through any of these MUST NEVER be passed to save(): that would wipe the
    // excluded arrays. Read-only callers only. Writers use atomic
    // MongoTemplate Updates.set(...) instead. ShowRepositoryProjectionTest
    // pins this contract.
    // ─────────────────────────────────────────────────────────────────────

    // Stats analytics: dashboardStats, requestConversion, psaEffectiveness,
    // dashboardStatsByHour. Keeps the whole stats object (these read
    // stats.page/jukebox/voting/votingWin/rejectedRequests — Pattern B will
    // later replace that with a date-ranged aggregation) plus psaSequences
    // (read by psaEffectiveness). EXCLUDES pages, requests, votes, sequences,
    // viewerSessions, activeViewers, showNotifications.
    @Query(value = "{ 'showToken': ?0 }",
            fields = "{ 'showToken': 1, 'showSubdomain': 1, 'showName': 1, 'showRole': 1, " +
                     "'preferences': 1, 'stats': 1, 'psaSequences': 1 }")
    Optional<Show> findByShowTokenForStats(String showToken);

    // Audience tab: viewerSessions(). Needs ONLY the viewerSessions array —
    // EXCLUDES the multi-MB stats.* arrays entirely (its biggest single win).
    @Query(value = "{ 'showToken': ?0 }",
            fields = "{ 'showToken': 1, 'showSubdomain': 1, 'showName': 1, 'showRole': 1, " +
                     "'preferences': 1, 'viewerSessions': 1 }")
    Optional<Show> findByShowTokenForViewerSessions(String showToken);

    // Live operator poll: dashboardLiveStats(), ~every 5s. Reads stats.jukebox +
    // stats.voting (today's totals), the live operational arrays (activeViewers,
    // viewerSessions, votes, sequences, requests) and heartbeat/version history.
    // EXCLUDES the arrays it never touches: stats.page (the LARGEST stat array —
    // one entry per page view), stats.votingWin, stats.rejectedRequests, the
    // viewer-page HTML (pages), and showNotifications. Exclusion — not inclusion
    // — so a missed live field can't silently break the highest-frequency poll.
    @Query(value = "{ 'showToken': ?0 }",
            fields = "{ 'stats.page': 0, 'stats.votingWin': 0, 'stats.rejectedRequests': 0, " +
                     "'pages': 0, 'showNotifications': 0 }")
    Optional<Show> findByShowTokenForLiveStats(String showToken);

    // PSA-effectiveness config: psaSequences is a small top-level field (NOT a
    // stats array). Load only it (+ identity) so psaEffectiveness can read each
    // PSA's lastPlayed without pulling the multi-MB stats.* arrays — those are
    // fetched per-PSA as ±5-min window slices via StatsRepository.
    @Query(value = "{ 'showToken': ?0 }",
            fields = "{ 'showToken': 1, 'showSubdomain': 1, 'showName': 1, 'showRole': 1, " +
                     "'psaSequences': 1 }")
    Optional<Show> findByShowTokenForPsaConfig(String showToken);

    // signIn projection — same case-insensitive collation lookup as
    // findByEmailCollation, but EXCLUDES the heavy arrays the UI's SIGN_IN
    // query does NOT select: stats (the season's 5–10 MB bulk), viewerSessions,
    // showNotifications, heartbeatGaps, versionChanges. The SIGN_IN-selected
    // arrays (pages, requests, votes, activeViewers, sequences) are KEPT so the
    // login response is byte-identical for the client. Read-only — signIn's
    // bookkeeping is an atomic updateFirst, never a save() of this projection.
    @Query(value = "{ 'email': ?0 }",
            collation = "{ 'locale': 'en', 'strength': 2 }",
            fields = "{ 'stats': 0, 'viewerSessions': 0, 'showNotifications': 0, " +
                     "'heartbeatGaps': 0, 'versionChanges': 0 }")
    Optional<Show> findByEmailCollationForAuth(String email);
}
