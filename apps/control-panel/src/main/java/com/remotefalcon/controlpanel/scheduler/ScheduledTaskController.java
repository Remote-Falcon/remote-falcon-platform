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
     * Nightly 03:00 UTC maintenance: (1) the 18-month stats retention sweep
     * (streaming cursor, trims stats older than 18 months — replaces the
     * dashboard-mount trigger removed in UI PR #67 / PERF-FIX-PLAN Phase 1), then
     * (2) a document-size alarm that warns on any show approaching Mongo's 16 MB
     * BSON cap (the catch-all safety net for the doc-bloat outage class). The
     * alarm runs after the prune so it measures post-retention sizes.
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void purgeStaleStats() {
        // The heaviest job in the service: the retention sweep streams every
        // show (~2,600 docs averaging ~130 KB) and the orphan purge is a
        // deliberate unindexed pass. Running that once per replica is what put
        // 29 of the last fortnight's control-panel pod starts inside this one
        // UTC hour.
        if (!schedulerLock.tryAcquire("nightlyMaintenance", NIGHTLY_LOCK_TTL)) {
            log.info("Nightly maintenance already claimed by another replica, skipping");
            return;
        }
        scheduledTaskService.purgeStaleStatsForAllShows();
        scheduledTaskService.alarmOnOversizedShows();
        scheduledTaskService.purgeOrphanedFppHealthNotifications();
    }
}
