package com.remotefalcon.controlpanel.scheduler;

import com.remotefalcon.controlpanel.service.ScheduledTaskService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Cadence and lock wiring of the @Scheduled entry points. Capacity Plan R4
 * split the FPP_HEALTH TTL reaping out of the per-minute heartbeat task into
 * its own hourly job; the per-minute alert/recovery path must keep its cadence
 * because the platform-outage suppression counts minute ticks.
 */
@ExtendWith(MockitoExtension.class)
class ScheduledTaskControllerTest {

    @Mock private ScheduledTaskService scheduledTaskService;
    @Mock private SchedulerLock schedulerLock;
    @InjectMocks private ScheduledTaskController controller;

    private static Duration cronInterval(String method) throws NoSuchMethodException {
        String cron = ScheduledTaskController.class.getMethod(method).getAnnotation(Scheduled.class).cron();
        CronExpression expr = CronExpression.parse(cron);
        LocalDateTime first = expr.next(LocalDateTime.of(2026, 12, 24, 20, 0, 1));
        LocalDateTime second = expr.next(first);
        return Duration.between(first, second);
    }

    @Test
    void heartbeatTask_staysEveryMinute() throws Exception {
        assertThat(cronInterval("runTask")).isEqualTo(Duration.ofMinutes(1));
    }

    @Test
    void ttlSweep_runsHourly() throws Exception {
        assertThat(cronInterval("reapExpiredFppHealthNotifications")).isEqualTo(Duration.ofHours(1));
    }

    @Test
    void ttlSweep_reapsUnderItsOwnLock_withTtlShorterThanTheInterval() {
        when(schedulerLock.tryAcquire(eq("fppHealthTtlSweep"), any(Duration.class))).thenReturn(true);

        controller.reapExpiredFppHealthNotifications();

        ArgumentCaptor<Duration> ttl = ArgumentCaptor.forClass(Duration.class);
        verify(schedulerLock).tryAcquire(eq("fppHealthTtlSweep"), ttl.capture());
        assertThat(ttl.getValue()).isLessThan(Duration.ofHours(1)).isGreaterThan(Duration.ZERO);
        verify(scheduledTaskService).reapExpiredFppHealthNotifications();
        verify(scheduledTaskService, never()).fppHeartbeatTask();
    }

    @Test
    void ttlSweep_skips_whenAnotherReplicaHoldsTheLock() {
        when(schedulerLock.tryAcquire(eq("fppHealthTtlSweep"), any(Duration.class))).thenReturn(false);

        controller.reapExpiredFppHealthNotifications();

        verify(scheduledTaskService, never()).reapExpiredFppHealthNotifications();
    }

    @Test
    void heartbeatTask_doesNotReap() {
        when(schedulerLock.tryAcquire(eq("fppHeartbeatTask"), any(Duration.class))).thenReturn(true);

        controller.runTask();

        verify(scheduledTaskService).fppHeartbeatTask();
        verify(scheduledTaskService, never()).reapExpiredFppHealthNotifications();
    }
}
