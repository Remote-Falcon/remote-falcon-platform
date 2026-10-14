package com.remotefalcon.controlpanel.service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.Optional;

import com.mongodb.client.model.ReplaceOptions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

/**
 * Remembers the most recent platform-outage cohort detected by
 * {@link ScheduledTaskService#fppHeartbeatTask()}, so that suppression holds
 * while plugins reconnect after the platform recovers.
 *
 * <p>Persisted, not in memory: SchedulerLock gives each minute's tick to
 * whichever replica wins the lock, so a cohort held in one pod's heap would
 * be invisible to the next tick on another pod, and the stragglers would get
 * the very burst this exists to prevent.
 *
 * <p>One document, raw driver, plain {@link Document}: the same reasoning as
 * {@link com.remotefalcon.controlpanel.scheduler.SchedulerLock}. control-panel
 * is a GraalVM native image, and an unmapped Document needs no reflection
 * hints. LocalDateTime is converted at ZoneOffset.UTC in both directions, so
 * the round trip is exact regardless of the pod's zone.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class FppHealthOutageStore {

    static final String COLLECTION = "schedulerState";
    static final String ID = "fppHealthPlatformOutage";

    private final MongoTemplate mongoTemplate;

    /**
     * @param cohortStart     earliest frozen lastFppHeartbeat in the cohort
     * @param cohortEnd       latest frozen lastFppHeartbeat in the cohort
     * @param lastQualifiedAt the last tick at which the cohort still measured
     *                        as a platform outage; recovery grace runs from here
     */
    public record Outage(LocalDateTime cohortStart, LocalDateTime cohortEnd, LocalDateTime lastQualifiedAt) {
    }

    /**
     * Throws on a driver failure. The caller treats that as "cannot tell
     * whether we are mid-outage" and skips the tick rather than guessing.
     */
    public Optional<Outage> load() {
        Document doc = mongoTemplate.getCollection(COLLECTION).find(new Document("_id", ID)).first();
        if (doc == null) {
            return Optional.empty();
        }
        if (!(doc.get("cohortStart") instanceof Date start)
                || !(doc.get("cohortEnd") instanceof Date end)
                || !(doc.get("lastQualifiedAt") instanceof Date qualified)) {
            log.warn("Ignoring malformed {} document in {}", ID, COLLECTION);
            return Optional.empty();
        }
        return Optional.of(new Outage(toLocal(start), toLocal(end), toLocal(qualified)));
    }

    /**
     * Best effort. The suppression decision for the current tick is already
     * made; failing to persist it costs at most one tick of memory, which the
     * next tick re-detects while the outage is still measurable.
     */
    public void save(Outage outage) {
        Document doc = new Document("_id", ID)
                .append("cohortStart", toDate(outage.cohortStart()))
                .append("cohortEnd", toDate(outage.cohortEnd()))
                .append("lastQualifiedAt", toDate(outage.lastQualifiedAt()));
        try {
            mongoTemplate.getCollection(COLLECTION)
                    .replaceOne(new Document("_id", ID), doc, new ReplaceOptions().upsert(true));
        } catch (RuntimeException e) {
            log.warn("Could not persist FPP health outage cohort; suppression for this tick still applied", e);
        }
    }

    private static Date toDate(LocalDateTime value) {
        return Date.from(value.toInstant(ZoneOffset.UTC));
    }

    private static LocalDateTime toLocal(Date value) {
        return LocalDateTime.ofInstant(value.toInstant(), ZoneOffset.UTC);
    }
}
