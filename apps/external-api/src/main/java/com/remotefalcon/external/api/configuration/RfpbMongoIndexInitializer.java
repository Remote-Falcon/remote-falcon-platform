package com.remotefalcon.external.api.configuration;

import com.remotefalcon.external.api.document.RfpbLaunchJti;
import com.remotefalcon.external.api.document.RfpbSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Ensures the production indexes on the RFPB collections exist at startup.
 *
 * <p>The {@code @Indexed(expireAfter = "0")} annotations on
 * {@link RfpbSession#expiresAt} and {@link RfpbLaunchJti#expiresAt} are
 * only honored by Spring Data MongoDB when {@code
 * spring.data.mongodb.auto-index-creation: true} is set on the context —
 * which it isn't here, deliberately, to avoid implicit index management
 * in the rest of the schema. Without an explicit initializer the TTL
 * indexes never get created in prod and both collections grow without
 * bound. Mirrors the {@code MongoIndexInitializer} pattern used in
 * control-panel.
 *
 * <p>Indexes ensured:
 * <ul>
 *   <li>{@code idx_rfpb_sessions_expiresAt} — TTL on {@code expiresAt}
 *       with {@code expireAfterSeconds: 0}; Mongo reaps each row exactly
 *       when its {@code expiresAt} passes. Backs the sliding-window
 *       session expiry contract in {@code RfpbSessionService.refresh}.</li>
 *   <li>{@code idx_rfpb_sessions_showToken_pageId_revokedAt} — compound
 *       on {@code (showToken, pageId, revokedAt)}; backs
 *       {@code RfpbSessionRepository.findByShowTokenAndPageIdAndRevokedAtIsNull},
 *       which is the auto-dedupe lookup on every successful launch.
 *       Without it that query is a collection scan.</li>
 *   <li>{@code idx_rfpb_launch_jtis_expiresAt} — TTL on {@code expiresAt}
 *       with {@code expireAfterSeconds: 0}; Mongo reaps consumed jtis
 *       10 minutes after the launch JWT they protect was issued (5-min
 *       JWT exp + 5-min skew buffer).</li>
 * </ul>
 *
 * <p>Each index is wrapped in try/catch — a single failure (e.g. a
 * pre-existing index of the same name with a different spec) does not
 * prevent the rest from being applied. Failures log at ERROR and are
 * visible at deploy time.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RfpbMongoIndexInitializer {

    private final MongoTemplate mongoTemplate;

    @EventListener(ApplicationReadyEvent.class)
    public void ensureRfpbIndexes() {
        long start = System.currentTimeMillis();

        ensure(RfpbSession.class, "idx_rfpb_sessions_expiresAt",
                new Index()
                        .on("expiresAt", Sort.Direction.ASC)
                        .named("idx_rfpb_sessions_expiresAt")
                        .expire(Duration.ZERO));

        ensure(RfpbSession.class, "idx_rfpb_sessions_showToken_pageId_revokedAt",
                new Index()
                        .on("showToken", Sort.Direction.ASC)
                        .on("pageId", Sort.Direction.ASC)
                        .on("revokedAt", Sort.Direction.ASC)
                        .named("idx_rfpb_sessions_showToken_pageId_revokedAt"));

        ensure(RfpbLaunchJti.class, "idx_rfpb_launch_jtis_expiresAt",
                new Index()
                        .on("expiresAt", Sort.Direction.ASC)
                        .named("idx_rfpb_launch_jtis_expiresAt")
                        .expire(Duration.ZERO));

        log.info("RFPB collection indexes ensured in {} ms",
                System.currentTimeMillis() - start);
    }

    private void ensure(Class<?> entity, String name, Index spec) {
        try {
            mongoTemplate.indexOps(entity).ensureIndex(spec);
            log.info("Ensured RFPB index: {}", name);
        } catch (Exception e) {
            log.error("Failed to ensure RFPB index '{}': {}", name, e.getMessage(), e);
        }
    }
}
