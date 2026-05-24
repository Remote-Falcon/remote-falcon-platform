package com.remotefalcon.external.api.repository;

import com.remotefalcon.external.api.document.RfpbLaunchJti;
import org.springframework.data.mongodb.repository.MongoRepository;

/**
 * Spring Data Mongo repository for {@link RfpbLaunchJti}. Insert-only —
 * relies on the {@code _id} duplicate-key conflict to detect launch-token
 * replays. {@code save(...)} throws {@code DuplicateKeyException} on
 * collision; {@code RfpbSessionService.exchangeLaunchToken} catches that
 * and translates to a 401.
 */
public interface RfpbLaunchJtiRepository extends MongoRepository<RfpbLaunchJti, String> {
}
