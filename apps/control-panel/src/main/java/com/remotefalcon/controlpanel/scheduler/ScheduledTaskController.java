package com.remotefalcon.controlpanel.scheduler;

import com.remotefalcon.controlpanel.service.ScheduledTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScheduledTaskController {
    private final ScheduledTaskService scheduledTaskService;
    private final SchedulerLock schedulerLock;

    // TTLs are shorter than their own cron interval so the next tick can always
    // reclaim, but long enough to cover a normal run. Locks are never released
    // early -- see SchedulerLock: holding for the TTL is what makes a duplicate
    // run within the SAME tick impossible.
    private static final Duration HEARTBEAT_LOCK_TTL = Duration.ofSeconds(50);
    private static final Duration NIGHTLY_LOCK_TTL = Duration.ofMinutes(30);

    /**
     * FPP plugin-health alerting (Account Settings → Notifications toggle).
     * Enabled 2026-07-19 after shipping the flood guards in
     * {@link ScheduledTaskService#fppHeartbeatTask()}: replace-not-append
     * bell entries, clear-on-recovery, 24h TTL, and a 48h recent-outage
     * window (prod had 296 opted-in shows, most dark for the season).
     */
    @Scheduled(cron = "0 * * * * *")
    public void runTask() {
        if (!schedulerLock.tryAcquire("fppHeartbeatTask", HEARTBEAT_LOCK_TTL)) {
            return;
        }
        scheduledTaskService.fppHeartbeatTask();
    }

    /**
     * Nightly 09:00 UTC maintenance: (1) the retention sweep (server-side
     * {@code $pull}s: 18-month stats + viewerSessions windows, 24 h votes
     * expiry), then (2) the document-size / votes-bloat alarm, which runs
     * after the prune so it measures post-retention reality.
     *
     * <p>09:00 UTC is deliberate. The job previously ran at 03:00 UTC, which
     * is 22:00 Eastern — peak viewing hour for US shows in December, and the
     * hour that held 29 of one fortnight's control-panel pod starts. 09:00 UTC
     * is 04:00 ET / 01:00 PT: after the last West Coast show ends, before
     * anything wakes up.
     */
    @Scheduled(cron = "0 0 9 * * ?")
    public void purgeStaleStats() {
        // Still the heaviest job in the service even now that the sweep is
        // server-side: the orphan purge remains a deliberate unindexed pass.
        if (!schedulerLock.tryAcquire("nightlyMaintenance", NIGHTLY_LOCK_TTL)) {
            log.info("Nightly maintenance already claimed by another replica, skipping");
            return;
        }
        scheduledTaskService.purgeStaleStatsForAllShows();
        scheduledTaskService.alarmOnOversizedShows();
        scheduledTaskService.purgeOrphanedFppHealthNotifications();
    }
}
