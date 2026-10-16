package com.remotefalcon.controlpanel.service;

import java.time.LocalDateTime;
import java.util.ArrayList;
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
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * fppHeartbeatTask flood-guard behavior (2026-07-19 enablement):
 * replace-not-append, exponential renotify backoff (incl. null default and
 * the zero clamp), viewer-control gate, recovery clear, and the 24h TTL
 * sweep (hourly since Capacity Plan R4, its own method). The task must NEVER call showRepository.save() — a full-document
 * write from this minute cron can clobber concurrent plugins-api queue
 * updates mid-show.
 *
 * <p>The renotify guard changed from a fixed window to backoff on 2026-08-22
 * after prod measurement showed ~40 shows emitting ~3,000 alerts/day. Volume
 * is now asserted directly in {@code backoff_*} below, because that is the
 * property that regressed unnoticed for five weeks — no assertion existed on
 * how MANY notifications an outage produces, only on whether a given pair of
 * timestamps sent one.
 */
@ExtendWith(MockitoExtension.class)
class ScheduledTaskServiceTest {

    @Mock private ShowRepository showRepository;
    @Mock private MongoTemplate mongoTemplate;
    @Mock private FppHealthOutageStore outageStore;
    @InjectMocks private ScheduledTaskService service;

    private Show staleShow(NotificationPreference notificationPreference, Boolean viewerControlEnabled) {
        return staleShow(notificationPreference, viewerControlEnabled, 10L);
    }

    /**
     * Outage age is now load-bearing: the renotify decision is a function of
     * how long THIS outage has run, so a fixture's lastFppHeartbeat and its
     * fppHeartbeatLastNotification have to be mutually consistent.
     */
    private Show staleShow(NotificationPreference notificationPreference, Boolean viewerControlEnabled,
                           long heartbeatAgeMinutes) {
        return Show.builder()
                .showToken("token-1")
                .showName("Test Show")
                .lastFppHeartbeat(LocalDateTime.now().minusMinutes(heartbeatAgeMinutes))
                .preferences(Preference.builder()
                        .viewerControlEnabled(viewerControlEnabled)
                        .notificationPreferences(notificationPreference)
                        .build())
                .build();
    }

    /**
     * Stamp "already alerted N minutes into THIS outage", derived from the
     * show's own frozen lastFppHeartbeat. Building the two from separate
     * LocalDateTime.now() calls silently truncates the gap by the microseconds
     * between them, which flips a 5-minute stamp to 4 and reads as a stamp
     * from a previous outage.
     */
    private Show alertedAtOutageAge(Show show, long outageAgeMinutes) {
        show.getPreferences().getNotificationPreferences()
                .setFppHeartbeatLastNotification(show.getLastFppHeartbeat().plusMinutes(outageAgeMinutes));
        return show;
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
    void suppressed_whenStillOnTheSameBackoffStep() {
        // 10-minute outage, already alerted at the 5-minute stale mark. Both
        // sit on step 0 (the next step for a 30-minute interval is 30m), so
        // nothing is due. Previously the fixture stamped the notification at
        // the same instant the heartbeat froze, which cannot happen -- the
        // stale gate means the earliest possible alert is 5 minutes in.
        Show show = alertedAtOutageAge(staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .build(), true), 5L);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void notifies_whenBackoffStepAdvances() {
        // 35-minute outage, last alerted at its 5-minute mark: step 0 -> step 1
        // (the 30-minute threshold) is due.
        Show show = alertedAtOutageAge(staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .build(), true, 35L), 5L);
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of(show));

        service.fppHeartbeatTask();

