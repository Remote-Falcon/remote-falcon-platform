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

    // Case-insensitive email lookup that uses the idx_email_ci index (collation strength=2).
    // Spring Data's derived findByEmailIgnoreCase uses $regex /i which can't use the index.
    @Query(value = "{ 'email': ?0 }", collation = "{ 'locale': 'en', 'strength': 2 }")
    Optional<Show> findByEmailCollation(String email);

    Optional<Show> findByPasswordResetLinkAndPasswordResetExpiryGreaterThan(String passwordResetLink, LocalDateTime passwordResetExpiry);
    List<Show> findByPreferencesNotificationPreferencesEnableFppHeartbeatIsTrueAndLastFppHeartbeatBefore(LocalDateTime lastFppHeartbeat);
    @Query(value = "{ 'showName': { '$regex': ?0, '$options': 'i' } }",
            fields = "{ 'showName': 1 }")
    List<ShowNameOnly> findTop25ByShowNameContainingIgnoreCase(String showName);

    @Query(value = "{ 'preferences.showOnMap' : true }",
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
