package com.remotefalcon.controlpanel.scheduler;

import com.remotefalcon.controlpanel.service.ScheduledTaskService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ScheduledTaskController {
    private final ScheduledTaskService scheduledTaskService;

    @Scheduled(cron = "0 * * * * *")
    public void runTask() {
        // scheduledTaskService.fppHeartbeatTask();
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
        scheduledTaskService.purgeStaleStatsForAllShows();
        scheduledTaskService.alarmOnOversizedShows();
    }
}
