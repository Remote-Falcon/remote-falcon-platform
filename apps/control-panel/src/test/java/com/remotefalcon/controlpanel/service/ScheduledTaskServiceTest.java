package com.remotefalcon.controlpanel.service;

import java.time.LocalDateTime;
import java.util.List;

import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.models.NotificationPreference;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.ShowNotification;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * fppHeartbeatTask flood-guard behavior (2026-07-19 enablement):
 * replace-not-append, renotify window (incl. null default), viewer-control
 * gate, recovery clear, and the 24h TTL sweep. The task must NEVER call
 * showRepository.save() — a full-document write from this minute cron can
 * clobber concurrent plugins-api queue updates mid-show.
 */
@ExtendWith(MockitoExtension.class)
class ScheduledTaskServiceTest {

    @Mock private ShowRepository showRepository;
    @Mock private GraphQLMutationService graphQLMutationService;
    @Mock private MongoTemplate mongoTemplate;
    @InjectMocks private ScheduledTaskService service;

    private Show staleShow(NotificationPreference notificationPreference, Boolean viewerControlEnabled) {
        return Show.builder()
                .showToken("token-1")
                .showName("Test Show")
                .lastFppHeartbeat(LocalDateTime.now().minusMinutes(10))
                .preferences(Preference.builder()
                        .viewerControlEnabled(viewerControlEnabled)
                        .notificationPreferences(notificationPreference)
                        .build())
                .build();
    }

