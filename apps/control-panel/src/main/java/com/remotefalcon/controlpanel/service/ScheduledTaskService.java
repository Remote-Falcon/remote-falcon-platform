package com.remotefalcon.controlpanel.service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import com.mongodb.client.result.UpdateResult;

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

    /**
     * Renotify cadence for an ongoing outage: the show's own interval, then
     * doubling. With the default 30 that is 5m (the stale threshold, first
     * alert), 30m, 1h, 2h, 4h, 8h, 16h, 32h -- 8 alerts across the 48h window
     * instead of the 96 a fixed 30-minute cadence produced.
     *
     * <p>Why this changed (prod measurement 2026-08-22): ~40 shows were
     * generating ~3,000 alerts/day. Two causes, and the fixed cadence was the
     * bigger one -- 96 notifications about a single unplugged Pi is both
     * useless to the operator and ~192 rewrites of a ~130 KB Show document,
     * since each send is a $pull plus a $push on showNotifications. The other
     * cause was cross-replica duplication, fixed by
     * {@link com.remotefalcon.controlpanel.scheduler.SchedulerLock}.
     *
     * <p>Detection speed is deliberately unchanged: the FIRST alert still
     * fires as soon as the show crosses HEARTBEAT_STALE_MINUTES. Backoff only
     * thins the repeats. A show that lowered its interval to the
     * MIN_RENOTIFY_MINUTES floor still gets faster EARLY alerts (5m, 10m, 20m,
     * 40m ...) -- which is what that setting is for -- without the 279
     * alerts/day one such show was producing.
     *
     * <p>No new persisted state. lastFppHeartbeat freezes the instant a plugin
     * dies (the dedup uuid already depends on that), so outage age is exactly
     * derivable, and the step already alerted for is derivable from the
     * existing fppHeartbeatLastNotification.
     */
    static int backoffStep(long outageMinutes, int renotifyMinutes) {
        // Clamp here as well as at the call site, and not just for tidiness: a
        // persisted 0 (the crafted-GraphQL case MIN_RENOTIFY_MINUTES exists to
        // stop) would make the doubling loop below spin on threshold 0 forever,
        // inside a task that runs every minute. Total function, no bad input.
        int base = Math.max(renotifyMinutes, MIN_RENOTIFY_MINUTES);
        if (outageMinutes < HEARTBEAT_STALE_MINUTES) {
            return -1; // not alertable yet, or the stamp predates this outage
        }
        if (outageMinutes < base) {
            return 0; // the first alert, at the stale threshold
        }
        long windowMinutes = HEARTBEAT_OUTAGE_WINDOW_HOURS * 60L;
        int step = 1;
        long threshold = base;
        while (threshold < windowMinutes && outageMinutes >= threshold * 2L) {
            threshold *= 2L;
            step++;
        }
        return step;
    }

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
            // Exponential backoff keyed on how long THIS outage has run, not on
            // wall-clock since the last send. Both ends are measured from the
            // frozen lastFppHeartbeat, so the step already notified for is
            // recoverable from existing state and no schema field is needed.
            long outageMinutes = Duration.between(show.getLastFppHeartbeat(), now).toMinutes();
            int currentStep = backoffStep(outageMinutes, renotifyMinutes);
            int notifiedStep = -1;
            if (prefs.getFppHeartbeatLastNotification() != null) {
                // Negative when the stamp predates this outage (the plugin
                // recovered and died again) -- backoffStep maps that to -1, so
                // a fresh outage correctly alerts immediately.
                notifiedStep = backoffStep(
                        Duration.between(show.getLastFppHeartbeat(),
                                prefs.getFppHeartbeatLastNotification()).toMinutes(),
                        renotifyMinutes);
            }
            boolean shouldSendPush = currentStep > notifiedStep;
            if (Boolean.TRUE.equals(prefs.getFppHeartbeatIfControlEnabled())
                    && !Boolean.TRUE.equals(show.getPreferences().getViewerControlEnabled())) {
                shouldSendPush = false;
            }
            if (shouldSendPush) {
                long minutesDiff = outageMinutes;
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
                log.info("Sent FPP heartbeat notification to {} (outage {}m, backoff step {})",
                        show.getShowName(), outageMinutes, currentStep);
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

    static final int STATS_RETENTION_MONTHS = 18;
    /**
     * Votes are only meaningful within a single show session (the vote cap is
     * session-anchored by design), so any entry a full day old is stranded.
     * This is the guarantee that the 2026-08-22 whale cannot recur: one show
     * accumulated 6,066 stale systemInjected PSA votes (~3 MB), which made
     * every read AND every read-modify-save() on that document take seconds.
     * The exact leak path is jukebox-mode PSA votes with no plugin consuming;
     * this expiry bounds the array for every show regardless of leak path.
     */
    static final int VOTES_MAX_AGE_HOURS = 24;

    /**
     * Nightly retention, entirely server-side: one {@code updateMulti} whose
     * {@code $pull}s prune every retention-bounded array in place.
     *
     * <p>This replaces a streaming loop that read every show UNPROJECTED
     * (~2,600 docs x ~130 KB = ~340 MB decoded nightly) and wrote each changed
     * show back with a full-document {@code save()} - the exact lost-update
     * hazard every other write path in this service was already converted away
     * from: a request queued or vote cast between that read and write was
     * silently reverted for any show live during the sweep. Server-side pulls
     * move zero documents over the wire and race nothing.
     *
     * <p>Stats/viewerSessions cutoffs use {@code $lt}, which by BSON type
     * bracketing does NOT match a null/missing dateTime - malformed legacy
     * entries are left in place, inert, instead of aborting the sweep. The
     * votes cutoff deliberately inverts that: {@code $not $gte} matches
     * old, null, AND missing lastVoteTime, because a vote without a readable
     * age is exactly the stranded junk the expiry exists to remove.
     *
     * <p>Cutoff conversion uses the system default zone on purpose: Spring
     * Data's Jsr310 write converter stores these zone-naive LocalDateTimes
     * via the system zone, so the read-side condition must mirror it. In the
     * prod pod both are UTC; in local tests both are the developer's zone -
     * symmetric either way.
     */
    public void purgeStaleStatsForAllShows() {
        long startMillis = System.currentTimeMillis();
        Date statsCutoff = Date.from(LocalDateTime.now().minusMonths(STATS_RETENTION_MONTHS)
                .atZone(ZoneId.systemDefault()).toInstant());
        Date votesCutoff = Date.from(LocalDateTime.now().minusHours(VOTES_MAX_AGE_HOURS)
                .atZone(ZoneId.systemDefault()).toInstant());

        Update pulls = new Update()
                .pull("stats.page", new Document("dateTime", new Document("$lt", statsCutoff)))
                .pull("stats.jukebox", new Document("dateTime", new Document("$lt", statsCutoff)))
                .pull("stats.voting", new Document("dateTime", new Document("$lt", statsCutoff)))
                .pull("stats.votingWin", new Document("dateTime", new Document("$lt", statsCutoff)))
                // PRD-013-era arrays that had NO retention anywhere (the
                // ViewerSession javadoc claimed an 18-month trim that was
                // never written - this is that trim, finally real).
                .pull("viewerSessions", new Document("lastSeen", new Document("$lt", statsCutoff)))
                .pull("votes", new Document("lastVoteTime",
                        new Document("$not", new Document("$gte", votesCutoff))));

        UpdateResult result = mongoTemplate.updateMulti(new Query(), pulls, Show.class);
        log.info("Stats retention sweep complete: {} of {} shows modified, {} ms",
                result.getModifiedCount(), result.getMatchedCount(),
                System.currentTimeMillis() - startMillis);
    }

    // ~75% of Mongo's hard 16 MB BSON document cap. A Show that crosses 16 MB
    // becomes unreadable AND unwritable (DocumentTooLargeError) — a total outage
    // for that show with no automatic recovery — so we warn well before the cliff.
    static final long DOC_SIZE_WARN_BYTES = 12L * 1024 * 1024;
    // Independent UX-degradation alarm: the 2026-08-22 whale made every
    // operation on its show take seconds at only ~3 MB, far below the size
    // alarm. Fleet norm for `votes` is one entry per sequence carrying votes
    // (0-6 observed); crossing this means entries are stranding, not voting.
    static final int VOTES_COUNT_ALARM = 1_000;

    // Per-entry BSON size estimates, derived from the model classes' wire
    // encodings (2026-08-22 data-model audit). Vote and Request embed a full
    // Sequence, hence the larger conservative figures.
    private static final Document EST_BYTES_EXPR = estimatedBytesExpression();

    /**
     * Catch-all safety net for the 16 MB document-size cliff, plus a
     * votes-bloat tripwire.
     *
     * <p>The previous implementation measured {@code $bsonSize}, which returns
     * null on DigitalOcean Managed MongoDB 8.0 — so its {@code $match} matched
     * nothing and it logged "0 show(s) over 12 MB" every night unconditionally,
     * including any night a show actually crossed the cliff. This version
     * estimates size from array lengths (times audited per-entry BSON
     * constants) plus the REAL byte length of embedded viewer-page HTML via
     * {@code $strLenBytes} — all operators that work on this cluster.
     *
     * <p>An estimate is the right tool here: the alarm's job is a loud early
     * warning with a named culprit, not an audit-grade byte count. Runs
     * nightly right after the retention sweep so it reflects post-prune
     * reality. Returns the flagged shows so tests can assert on them directly.
     */
    public List<Document> alarmOnOversizedShows() {
        var pipeline = List.of(
                new Document("$project", new Document("showToken", 1)
                        .append("showSubdomain", 1)
                        .append("votesCount", sizeOf("$votes"))
                        .append("estBytes", EST_BYTES_EXPR)),
                new Document("$match", new Document("$or", List.of(
                        new Document("estBytes", new Document("$gt", DOC_SIZE_WARN_BYTES)),
                        new Document("votesCount", new Document("$gt", VOTES_COUNT_ALARM))))),
                new Document("$sort", new Document("estBytes", -1)));
        List<Document> flagged = new ArrayList<>();
        for (Document d : mongoTemplate.getCollection("show").aggregate(pipeline)) {
            long bytes = d.get("estBytes") instanceof Number n ? n.longValue() : 0L;
            int votes = d.get("votesCount") instanceof Number n ? n.intValue() : 0;
            if (bytes > DOC_SIZE_WARN_BYTES) {
                log.warn("DOC_SIZE_ALARM show '{}' ({}) is ~{} MB estimated ({}% of the 16 MB MongoDB "
                                + "document cap) — approaching the hard limit; a doc over 16 MB becomes "
                                + "unreadable/unwritable.",
                        d.getString("showSubdomain"), d.getString("showToken"),
                        String.format("%.1f", bytes / 1048576.0),
                        String.format("%.0f", bytes / (16.0 * 1048576) * 100));
            } else {
                log.warn("DOC_SIZE_ALARM show '{}' ({}) has {} votes entries (fleet norm 0-6) — "
                                + "stale votes are stranding; every operation on this show slows "
                                + "with each one. See the votes expiry in the retention sweep.",
                        d.getString("showSubdomain"), d.getString("showToken"), votes);
            }
            flagged.add(d);
        }
        log.info("Document-size alarm sweep complete: {} show(s) flagged (est > {} MB or votes > {})",
                flagged.size(), DOC_SIZE_WARN_BYTES / (1024 * 1024), VOTES_COUNT_ALARM);
        return flagged;
    }

    /** {@code $size} with an {@code $ifNull} guard — {@code $size} on a missing field errors. */
    private static Document sizeOf(String fieldRef) {
        return new Document("$size", new Document("$ifNull", List.of(fieldRef, List.of())));
    }

    private static Document weighted(String fieldRef, int bytesPerEntry) {
        return new Document("$multiply", List.of(sizeOf(fieldRef), bytesPerEntry));
    }

    private static Document estimatedBytesExpression() {
        // Viewer-page HTML is the one field where a count is useless (a page is
        // 1 byte to 1 MB), so measure it for real: sum of $strLenBytes over
        // pages[].html.
        Document pagesBytes = new Document("$sum", new Document("$map",
                new Document("input", new Document("$ifNull", List.of("$pages", List.of())))
                        .append("as", "p")
                        .append("in", new Document("$strLenBytes",
                                new Document("$ifNull", List.of("$$p.html", ""))))));
        return new Document("$add", List.of(
                pagesBytes,
                weighted("$stats.page", 103),
                weighted("$stats.jukebox", 109),
                weighted("$stats.voting", 109),
                weighted("$stats.votingWin", 69),
                weighted("$stats.rejectedRequests", 138),
                weighted("$viewerSessions", 159),
                weighted("$activeViewers", 115),
                weighted("$votes", 500),
                weighted("$requests", 400),
                weighted("$sequences", 332),
                weighted("$showNotifications", 600),
                // Fixed slack for scalars, preferences, and estimate error.
                65_536));
    }
}
