package com.remotefalcon.external.api.repository;

import com.remotefalcon.external.api.document.RfpbSession;
import org.springframework.data.mongodb.repository.MongoRepository;

/**
 * Spring Data Mongo repository for {@link RfpbSession}. The {@code _id}
 * is the bearer-hash, so the inherited {@code findById(String)} /
 * {@code save(...)} / {@code deleteById(...)} is the full surface area
 * the session service needs.
 */
public interface RfpbSessionRepository extends MongoRepository<RfpbSession, String> {
}