    private List<Update> capturedUpdateFirstUpdates() {
        ArgumentCaptor<Update> updates = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, times(2)).updateFirst(any(Query.class), updates.capture(), eq(Show.class));
        return updates.getAllValues();
    }

    @Test
    void notifies_withPullThenPush_neverFullDocSave() {
        Show show = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .build(), true);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        List<Update> updates = capturedUpdateFirstUpdates();
        // First op pulls any existing FPP_HEALTH entry (replace-not-append).
        org.bson.Document pull = updates.get(0).getUpdateObject().get("$pull", org.bson.Document.class);
        assertThat(pull).isNotNull();
        assertThat(pull.get("showNotifications", org.bson.Document.class).getString("notification.type"))
                .isEqualTo("FPP_HEALTH");
        // Second op pushes the fresh entry and stamps the renotify clock.
        org.bson.Document pushOp = updates.get(1).getUpdateObject();
        Object pushed = pushOp.get("$push", org.bson.Document.class).get("showNotifications");
        assertThat(pushed).isInstanceOf(ShowNotification.class);
        ShowNotification sn = (ShowNotification) pushed;
        assertThat(sn.getNotification().getType()).isEqualTo(NotificationType.FPP_HEALTH);
        assertThat(sn.getRead()).isFalse();
        assertThat(pushOp.get("$set", org.bson.Document.class))
                .containsKey("preferences.notificationPreferences.fppHeartbeatLastNotification");
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void suppressed_whenWithinRenotifyWindow() {
        Show show = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .fppHeartbeatLastNotification(LocalDateTime.now().minusMinutes(10))
                .build(), true);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void notifies_whenRenotifyWindowElapsed() {
        Show show = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .fppHeartbeatLastNotification(LocalDateTime.now().minusMinutes(35))
                .build(), true);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        verify(mongoTemplate, times(2)).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void nullRenotifyMinutes_defaultsTo30_insteadOfNPE() {
        // Shows that opted in before the renotify field existed have null here;
        // the pre-enablement code auto-unboxed it and would have thrown.
        Show show = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(null)
                .fppHeartbeatLastNotification(LocalDateTime.now().minusMinutes(10))
                .build(), true);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        // 10 min ago < default 30 → suppressed, and no exception.
        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void suppressed_whenControlGateOnAndViewerControlOff() {
        Show show = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .fppHeartbeatIfControlEnabled(true)
                .build(), false);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void notNPE_whenControlGateOnAndViewerControlNull() {
        // viewerControlEnabled is a nullable Boolean; an unboxed !get() would
        // abort the whole task (and both sweeps) every minute. Null must be
        // treated as "control off" → suppressed, no exception.
        Show show = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .fppHeartbeatIfControlEnabled(true)
                .build(), null);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void renotifyZero_clampedToMinimum_noPerMinuteFlood() {
        // The UI enforces >= 5 client-side only; a crafted GraphQL request can
        // persist 0, which unclamped makes the guard always-false (per-minute
        // re-alerts). Last notification 3 min ago + clamped floor 5 → suppressed.
        Show show = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(0)
                .fppHeartbeatLastNotification(LocalDateTime.now().minusMinutes(3))
                .build(), true);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void uuidIsStablePerOutage_andChangesForNewOutage() {
        // Dismissals are client-side by uuid: the uuid must survive renotify
        // replacements within one outage (dismiss sticks) and change when a
        // new outage begins (bell re-lights). Derived from showToken + the
        // frozen lastFppHeartbeat.
        LocalDateTime outageStart = LocalDateTime.now().minusMinutes(10);
        NotificationPreference prefs = NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(5)
                .build();
        Show show = staleShow(prefs, true);
        show.setLastFppHeartbeat(outageStart);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();
        service.fppHeartbeatTask();

        ArgumentCaptor<Update> updates = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, times(4)).updateFirst(any(Query.class), updates.capture(), eq(Show.class));
        ShowNotification first = (ShowNotification) updates.getAllValues().get(1)
                .getUpdateObject().get("$push", org.bson.Document.class).get("showNotifications");
        ShowNotification second = (ShowNotification) updates.getAllValues().get(3)
                .getUpdateObject().get("$push", org.bson.Document.class).get("showNotifications");
        assertThat(first.getNotification().getUuid()).isEqualTo(second.getNotification().getUuid());

        // New outage: heartbeat froze at a different instant → different uuid.
        show.setLastFppHeartbeat(outageStart.plusHours(2));
        service.fppHeartbeatTask();
        ArgumentCaptor<Update> updates2 = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, times(6)).updateFirst(any(Query.class), updates2.capture(), eq(Show.class));
        ShowNotification third = (ShowNotification) updates2.getAllValues().get(5)
                .getUpdateObject().get("$push", org.bson.Document.class).get("showNotifications");
        assertThat(third.getNotification().getUuid()).isNotEqualTo(first.getNotification().getUuid());
    }

    @Test
    void orphanPurge_isToggleAgnostic() {
        // The nightly sweep must NOT filter on enableFppHeartbeat — its whole
        // purpose is reaping alerts stranded by an opt-out.
        when(mongoTemplate.updateMulti(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(com.mongodb.client.result.UpdateResult.acknowledged(0, 0L, null));
        service.purgeOrphanedFppHealthNotifications();

        ArgumentCaptor<Query> query = ArgumentCaptor.forClass(Query.class);
        verify(mongoTemplate).updateMulti(query.capture(), any(Update.class), eq(Show.class));
        org.bson.Document q = query.getValue().getQueryObject();
        assertThat(q).doesNotContainKey("preferences.notificationPreferences.enableFppHeartbeat");
        assertThat(q.get("showNotifications", org.bson.Document.class)).containsKey("$elemMatch");
    }

    @Test
    void scanUsesRecentOutageWindowBounds() {
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of());

        LocalDateTime before = LocalDateTime.now();
        service.fppHeartbeatTask();
        LocalDateTime after = LocalDateTime.now();

        ArgumentCaptor<LocalDateTime> floor = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<LocalDateTime> cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(showRepository)
                .findFppHeartbeatAlertCandidates(
                        floor.capture(), cutoff.capture());
        assertThat(floor.getValue())
                .isAfterOrEqualTo(before.minusHours(ScheduledTaskService.HEARTBEAT_OUTAGE_WINDOW_HOURS))
                .isBeforeOrEqualTo(after.minusHours(ScheduledTaskService.HEARTBEAT_OUTAGE_WINDOW_HOURS));
        assertThat(cutoff.getValue())
                .isAfterOrEqualTo(before.minusMinutes(ScheduledTaskService.HEARTBEAT_STALE_MINUTES))
                .isBeforeOrEqualTo(after.minusMinutes(ScheduledTaskService.HEARTBEAT_STALE_MINUTES));
    }

    @Test
    void recoveryClearAndTtlSweep_alwaysRun() {
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of());

        service.fppHeartbeatTask();

        ArgumentCaptor<Query> queries = ArgumentCaptor.forClass(Query.class);
        ArgumentCaptor<Update> updates = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, times(2)).updateMulti(queries.capture(), updates.capture(), eq(Show.class));

        // Recovery: fresh heartbeat + outstanding alert → pull + reset renotify clock.
        org.bson.Document recoveryQuery = queries.getAllValues().get(0).getQueryObject();
        org.bson.Document recoveryUpdate = updates.getAllValues().get(0).getUpdateObject();
        assertThat(recoveryQuery)
                .containsKey("preferences.notificationPreferences.enableFppHeartbeat")
                .containsKey("lastFppHeartbeat")
                .containsKey("showNotifications.notification.type");
        assertThat(recoveryUpdate.get("$pull", org.bson.Document.class)
                .get("showNotifications", org.bson.Document.class).getString("notification.type"))
                .isEqualTo("FPP_HEALTH");
        assertThat(recoveryUpdate.get("$unset", org.bson.Document.class))
                .containsKey("preferences.notificationPreferences.fppHeartbeatLastNotification");

        // TTL: entries older than the promised 24h get pulled. The
        // lastFppHeartbeat predicate is load-bearing — it lets the planner use
        // the partial index instead of COLLSCANing every minute.
        org.bson.Document ttlQuery = queries.getAllValues().get(1).getQueryObject();
        org.bson.Document ttlUpdate = updates.getAllValues().get(1).getUpdateObject();
        assertThat(ttlQuery).containsKey("lastFppHeartbeat");
        assertThat(ttlQuery.get("showNotifications", org.bson.Document.class))
                .containsKey("$elemMatch");
        org.bson.Document ttlPull = ttlUpdate.get("$pull", org.bson.Document.class)
                .get("showNotifications", org.bson.Document.class);
        assertThat(ttlPull.getString("notification.type")).isEqualTo("FPP_HEALTH");
        assertThat(ttlPull.get("notification.createdDate", org.bson.Document.class))
                .containsKey("$lt");
    }
}
