package com.remotefalcon.controlpanel.scheduler;

import com.mongodb.ErrorCategory;
import com.mongodb.MongoWriteException;
import com.mongodb.client.model.UpdateOptions;
import com.mongodb.client.result.UpdateResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * Cross-replica mutual exclusion for the @Scheduled tasks.
 *
 * <p>Every control-panel replica runs its own Spring scheduler, and there was
 * no coordination between them. Measured in prod 2026-08-22: ~40 shows were
 * emitting ~3,000 FPP heartbeat alerts/day at an average gap of 16.7 minutes
 * against a configured 30-minute renotify window — the flood guard is a
 * read-modify-write on {@code fppHeartbeatLastNotification}, so two replicas
 * firing in the same minute both read a stale timestamp and both send. Each
 * send is two {@code updateFirst} ops that rewrite a ~130 KB Show document,
 * and the nightly 03:00 sweep (which streams the whole show collection) ran
 * once per replica too. It self-amplified: load raised CPU, the HPA scaled
 * 2 -> 4, and the extra replicas multiplied the duplicated work.
 *
 * <p>Deliberately hand-rolled rather than ShedLock. control-panel ships as a
 * GraalVM native image ({@code mvn -Pnative}), where ShedLock's
 * {@code @SchedulerLock} AOP proxying needs reflection hints to survive the
 * closed-world build — the same class of build-time-stripping trap that took
 * image hosting down platform-wide. This uses the raw driver with a plain
 * {@link Document}: no proxies, no mapped entity, nothing to register.
 *
 * <p>The algorithm is one atomic round trip:
 * <ol>
 *   <li>{@code updateOne} filtered on {@code _id} AND an already-expired
 *       {@code lockedUntil}, with {@code upsert: true}.</li>
 *   <li>No document yet — the upsert inserts it and this replica wins.</li>
 *   <li>An expired lock — the filter matches, the update lands, this replica
 *       wins.</li>
 *   <li>A live lock held by someone else — the filter does NOT match, so the
 *       upsert attempts an INSERT and collides with the unique {@code _id}
 *       index. That duplicate-key error IS the mutual exclusion, not a
 *       failure, so it is swallowed and reported as "lost".</li>
 * </ol>
 *
 * <p>Locks are never released explicitly; they lapse when {@code lockedUntil}
 * passes. That is what makes a duplicate run in the SAME tick impossible even
 * when the task finishes in milliseconds, and it means a replica that is
 * OOM-killed mid-task cannot wedge the schedule — the next tick after the TTL
 * simply reclaims it. Callers pick a TTL shorter than their own cron interval.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SchedulerLock {

    static final String COLLECTION = "schedulerLock";

    /** k8s sets HOSTNAME to the pod name; only ever used for debugging. */
    private static final String OWNER =
            System.getenv("HOSTNAME") != null ? System.getenv("HOSTNAME") : "unknown";

    private final MongoTemplate mongoTemplate;

    /**
     * Attempt to claim {@code name} for {@code ttl}.
     *
     * @return true if this replica owns the lock and must run the task; false
     *         if another replica already holds it, or if the lock store itself
     *         is unreachable. Failing closed is deliberate: skipping one tick
     *         of a periodic task is strictly cheaper than the stampede this
     *         class exists to prevent.
     */
    public boolean tryAcquire(String name, Duration ttl) {
        Instant now = Instant.now();
        Document filter = new Document("_id", name)
                .append("lockedUntil", new Document("$lte", Date.from(now)));
        Document update = new Document("$set", new Document()
                .append("lockedUntil", Date.from(now.plus(ttl)))
                .append("owner", OWNER)
                .append("acquiredAt", Date.from(now)));
        try {
            UpdateResult result = mongoTemplate.getCollection(COLLECTION)
                    .updateOne(filter, update, new UpdateOptions().upsert(true));
            return result.getUpsertedId() != null || result.getModifiedCount() > 0;
        } catch (MongoWriteException e) {
            if (e.getError().getCategory() == ErrorCategory.DUPLICATE_KEY) {
                // Expected: another replica holds a live lock.
                return false;
            }
            log.warn("Scheduler lock '{}' write failed, skipping this tick", name, e);
            return false;
        } catch (RuntimeException e) {
            log.warn("Scheduler lock '{}' unavailable, skipping this tick", name, e);
            return false;
        }
    }
}
