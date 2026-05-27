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
    // Admin show-name autosuggest. Case-insensitive prefix match on showName,
    // index-backed by idx_showName_ci (collation strength=2). Caller passes
    // PageRequest.of(0, 25) to cap the result set server-side — the result
    // size is bounded regardless of how many shows share the prefix.
    //
    // Returns full Show documents with ONLY the showName field populated
    // (Mongo's `fields` filter does the per-row projection at the DB level,
    // so wire payload is just _id + showName). Used to use a ShowNameOnly
    // interface projection but that fails silently in GraalVM native image;
    // see commit 1537f5e (PR #59) for the projection-failure history.
    //
    // Why prefix-only (^?0): a contains-anywhere regex with $options: 'i'
    // can't use ANY index in MongoDB. Even with a collation index, the
    // engine has to scan every doc because btree indexes can only be
    // walked left-to-right. Anchored prefix matching with collation lets
    // Mongo binary-search to the prefix range and walk forward, which is
    // sub-millisecond for autosuggest payloads. Trade-off accepted: typing
    // "lights" no longer finds "Killarney Lane Lights" — only shows whose
    // name starts with "lights*". Standard autosuggest UX.
    //
    // ^?0 anchors the regex. The collation strength=2 matches idx_showName_ci.
    // Pageable parameter enforces the limit server-side (the old findTop25
    // method-name prefix was being ignored by Spring Data when @Query is set).
    @Query(value = "{ 'showName': { '$regex': '^?0' } }",
            fields = "{ 'showName': 1 }",
            collation = "{ 'locale': 'en', 'strength': 2 }")
    List<Show> findByShowNameStartingWithIgnoreCase(String prefix, Pageable pageable);

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
    
}
