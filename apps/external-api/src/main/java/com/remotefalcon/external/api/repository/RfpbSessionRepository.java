package com.remotefalcon.external.api.repository;

import com.remotefalcon.external.api.document.RfpbSession;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

/**
 * Spring Data Mongo repository for {@link RfpbSession}.
 *
 * <p>{@code _id} is the bearer-hash, so the inherited {@code findById}
 * / {@code save} / {@code deleteById} cover the bulk of operations.
 * The derived query below supports the auto-dedupe-on-launch feature
 * (Decision 7).
 */
public interface RfpbSessionRepository extends MongoRepository<RfpbSession, String> {

    /**
     * All non-revoked sessions for the given show + page. Used by
     * {@code RfpbSessionService.exchangeLaunchToken} to auto-revoke
     * older sessions when a new launch for the same (user, page)
     * arrives — simpler "1 user + 1 page = 1 active session" mental
     * model than letting forgotten tabs pile up.
     *
     * <p>Spring Data derives the query from the method name:
     * {@code revokedAt IS NULL} (still active) {@code AND showToken = ?}
     * {@code AND pageId = ?}.
     */
    List<RfpbSession> findByShowTokenAndPageIdAndRevokedAtIsNull(
            String showToken, String pageId);
}
