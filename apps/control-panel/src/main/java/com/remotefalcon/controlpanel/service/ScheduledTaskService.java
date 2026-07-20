package com.remotefalcon.controlpanel.service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.models.NotificationPreference;
import com.remotefalcon.library.models.ShowNotification;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScheduledTaskService {
    private final ShowRepository showRepository;
    private final GraphQLMutationService graphQLMutationService;
    private final MongoTemplate mongoTemplate;

    // Heartbeat considered dropped after this long without a check-in. Matches
    // plugins-api's HEARTBEAT_GAP_THRESHOLD_MINUTES and the dashboard tile.
    static final long HEARTBEAT_STALE_MINUTES = 5L;
    // Only alert on outages that BEGAN recently. Without this floor, enabling
    // the task alerts every opted-in show that's been dark for months (prod
    // audit 2026-07-19: 296 shows opted in, only 63 with a heartbeat in the
    // last 7 days — an instant wave of ~180 useless off-season alerts).
    static final long HEARTBEAT_OUTAGE_WINDOW_HOURS = 48L;
    // Backstop only: an ACTIVE outage refreshes createdDate every renotify, so
    // the TTL never reaps a live alert — it clears entries whose renotifies
    // stopped (control-gate suppression, opt-out remnants).
    static final long FPP_HEALTH_TTL_HOURS = 24L;
    static final int DEFAULT_RENOTIFY_MINUTES = 30;
    // Server-side floor. The Account Settings UI enforces >= 5 client-side
    // only; an unclamped 0 (crafted GraphQL) turns the renotify guard
    // always-false and floods the bell every minute.
    static final int MIN_RENOTIFY_MINUTES = 5;

    private static final Document FPP_HEALTH_PULL =
            new Document("notification.type", NotificationType.FPP_HEALTH.name());

    public void fppHeartbeatTask() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime staleCutoff = now.minusMinutes(HEARTBEAT_STALE_MINUTES);
        LocalDateTime outageWindowFloor = now.minusHours(HEARTBEAT_OUTAGE_WINDOW_HOURS);

        List<Show> showsToNotify = showRepository
                .findFppHeartbeatAlertCandidates(outageWindowFloor, staleCutoff);
        showsToNotify.forEach(show -> {
            NotificationPreference prefs = show.getPreferences().getNotificationPreferences();
            int renotifyMinutes = Math.max(
                    prefs.getFppHeartbeatRenotifyAfterMinutes() != null
                            ? prefs.getFppHeartbeatRenotifyAfterMinutes()
                            : DEFAULT_RENOTIFY_MINUTES,
                    MIN_RENOTIFY_MINUTES);
            boolean shouldSendPush = true;
            if (prefs.getFppHeartbeatLastNotification() != null
                    && prefs.getFppHeartbeatLastNotification().isAfter(now.minusMinutes(renotifyMinutes - 1L))) {
                shouldSendPush = false;
            }
            if (Boolean.TRUE.equals(prefs.getFppHeartbeatIfControlEnabled())
                    && !Boolean.TRUE.equals(show.getPreferences().getViewerControlEnabled())) {
                shouldSendPush = false;
            }
            if (shouldSendPush) {
                long minutesDiff = Duration.between(show.getLastFppHeartbeat(), now).toMinutes();
                Notification notification = Notification.builder()
                        .subject("FPP Plugin Health")
                        .preview("FPP Plugin last checked in " + minutesDiff + " minutes ago")
                        .message("FPP Plugin last checked in " + minutesDiff
                                + " minutes ago. Either the plugin has been stopped or FPPD is not running."
                                + "\n\nThis alert clears automatically when the plugin reconnects.")
                        .build();
                notification.setType(NotificationType.FPP_HEALTH);
                notification.setCreatedDate(now);
                // Outage-stable uuid: derived from showToken + the FROZEN
                // lastFppHeartbeat (it stops moving the moment the plugin
                // dies), so every renotify of the same outage reuses one uuid
                // and a client-side dismissal sticks until recovery. The next
                // outage has a new lastFppHeartbeat → new uuid → bell re-lights.
                notification.setUuid(UUID.nameUUIDFromBytes(
                        (show.getShowToken() + "|" + show.getLastFppHeartbeat())
                                .getBytes(StandardCharsets.UTF_8)).toString());
                ShowNotification showNotification = GraphQLMutationService.toShowNotification(notification);

                // Replace-not-append via targeted updates. A full showRepository.save()
                // here would write back a stale copy of requests/votes mid-show and
                // resurrect consumed queue items — this task fires exactly when shows
                // are live. Two ops because Mongo rejects pull+push on the same array
                // path in a single update (same constraint as heartbeatGaps).
                Query byToken = new Query(Criteria.where("showToken").is(show.getShowToken()));
                mongoTemplate.updateFirst(byToken,
                        new Update().pull("showNotifications", FPP_HEALTH_PULL), Show.class);
                mongoTemplate.updateFirst(byToken,
                        new Update().push("showNotifications", showNotification)
                                .set("preferences.notificationPreferences.fppHeartbeatLastNotification", now),
                        Show.class);
                log.info("Sent FPP heartbeat notification to {}", show.getShowName());
            }
        });

        // Recovery: heartbeat is fresh again but an outage alert is still in the
        // bell — clear it, and reset the renotify clock so the NEXT outage alerts
        // immediately instead of waiting out the previous window. Uses the same
        // partial index as the scan (enableFppHeartbeat=true + lastFppHeartbeat).
        mongoTemplate.updateMulti(
                new Query(Criteria.where("preferences.notificationPreferences.enableFppHeartbeat").is(true)
                        .and("lastFppHeartbeat").gte(staleCutoff)
                        .and("showNotifications.notification.type").is(NotificationType.FPP_HEALTH.name())),
                new Update().pull("showNotifications", FPP_HEALTH_PULL)
                        .unset("preferences.notificationPreferences.fppHeartbeatLastNotification"),
                Show.class);

        // TTL backstop: reap FPP_HEALTH entries whose createdDate stopped
        // refreshing >24h ago (renotifies ceased: control-gate suppression or
        // similar; live outages refresh createdDate every renotify and are
        // never touched). The always-true lastFppHeartbeat range is
        // load-bearing: without a predicate on the partial index's key this
        // query COLLSCANs the whole show collection every minute (measured:
        // 2,594 docs examined on the prod-shaped dev DB). ZoneOffset.UTC
        // matches how DashboardService interprets these zone-naive stored
        // LocalDateTimes — do not use the system default zone here.
        Date ttlCutoff = Date.from(now.minusHours(FPP_HEALTH_TTL_HOURS).toInstant(ZoneOffset.UTC));
        mongoTemplate.updateMulti(
                new Query(Criteria.where("preferences.notificationPreferences.enableFppHeartbeat").is(true)
                        .and("lastFppHeartbeat").lt(now.plusMinutes(1))
                        .and("showNotifications").elemMatch(
                                Criteria.where("notification.type").is(NotificationType.FPP_HEALTH.name())
                                        .and("notification.createdDate").lt(ttlCutoff))),
                new Update().pull("showNotifications",
                        new Document(FPP_HEALTH_PULL)
                                .append("notification.createdDate", new Document("$lt", ttlCutoff))),
                Show.class);
    }

    /**
     * Nightly toggle-agnostic sweep for orphaned FPP_HEALTH entries. The
     * minute-cadence recovery/TTL sweeps require enableFppHeartbeat=true so
     * they can ride the partial index; a show that opts OUT with an alert
     * outstanding escapes both forever (and deleteNotification only targets
     * the separate admin notification collection, so there is no other
     * removal path). One unindexed pass per night is the deliberate price.
     */
    public void purgeOrphanedFppHealthNotifications() {
        Date cutoff = Date.from(LocalDateTime.now().minusHours(FPP_HEALTH_TTL_HOURS).toInstant(ZoneOffset.UTC));
        var result = mongoTemplate.updateMulti(
                new Query(Criteria.where("showNotifications").elemMatch(
                        Criteria.where("notification.type").is(NotificationType.FPP_HEALTH.name())
                                .and("notification.createdDate").lt(cutoff))),
                new Update().pull("showNotifications",
                        new Document(FPP_HEALTH_PULL)
                                .append("notification.createdDate", new Document("$lt", cutoff))),
                Show.class);
        if (result.getModifiedCount() > 0) {
            log.info("Purged orphaned FPP_HEALTH notifications from {} shows", result.getModifiedCount());
        }
    }

    /**
     * Iterates every show via a streaming Mongo cursor and applies the 18-month
     * stats retention policy one document at a time. Uses {@link MongoTemplate#stream}
     * (not {@code findAll}) to avoid materializing the full collection in memory:
     * populated show documents average ~130 KB, so 1000+ shows would otherwise
     * exceed the control-panel pod's 512 Mi memory limit.
     */
    public void purgeStaleStatsForAllShows() {
        int swept = 0;
        int errored = 0;
        long startMillis = System.currentTimeMillis();
        try (Stream<Show> shows = mongoTemplate.stream(new Query(), Show.class)) {
            Iterator<Show> it = shows.iterator();
            while (it.hasNext()) {
                Show show = it.next();
                try {
                    graphQLMutationService.purgeStatsForShow(show);
                    swept++;
                } catch (Exception e) {
                    log.warn("Stats retention sweep failed for show {}: {}",
                            show.getShowToken(), e.getMessage());
                    errored++;
                }
            }
        }
        log.info("Stats retention sweep complete: {} shows processed, {} errored, {} ms",
                swept, errored, System.currentTimeMillis() - startMillis);
    }

    // ~75% of Mongo's hard 16 MB BSON document cap. A Show that crosses 16 MB
    // becomes unreadable AND unwritable (DocumentTooLargeError) — a total outage
    // for that show with no automatic recovery — so we warn well before the cliff.
    static final long DOC_SIZE_WARN_BYTES = 12L * 1024 * 1024;

    /**
     * Catch-all safety net for the 16 MB document-size cliff. Computes each show's
     * BSON size server-side ({@code $bsonSize}) and logs a WARN for any show over
     * {@link #DOC_SIZE_WARN_BYTES}, regardless of which field is the culprit
     * (stats, viewer-page HTML, votes, etc.). The observability layer alerts on this
     * log line. Runs nightly right after the retention sweep so the size reflects
     * the post-prune reality. Read-only and cheap — no document is materialized in
     * the JVM; only {showToken, showSubdomain, bytes} for the few oversized shows.
     */
    public void alarmOnOversizedShows() {
        var pipeline = List.of(
                new Document("$project", new Document("showToken", 1)
                        .append("showSubdomain", 1)
                        .append("bytes", new Document("$bsonSize", "$$ROOT"))),
                new Document("$match", new Document("bytes", new Document("$gt", DOC_SIZE_WARN_BYTES))),
                new Document("$sort", new Document("bytes", -1)));
        int oversized = 0;
        for (Document d : mongoTemplate.getCollection("show").aggregate(pipeline)) {
            long bytes = d.get("bytes") instanceof Number n ? n.longValue() : 0L;
            log.warn("DOC_SIZE_ALARM show '{}' ({}) is {} MB ({}% of the 16 MB MongoDB document cap) — "
                            + "approaching the hard limit; a doc over 16 MB becomes unreadable/unwritable.",
                    d.getString("showSubdomain"), d.getString("showToken"),
                    String.format("%.1f", bytes / 1048576.0),
                    String.format("%.0f", bytes / (16.0 * 1048576) * 100));
            oversized++;
        }
        log.info("Document-size alarm sweep complete: {} show(s) over {} MB",
                oversized, DOC_SIZE_WARN_BYTES / (1024 * 1024));
    }
}
