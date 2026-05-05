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
     * Nightly 18-month stats retention sweep at 03:00 UTC.
     * Iterates every show via a streaming cursor and trims stats older than 18
     * months. Replaces the dashboard-mount trigger removed in UI PR #67
     * (PERF-FIX-PLAN Phase 1).
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void purgeStaleStats() {
        scheduledTaskService.purgeStaleStatsForAllShows();
    }
}
