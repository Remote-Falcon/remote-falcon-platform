package com.remotefalcon.external.api.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * One row per consumed launch JWT, used to detect replays. Created when
 * a launch token is successfully exchanged at {@code POST /v1/sessions/
 * exchange} — the jti claim becomes the {@code _id}.
 *
 * <p>Replay detection works via Mongo's duplicate-key on insert: a second
 * exchange attempt with the same jti throws {@code DuplicateKeyException}
 * which {@code RfpbSessionService.exchangeLaunchToken} translates into a
 * 401. Launch tokens are single-use, period.
 *
 * <p>TTL = 10 minutes via the {@code @Indexed(expireAfter)} below. The
 * launch token itself expires in 5 minutes (see control-panel's
 * {@code rfpb.launch.ttl-seconds}); the dedupe row stays around for an
 * extra 5 minutes as a buffer to catch any clock-skew replays just past
 * the JWT's own exp.
 */
@Document(collection = "rfpb_launch_jtis")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RfpbLaunchJti {

    /** The jti claim verbatim. UUID string per the signer's convention. */
    @Id
    private String jti;

    private Instant consumedAt;

    /**
     * TTL trigger. 10-minute window catches replay attempts past the JWT's
     * own 5-minute exp without bloating the collection indefinitely.
     */
    @Indexed(expireAfter = "0")
    private Instant expiresAt;
}
