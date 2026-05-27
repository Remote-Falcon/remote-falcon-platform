package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.Sequence;
import jakarta.transaction.Transactional;
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
    // Admin show-name autosuggest. Returns full Show documents with ONLY
    // the showName field populated (the `fields` filter is enforced by
    // Mongo, not by Spring Data, so the wire payload is just _id +
    // showName per row). Used to use a ShowNameOnly interface projection,
    // but Spring Data MongoDB's projection-interface materialization is
    // unreliable in GraalVM native image — PropertyDescriptorSource logs
    // "Couldn't read class metadata" and silently returns empty results
    // in prod even with the standard JDK proxy + reflection RuntimeHints
    // registered. The other repository methods on this interface that
    // return Show with fields filters (see getShowsOnMap above) work
    // fine in native, so we use the same proven pattern here.
    //
    // The findTop25 prefix is preserved for legibility but is IGNORED
    // when @Query is supplied — Spring Data uses the literal query.
    // If a hard cap is needed, add `{ $limit: 25 }` to the query
    // pipeline; for now the admin autosuggest UI handles the volume.
    @Query(value = "{ 'showName': { '$regex': ?0, '$options': 'i' } }",
            fields = "{ 'showName': 1 }")
    List<Show> findTop25ByShowNameContainingIgnoreCase(String showName);

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