        verify(mongoTemplate, times(2)).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void nullRenotifyMinutes_defaultsTo30_insteadOfNPE() {
        // Shows that opted in before the renotify field existed have null here;
        // the pre-enablement code auto-unboxed it and would have thrown.
        Show show = alertedAtOutageAge(staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(null)
                .build(), true), 5L);
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
        // persist 0. Unclamped that is now worse than a flood: the backoff
        // ladder doubles from the interval, so a 0 base would spin forever.
        // Clamped to 5, a 6-minute outage alerted at its 5-minute mark is
        // still on step 1 → suppressed.
        Show show = alertedAtOutageAge(staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(0)
                .build(), true, 6L), 5L);
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
        LocalDateTime outageStart = LocalDateTime.now().minusHours(3);
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
    void recoveryClear_stillRunsEveryMinute() {
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of());

        service.fppHeartbeatTask();

        ArgumentCaptor<Query> queries = ArgumentCaptor.forClass(Query.class);
        ArgumentCaptor<Update> updates = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, times(1)).updateMulti(queries.capture(), updates.capture(), eq(Show.class));

        // Recovery: fresh heartbeat + outstanding alert → pull + reset renotify clock.
        org.bson.Document recoveryQuery = queries.getValue().getQueryObject();
        org.bson.Document recoveryUpdate = updates.getValue().getUpdateObject();
        assertThat(recoveryQuery)
                .containsKey("preferences.notificationPreferences.enableFppHeartbeat")
                .containsKey("lastFppHeartbeat")
                .containsKey("showNotifications.notification.type");
        assertThat(recoveryUpdate.get("$pull", org.bson.Document.class)
                .get("showNotifications", org.bson.Document.class).getString("notification.type"))
                .isEqualTo("FPP_HEALTH");
        assertThat(recoveryUpdate.get("$unset", org.bson.Document.class))
                .containsKey("preferences.notificationPreferences.fppHeartbeatLastNotification");
    }

    @Test
    void minuteTask_noLongerRunsTheTtlSweep() {
        // Capacity Plan R4: the TTL sweep FETCHes every opted-in doc (dark
        // shows included) and was ~36 MB/min of cache churn on the prod DB.
        // It now runs hourly in reapExpiredFppHealthNotifications().
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(List.of());

        service.fppHeartbeatTask();

        ArgumentCaptor<Query> queries = ArgumentCaptor.forClass(Query.class);
        ArgumentCaptor<Update> updates = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, org.mockito.Mockito.atLeast(0))
                .updateMulti(queries.capture(), updates.capture(), eq(Show.class));
        for (Query q : queries.getAllValues()) {
            assertThat(q.getQueryObject()).doesNotContainKey("showNotifications");
        }
        for (Update u : updates.getAllValues()) {
            org.bson.Document pull = u.getUpdateObject().get("$pull", org.bson.Document.class);
            if (pull != null) {
                assertThat(pull.get("showNotifications", org.bson.Document.class))
                        .doesNotContainKey("notification.createdDate");
            }
        }
    }

    @Test
    void ttlSweep_reapsFppHealthEntriesOlderThan24h() {
        when(mongoTemplate.updateMulti(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(com.mongodb.client.result.UpdateResult.acknowledged(3, 3L, null));

        java.util.Date before = java.util.Date.from(LocalDateTime.now()
                .minusHours(ScheduledTaskService.FPP_HEALTH_TTL_HOURS).toInstant(java.time.ZoneOffset.UTC));
        service.reapExpiredFppHealthNotifications();
        java.util.Date after = java.util.Date.from(LocalDateTime.now()
                .minusHours(ScheduledTaskService.FPP_HEALTH_TTL_HOURS).toInstant(java.time.ZoneOffset.UTC));

        ArgumentCaptor<Query> query = ArgumentCaptor.forClass(Query.class);
        ArgumentCaptor<Update> update = ArgumentCaptor.forClass(Update.class);
        verify(mongoTemplate, times(1)).updateMulti(query.capture(), update.capture(), eq(Show.class));

        // The lastFppHeartbeat predicate is load-bearing: it lets the planner
        // use the partial index instead of COLLSCANing the show collection.
        org.bson.Document ttlQuery = query.getValue().getQueryObject();
        assertThat(ttlQuery)
                .containsKey("preferences.notificationPreferences.enableFppHeartbeat")
                .containsKey("lastFppHeartbeat");
        assertThat(ttlQuery.get("showNotifications", org.bson.Document.class))
                .containsKey("$elemMatch");
        org.bson.Document ttlPull = update.getValue().getUpdateObject().get("$pull", org.bson.Document.class)
                .get("showNotifications", org.bson.Document.class);
        assertThat(ttlPull.getString("notification.type")).isEqualTo("FPP_HEALTH");
        java.util.Date cutoff = (java.util.Date) ttlPull.get("notification.createdDate", org.bson.Document.class)
                .get("$lt");
        assertThat(cutoff).isBetween(before, after, true, true);
        // Never a full-document write.
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void ttlSweep_dbUnreachable_doesNotThrow() {
        when(mongoTemplate.updateMulti(any(Query.class), any(Update.class), eq(Show.class)))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("timeout"));

        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> service.reapExpiredFppHealthNotifications());
    }

    // ---- backoff ladder -------------------------------------------------
    // These assert alert VOLUME per outage, which is what actually caused the
    // incident. A per-pair send/suppress test cannot catch a cadence that is
    // individually correct at every step but ruinous in aggregate.

    @Test
    void backoff_defaultInterval_yieldsEightAlertsAcrossA48hOutage() {
        assertThat(alertsAcrossOutage(30)).isEqualTo(8);
    }

    @Test
    void backoff_atTheMinimumInterval_staysBounded() {
        // The show that was generating 279 alerts/day sat at this floor. Fast
        // early alerts are preserved; the sustained rate is not.
        assertThat(alertsAcrossOutage(5)).isEqualTo(10);
    }

    @Test
    void backoff_firstAlertStillFiresAtTheStaleThreshold() {
        // Detection speed must not regress: nothing before 5 minutes, and an
        // alert due the moment the stale gate opens.
        assertThat(ScheduledTaskService.backoffStep(4, 30)).isEqualTo(-1);
        assertThat(ScheduledTaskService.backoffStep(5, 30)).isEqualTo(0);
    }

    @Test
    void backoff_treatsAStampFromAPriorOutageAsNeverNotified() {
        // lastFppHeartbeat moves forward when a plugin recovers, so a stale
        // fppHeartbeatLastNotification yields a negative age. That must read as
        // "not yet alerted for this outage", not as a suppression.
        assertThat(ScheduledTaskService.backoffStep(-25, 30)).isEqualTo(-1);
    }

    @Test
    void backoff_clampsZeroInterval_andTerminates() {
        // Guards the doubling loop: an unclamped 0 base never advances the
        // threshold and hangs the every-minute scheduler.
        assertTimeoutPreemptively(java.time.Duration.ofSeconds(2), () ->
                assertThat(ScheduledTaskService.backoffStep(600, 0))
                        .isEqualTo(ScheduledTaskService.backoffStep(600, 5)));
    }

    // ---- platform-outage suppression (P1-7) ------------------------------
    // A plugins-api or DB outage freezes every live plugin's lastFppHeartbeat
    // within one ~30s heartbeat interval. Without suppression, 5 minutes later
    // every opted-in show gets "your plugin is down", which is false and turns
    // one platform incident into hundreds of support tickets.

    /**
     * {@code count} opted-in shows whose plugins all froze within the same
     * ~30s heartbeat interval, {@code frozenMinutesAgo} minutes ago. Never
     * alerted for this outage.
     */
    private List<Show> cohort(int count, long frozenMinutesAgo) {
        LocalDateTime frozeAt = LocalDateTime.now().minusMinutes(frozenMinutesAgo);
        List<Show> shows = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            shows.add(Show.builder()
                    .showToken("cohort-" + i)
                    .showName("Cohort Show " + i)
                    .lastFppHeartbeat(frozeAt.minusSeconds(i % 30))
                    .preferences(Preference.builder()
                            .viewerControlEnabled(true)
                            .notificationPreferences(NotificationPreference.builder()
                                    .enableFppHeartbeat(true)
                                    .fppHeartbeatRenotifyAfterMinutes(30)
                                    .build())
                            .build())
                    .build());
        }
        return shows;
    }

    private void healthyShowsNow(long healthy) {
        when(mongoTemplate.count(any(Query.class), eq(Show.class))).thenReturn(healthy);
    }

    private void candidates(List<Show> shows) {
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(shows);
    }

    private List<String> pushedTokens() {
        ArgumentCaptor<Query> queries = ArgumentCaptor.forClass(Query.class);
        verify(mongoTemplate, org.mockito.Mockito.atLeast(0))
                .updateFirst(queries.capture(), any(Update.class), eq(Show.class));
        return queries.getAllValues().stream()
                .map(q -> q.getQueryObject().getString("showToken"))
                .distinct()
                .toList();
    }

    @Test
    void massStale_isTreatedAsPlatformOutage_noPushes() {
        // 40 opted-in shows froze inside one heartbeat interval and nothing
        // else is heartbeating: that is the platform, not 40 Pis.
        candidates(cohort(40, 6L));
        healthyShowsNow(0L);

        service.fppHeartbeatTask();

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
        // The cohort is remembered so recovery can hold it through reconnects.
        ArgumentCaptor<FppHealthOutageStore.Outage> saved =
                ArgumentCaptor.forClass(FppHealthOutageStore.Outage.class);
        verify(outageStore).save(saved.capture());
        assertThat(saved.getValue().cohortStart()).isBeforeOrEqualTo(saved.getValue().cohortEnd());
        assertThat(saved.getValue().lastQualifiedAt()).isAfter(LocalDateTime.now().minusMinutes(1));
        // The recovery sweep still runs during an outage (TTL reaping is hourly now).
        verify(mongoTemplate, times(1)).updateMulti(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void clusteredStale_inAHealthyFleet_stillNotifies() {
        // 12 shows dropping together is above the absolute floor, but against
        // 500 healthy plugins it is 2.3% -- a real correlated loss (a regional
        // ISP), not the platform. Everyone is told.
        candidates(cohort(12, 6L));
        healthyShowsNow(500L);

        service.fppHeartbeatTask();

        assertThat(pushedTokens()).hasSize(12);
        verify(outageStore, never()).save(any());
    }

    @Test
    void isolatedStale_stillNotifies_withoutTouchingTheOutageMachinery() {
        candidates(cohort(1, 6L));

        service.fppHeartbeatTask();

        assertThat(pushedTokens()).containsExactly("cohort-0");
        // Below the absolute floor there is nothing to measure: no extra
        // count query on the every-minute path.
        verify(mongoTemplate, never()).count(any(Query.class), eq(Show.class));
        verify(outageStore, never()).save(any());
    }

    @Test
    void showThatDiedBeforeTheOutage_stillNotifiesDuringIt() {
        List<Show> shows = new ArrayList<>(cohort(40, 6L));
        Show genuinelyDown = staleShow(NotificationPreference.builder()
                .enableFppHeartbeat(true)
                .fppHeartbeatRenotifyAfterMinutes(30)
                .build(), true, 180L);
        genuinelyDown.setShowToken("dead-before-outage");
        shows.add(genuinelyDown);
        candidates(shows);
        healthyShowsNow(0L);

        service.fppHeartbeatTask();

        assertThat(pushedTokens()).containsExactly("dead-before-outage");
    }

    @Test
    void recovery_withinGrace_stragglersAreStillSuppressed() {
        // Platform came back 2 minutes ago; 37 of 40 plugins reconnected, 3
        // are still mid-reconnect. On its own 3 stale shows is nothing, but
        // they froze inside the remembered outage cohort: no burst.
        List<Show> stragglers = cohort(3, 40L);
        LocalDateTime frozeAt = stragglers.get(0).getLastFppHeartbeat();
        when(outageStore.load()).thenReturn(java.util.Optional.of(new FppHealthOutageStore.Outage(
                frozeAt.minusSeconds(30), frozeAt, LocalDateTime.now().minusMinutes(2))));
        candidates(stragglers);

        service.fppHeartbeatTask();

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void recovery_afterGrace_stragglerIsAlertedExactlyOnce_thenLadderResumes() {
        List<Show> stragglers = cohort(3, 40L);
        LocalDateTime frozeAt = stragglers.get(0).getLastFppHeartbeat();
        when(outageStore.load()).thenReturn(java.util.Optional.of(new FppHealthOutageStore.Outage(
                frozeAt.minusSeconds(30), frozeAt,
                LocalDateTime.now().minusMinutes(ScheduledTaskService.OUTAGE_RECOVERY_GRACE_MINUTES + 1))));
        candidates(stragglers);

        service.fppHeartbeatTask();
        assertThat(pushedTokens()).hasSize(3);
        verify(mongoTemplate, times(6)).updateFirst(any(Query.class), any(Update.class), eq(Show.class));

        // Next tick: the push stamped fppHeartbeatLastNotification, exactly as
        // any first alert does. Same backoff step, so nothing more is due.
        stragglers.forEach(s -> s.getPreferences().getNotificationPreferences()
                .setFppHeartbeatLastNotification(LocalDateTime.now()));
        service.fppHeartbeatTask();
        verify(mongoTemplate, times(6)).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void suppressionIsBoundedInTime_soAPersistentClusterIsEventuallyAlerted() {
        // A cluster that never comes back (a regional power cut in a small
        // off-season fleet) must not be silenced until the 48h floor.
        candidates(cohort(40, ScheduledTaskService.OUTAGE_MAX_SUPPRESSION_MINUTES + 1));
        healthyShowsNow(0L);

        service.fppHeartbeatTask();

        assertThat(pushedTokens()).hasSize(40);
    }

    @Test
    void dbUnreachable_onTheScan_skipsTheTickInsteadOfThrowing() {
        when(showRepository.findFppHeartbeatAlertCandidates(
                any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("timeout"));

        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> service.fppHeartbeatTask());

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
        verify(mongoTemplate, never()).updateMulti(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void dbUnreachable_onTheHealthyCount_isNotReadAsEveryoneStale() {
        // A failed count must not become "0 healthy" (=> 100% stale => a
        // platform outage) nor "unknown, so alert everyone". Skip the tick.
        candidates(cohort(40, 6L));
        when(mongoTemplate.count(any(Query.class), eq(Show.class)))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("timeout"));

        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> service.fppHeartbeatTask());

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
        verify(outageStore, never()).save(any());
    }

    @Test
    void outageStoreUnreachable_onLoad_skipsTheTick() {
        candidates(cohort(3, 40L));
        when(outageStore.load()).thenThrow(new com.mongodb.MongoTimeoutException("timeout"));

        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> service.fppHeartbeatTask());

        verify(mongoTemplate, never()).updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    // detectOutageCohort thresholds, at the boundaries.

    private static List<LocalDateTime> frozenTogether(int count, LocalDateTime at) {
        List<LocalDateTime> out = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            out.add(at.minusSeconds(i));
        }
        return out;
    }

    @Test
    void detect_qualifiesAtExactlyTheFloorAndThePercentage() {
        LocalDateTime t = LocalDateTime.now().minusMinutes(10);
        // 10 of (10 + 30 healthy) = 25%
        assertThat(ScheduledTaskService.detectOutageCohort(frozenTogether(10, t), 30L)).isPresent();
    }

    @Test
    void detect_justBelowThePercentage_doesNotQualify() {
        LocalDateTime t = LocalDateTime.now().minusMinutes(10);
        // 10 of 41 = 24.4%
        assertThat(ScheduledTaskService.detectOutageCohort(frozenTogether(10, t), 31L)).isEmpty();
    }

    @Test
    void detect_belowTheAbsoluteFloor_doesNotQualifyEvenAt100Percent() {
        LocalDateTime t = LocalDateTime.now().minusMinutes(10);
        assertThat(ScheduledTaskService.detectOutageCohort(frozenTogether(9, t), 0L)).isEmpty();
    }

    @Test
    void detect_cohortExcludesShowsThatFrozeOutsideTheWindow() {
        LocalDateTime t = LocalDateTime.now().minusMinutes(60);
        List<LocalDateTime> stale = new ArrayList<>(frozenTogether(20, t));
        LocalDateTime earlier = t.minusMinutes(ScheduledTaskService.OUTAGE_COHORT_WINDOW_MINUTES + 5);
        LocalDateTime later = t.plusMinutes(ScheduledTaskService.OUTAGE_COHORT_WINDOW_MINUTES + 5);
        stale.add(earlier);
        stale.add(later);

        var cohort = ScheduledTaskService.detectOutageCohort(stale, 0L).orElseThrow();

        assertThat(cohort.start()).isAfter(earlier);
        assertThat(cohort.end()).isBefore(later);
        assertThat(cohort.staleShows()).isEqualTo(20);
    }

    @Test
    void detect_twoSeparateClusters_returnsOnlyTheLatest_neverBridgingTheGap() {
        // An older qualifying cluster and a newer one, with a show that went
        // dark on its own in between. The window must not span the gap.
        LocalDateTime old = LocalDateTime.now().minusHours(20);
        LocalDateTime recent = LocalDateTime.now().minusMinutes(15);
        LocalDateTime organic = LocalDateTime.now().minusMinutes(45);
        List<LocalDateTime> stale = new ArrayList<>(frozenTogether(12, old));
        stale.addAll(frozenTogether(12, recent));
        stale.add(organic);

        var cohort = ScheduledTaskService.detectOutageCohort(stale, 0L).orElseThrow();

        assertThat(cohort.start()).isAfter(organic);
        assertThat(cohort.staleShows()).isEqualTo(12);
    }

    @Test
    void detect_denominatorCountsShowsThatWereHealthyAtTheCohortStart() {
        // 10 froze together; 31 more froze LATER (so were healthy when the 10
        // froze). 10 of 41 is below 25% even though healthyNow is 0.
        LocalDateTime t = LocalDateTime.now().minusHours(3);
        List<LocalDateTime> stale = new ArrayList<>(frozenTogether(10, t));
        for (int i = 0; i < 31; i++) {
            stale.add(t.plusMinutes(30L + i * 3L));
        }
        assertThat(ScheduledTaskService.detectOutageCohort(stale, 0L)).isEmpty();
    }

    /** One alert per step transition, walking a 48h outage minute by minute. */
    private int alertsAcrossOutage(int renotifyMinutes) {
        int alerts = 0;
        int previousStep = -1;
        for (long minute = 0; minute <= ScheduledTaskService.HEARTBEAT_OUTAGE_WINDOW_HOURS * 60L; minute++) {
            int step = ScheduledTaskService.backoffStep(minute, renotifyMinutes);
            if (step > previousStep) {
                alerts++;
                previousStep = step;
            }
        }
        return alerts;
    }
}
