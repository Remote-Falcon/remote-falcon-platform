package com.remotefalcon.controlpanel.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Stream;

import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.NotificationType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScheduledTaskService {
    private final ShowRepository showRepository;
    private final GraphQLMutationService graphQLMutationService;
    private final MongoTemplate mongoTemplate;

    public void fppHeartbeatTask() {
        List<Show> showsToNotify = showRepository.findByPreferencesNotificationPreferencesEnableFppHeartbeatIsTrueAndLastFppHeartbeatBefore(LocalDateTime.now().minusMinutes(5));
        showsToNotify.forEach(show -> {
            boolean shouldSendPush = true;
            if(show.getPreferences().getNotificationPreferences().getFppHeartbeatLastNotification() != null
                    && show.getPreferences().getNotificationPreferences().getFppHeartbeatLastNotification()
                    .isAfter(LocalDateTime.now().minusMinutes(show.getPreferences().getNotificationPreferences().getFppHeartbeatRenotifyAfterMinutes() - 1))) {
                shouldSendPush = false;
            }
            if(show.getPreferences().getNotificationPreferences().getFppHeartbeatIfControlEnabled() != null
                    && (show.getPreferences().getNotificationPreferences().getFppHeartbeatIfControlEnabled() && !show.getPreferences().getViewerControlEnabled())) {
                shouldSendPush = false;
            }
            if(shouldSendPush) {
                long minutesDiff = Duration.between(show.getLastFppHeartbeat(), LocalDateTime.now()).toMinutes();
                String subject = "FPP Plugin Health";
                String preview = "FPP Plugin last checked in " + minutesDiff + " minutes ago";
                String notificationBody = "FPP Plugin last checked in " + minutesDiff + " minutes ago. Either the plugin has been stopped or FPPD is not running.\n\nThis notification will be deleted after 24 hours.";

                graphQLMutationService.buildShowNotification(Notification.builder().subject(subject).preview(preview).message(notificationBody).build(), show, NotificationType.FPP_HEALTH);

                show.getPreferences().getNotificationPreferences().setFppHeartbeatLastNotification(LocalDateTime.now());

                this.showRepository.save(show);
                log.info("Sent FPP heartbeat notification to {}", show.getShowName());
            }
        });
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
