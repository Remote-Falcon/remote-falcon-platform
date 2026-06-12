package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.repository.StatsRepository;
import com.remotefalcon.controlpanel.request.DownloadStatsToExcelRequest;
import com.remotefalcon.controlpanel.response.dashboard.DashboardHourlyStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.DashboardLiveStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.DashboardStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse;
import com.remotefalcon.controlpanel.response.dashboard.RequestConversionResponse;
import com.remotefalcon.controlpanel.response.dashboard.ViewerSessionsResponse;
import com.remotefalcon.controlpanel.response.dashboard.WrappedSummaryResponse;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.ExcelUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.ActiveViewer;
import com.remotefalcon.library.models.HeartbeatGap;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.VersionChange;
import com.remotefalcon.library.models.ViewerSession;
import com.remotefalcon.library.models.Vote;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link DashboardService}. Each test exercises one of the
 * aggregation entry points with a small, hand-crafted Show document so we
 * can assert on the produced totals, bucket counts, and ordering rules
 * without standing up Mongo. The auth util is mocked to short-circuit JWT
 * decoding; the wrapped-summary rate limiter is exercised indirectly.
 */
@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    private static final String SHOW_TOKEN = "tok-dash";
    private static final String TZ = "America/Chicago";
    private static final ZoneId TZ_ID = ZoneId.of(TZ);

    @Mock private AuthUtil jwtUtil;
    @Mock private ExcelUtil excelUtil;
    @Mock private ShowRepository showRepository;
    @Mock private StatsRepository statsRepository;
    @Mock private ClientUtil clientUtil;

    @InjectMocks private DashboardService service;

    // ---- helpers ----

    private static long ms(int y, int mo, int d) {
        return ZonedDateTime.of(y, mo, d, 0, 0, 0, 0, TZ_ID).toInstant().toEpochMilli();
    }

    private static LocalDateTime at(int y, int mo, int d, int h, int min) {
        // Stat times are stored as wall-clock LocalDateTime in the user's tz.
        return LocalDateTime.of(y, mo, d, h, min);
    }

    private void stubAuth(String token) {
        when(jwtUtil.getJwtPayload()).thenReturn(TokenDTO.builder().showToken(token).build());
    }

    // ---- dashboardStats — full aggregation across all 7 sections ----

    @Test
    void dashboardStats_aggregatesPageJukeboxVotingWin_acrossRange() {
        Stat stats = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("1.1.1.1").dateTime(at(2025, 10, 15, 19, 0)).build(),
                        Stat.Page.builder().ip("1.1.1.1").dateTime(at(2025, 10, 15, 20, 0)).build(),
                        Stat.Page.builder().ip("2.2.2.2").dateTime(at(2025, 10, 15, 21, 0)).build(),
                        Stat.Page.builder().ip("3.3.3.3").dateTime(at(2025, 10, 16, 18, 0)).build())))
                .jukebox(new ArrayList<>(List.of(
                        Stat.Jukebox.builder().name("Carol").dateTime(at(2025, 10, 15, 19, 5)).build(),
                        Stat.Jukebox.builder().name("Carol").dateTime(at(2025, 10, 15, 19, 10)).build(),
                        Stat.Jukebox.builder().name("Wizards").dateTime(at(2025, 10, 16, 18, 5)).build())))
                .voting(new ArrayList<>(List.of(
                        Stat.Voting.builder().name("Carol").dateTime(at(2025, 10, 15, 19, 1)).build())))
                .votingWin(new ArrayList<>(List.of(
                        Stat.VotingWin.builder().name("Carol").total(1).dateTime(at(2025, 10, 15, 23, 59)).build())))
                .build();
        stubAuth(SHOW_TOKEN);
        when(statsRepository.hasStatsByShowToken(SHOW_TOKEN)).thenReturn(true);
        when(statsRepository.pageStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getPage());
        when(statsRepository.jukeboxStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getJukebox());
        when(statsRepository.votingStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getVoting());
        when(statsRepository.votingWinStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getVotingWin());

        DashboardStatsResponse resp = service.dashboardStats(ms(2025, 10, 14), ms(2025, 10, 17), TZ);

        // Page stats: two dates in range (the 15th and 16th)
        assertThat(resp.getPage()).hasSizeGreaterThanOrEqualTo(2);

        // Jukebox by sequence: Carol 2, Wizards 1 — Carol first (desc by total)
        assertThat(resp.getJukeboxBySequence().getSequences()).extracting("name")
                .containsExactly("Carol", "Wizards");
        assertThat(resp.getJukeboxBySequence().getSequences()).extracting("total")
                .containsExactly(2, 1);

        // Voting by sequence: Carol = 1
        assertThat(resp.getVotingBySequence().getSequences()).extracting("name").containsExactly("Carol");
        // Voting win by sequence: Carol = 1
        assertThat(resp.getVotingWinBySequence().getSequences()).extracting("name").containsExactly("Carol");
    }

    @Test
    void dashboardStats_throwsShowNotFound_whenMissing() {
        stubAuth(SHOW_TOKEN);
        when(statsRepository.hasStatsByShowToken(SHOW_TOKEN)).thenReturn(false);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(false);

        assertThatThrownBy(() -> service.dashboardStats(ms(2025, 1, 1), ms(2025, 12, 31), TZ))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void dashboardStats_handlesNullStats_returnsEmptyBuckets() {
        stubAuth(SHOW_TOKEN);
        // Show exists but has no stats document -> empty buckets, not SHOW_NOT_FOUND.
        when(statsRepository.hasStatsByShowToken(SHOW_TOKEN)).thenReturn(false);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(true);

        DashboardStatsResponse resp = service.dashboardStats(ms(2025, 1, 1), ms(2025, 1, 7), TZ);

        assertThat(resp.getPage()).isEmpty();
        assertThat(resp.getJukeboxByDate()).isEmpty();
        assertThat(resp.getJukeboxBySequence().getSequences()).isEmpty();
        assertThat(resp.getVotingByDate()).isEmpty();
        assertThat(resp.getVotingBySequence().getSequences()).isEmpty();
        assertThat(resp.getVotingWinByDate()).isEmpty();
        assertThat(resp.getVotingWinBySequence().getSequences()).isEmpty();
    }

    @Test
    void dashboardStats_statsPresentButSubArraysEmpty_returnsGapFilledEmptyBuckets() {
        // Legacy/partial doc: the stats document exists but a sub-array is absent,
        // so StatsRepository returns empty lists. The OLD full-document path NPE'd
        // here; the NEW path returns 200 with gap-filled zero-total day buckets
        // (by-date) and empty sequence lists (by-sequence).
        stubAuth(SHOW_TOKEN);
        when(statsRepository.hasStatsByShowToken(SHOW_TOKEN)).thenReturn(true);
        // The four *InRange methods are left unstubbed -> Mockito returns empty lists.

        DashboardStatsResponse resp = service.dashboardStats(ms(2025, 10, 14), ms(2025, 10, 17), TZ);

        assertThat(resp.getPage()).isNotEmpty();
        assertThat(resp.getPage()).allSatisfy(s -> assertThat(s.getTotal()).isZero());
        assertThat(resp.getJukeboxBySequence().getSequences()).isEmpty();
        assertThat(resp.getVotingBySequence().getSequences()).isEmpty();
        assertThat(resp.getVotingWinBySequence().getSequences()).isEmpty();
    }

    @Test
    void dashboardStats_toleratesNullDateTimeElements_droppingThem() {
        // A null-dateTime element must not NPE the resolver; the build* helpers'
        // null guard drops it (mirroring the Mongo $match) and keeps well-formed rows.
        stubAuth(SHOW_TOKEN);
        when(statsRepository.hasStatsByShowToken(SHOW_TOKEN)).thenReturn(true);
        when(statsRepository.pageStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(List.of(
                Stat.Page.builder().ip("good").dateTime(at(2025, 10, 15, 19, 0)).build(),
                Stat.Page.builder().ip("null-dt").build()));

        DashboardStatsResponse resp = service.dashboardStats(ms(2025, 10, 14), ms(2025, 10, 17), TZ);

        int totalPage = resp.getPage().stream().mapToInt(s -> s.getTotal()).sum();
        assertThat(totalPage).as("null-dateTime element dropped, well-formed element kept").isEqualTo(1);
    }

    // ---- requestConversion ----

    @Test
    void requestConversion_computesAcceptedRejectedConversionRate_andRejectionBucketsSortedDesc() {
        Stat stats = Stat.builder()
                .jukebox(new ArrayList<>(List.of(
                        Stat.Jukebox.builder().name("a").dateTime(at(2025, 10, 15, 18, 0)).build(),
                        Stat.Jukebox.builder().name("b").dateTime(at(2025, 10, 15, 19, 0)).build(),
                        Stat.Jukebox.builder().name("c").dateTime(at(2025, 10, 16, 19, 0)).build())))
                .rejectedRequests(new ArrayList<>(List.of(
                        Stat.RejectedRequest.builder().reason("BLOCKED").dateTime(at(2025, 10, 15, 18, 5)).build(),
                        Stat.RejectedRequest.builder().reason("BLOCKED").dateTime(at(2025, 10, 15, 18, 6)).build(),
                        Stat.RejectedRequest.builder().reason("LIMIT").dateTime(at(2025, 10, 15, 19, 0)).build())))
                .build();
        stubAuth(SHOW_TOKEN);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(true);
        when(statsRepository.jukeboxStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getJukebox());
        when(statsRepository.rejectedRequestsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getRejectedRequests());

        RequestConversionResponse resp = service.requestConversion(ms(2025, 10, 14), ms(2025, 10, 17), TZ);

        assertThat(resp.getAccepted()).isEqualTo(3);
        assertThat(resp.getRejected()).isEqualTo(3);
        assertThat(resp.getAttempted()).isEqualTo(6);
        assertThat(resp.getConversionRate()).isEqualTo(0.5);
        // BLOCKED (2) comes before LIMIT (1).
        assertThat(resp.getRejectionsByReason()).extracting("reason").containsExactly("BLOCKED", "LIMIT");
        assertThat(resp.getRejectionsByReason()).extracting("count").containsExactly(2, 1);
    }

    @Test
    void requestConversion_nullStats_returnsZerosAndNullRate() {
        stubAuth(SHOW_TOKEN);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(true);
        // jukebox/rejected *InRange unstubbed -> empty lists -> zeros, null rate.

        RequestConversionResponse r = service.requestConversion(ms(2025, 1, 1), ms(2025, 1, 7), TZ);

        assertThat(r.getAccepted()).isZero();
        assertThat(r.getRejected()).isZero();
        assertThat(r.getAttempted()).isZero();
        assertThat(r.getConversionRate()).isNull();
        assertThat(r.getRejectionsByReason()).isEmpty();
    }

    @Test
    void requestConversion_throws_whenShowMissing() {
        stubAuth(SHOW_TOKEN);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(false);

        assertThatThrownBy(() -> service.requestConversion(0L, 1L, TZ))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void requestConversion_unknownReason_bucketsAsUnknown() {
        Stat stats = Stat.builder()
                .jukebox(new ArrayList<>())
                .rejectedRequests(new ArrayList<>(List.of(
                        Stat.RejectedRequest.builder().reason(null).dateTime(at(2025, 10, 15, 18, 0)).build())))
                .build();
        stubAuth(SHOW_TOKEN);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(true);
        when(statsRepository.rejectedRequestsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getRejectedRequests());

        RequestConversionResponse r = service.requestConversion(ms(2025, 10, 14), ms(2025, 10, 17), TZ);

        assertThat(r.getRejectionsByReason()).extracting("reason").containsExactly("UNKNOWN");
    }

    // ---- psaEffectiveness ----

    @Test
    void psaEffectiveness_returnsEmptyList_whenShowHasNoPsaSequences() {
        Show show = Show.builder().showToken(SHOW_TOKEN).psaSequences(null).build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForPsaConfig(SHOW_TOKEN)).thenReturn(Optional.of(show));

        PsaEffectivenessResponse r = service.psaEffectiveness(TZ);
        assertThat(r.getPsaPlays()).isEmpty();
    }

    @Test
    void psaEffectiveness_psaWithoutLastPlayed_isStillReturnedWithZeros() {
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .psaSequences(List.of(PsaSequence.builder().name("psa-unplayed").lastPlayed(null).build()))
                .stats(Stat.builder()
                        .page(new ArrayList<>()).jukebox(new ArrayList<>())
                        .voting(new ArrayList<>()).votingWin(new ArrayList<>())
                        .build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForPsaConfig(SHOW_TOKEN)).thenReturn(Optional.of(show));

        PsaEffectivenessResponse r = service.psaEffectiveness(TZ);
        assertThat(r.getPsaPlays()).hasSize(1);
        PsaEffectivenessResponse.PsaPlay play = r.getPsaPlays().get(0);
        assertThat(play.getName()).isEqualTo("psa-unplayed");
        assertThat(play.getLastPlayedMs()).isNull();
        assertThat(play.getViewersAround()).isZero();
        assertThat(play.getRequestsBefore()).isZero();
        assertThat(play.getRequestsAfter()).isZero();
    }

    @Test
    void psaEffectiveness_countsViewersAround_andRequestsBeforeAfter() {
        LocalDateTime lp = at(2025, 10, 15, 19, 30);
        Stat stats = Stat.builder()
                .page(new ArrayList<>(List.of(
                        // Inside ±5 min window, two distinct IPs.
                        Stat.Page.builder().ip("a").dateTime(lp.minusMinutes(2)).build(),
                        Stat.Page.builder().ip("a").dateTime(lp.plusMinutes(1)).build(), // dup
                        Stat.Page.builder().ip("b").dateTime(lp.plusMinutes(3)).build(),
                        // Outside window.
                        Stat.Page.builder().ip("c").dateTime(lp.plusMinutes(10)).build())))
                .jukebox(new ArrayList<>(List.of(
                        Stat.Jukebox.builder().name("x").dateTime(lp.minusMinutes(1)).build(),
                        Stat.Jukebox.builder().name("y").dateTime(lp.minusMinutes(3)).build(),
                        Stat.Jukebox.builder().name("z").dateTime(lp.plusMinutes(2)).build())))
                .build();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .psaSequences(List.of(PsaSequence.builder().name("p").lastPlayed(lp).build()))
                .stats(stats)
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForPsaConfig(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(statsRepository.pageStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getPage());
        when(statsRepository.jukeboxStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getJukebox());

        PsaEffectivenessResponse r = service.psaEffectiveness(TZ);
        PsaEffectivenessResponse.PsaPlay play = r.getPsaPlays().get(0);
        assertThat(play.getViewersAround()).isEqualTo(2);
        assertThat(play.getRequestsBefore()).isEqualTo(2);
        assertThat(play.getRequestsAfter()).isEqualTo(1);
        assertThat(play.getLastPlayedMs()).isEqualTo(lp.toInstant(ZoneOffset.UTC).toEpochMilli());
    }

    @Test
    void psaEffectiveness_sortsMostRecentFirst_nullsLast() {
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .psaSequences(List.of(
                        PsaSequence.builder().name("older").lastPlayed(at(2025, 10, 1, 0, 0)).build(),
                        PsaSequence.builder().name("never").lastPlayed(null).build(),
                        PsaSequence.builder().name("newest").lastPlayed(at(2025, 10, 31, 0, 0)).build()))
                .stats(Stat.builder()
                        .page(new ArrayList<>()).jukebox(new ArrayList<>())
                        .voting(new ArrayList<>()).votingWin(new ArrayList<>())
                        .build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForPsaConfig(SHOW_TOKEN)).thenReturn(Optional.of(show));

        PsaEffectivenessResponse r = service.psaEffectiveness(TZ);
        assertThat(r.getPsaPlays()).extracting("name").containsExactly("newest", "older", "never");
    }

    @Test
    void psaEffectiveness_throws_whenShowMissing() {
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForPsaConfig(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.psaEffectiveness(TZ))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- viewerSessions ----

    @Test
    void viewerSessions_returnsEmptySession_whenShowHasNoSessions() {
        Show show = Show.builder().showToken(SHOW_TOKEN).viewerSessions(null).build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForViewerSessions(SHOW_TOKEN)).thenReturn(Optional.of(show));

        ViewerSessionsResponse r = service.viewerSessions(ms(2025, 10, 1), ms(2025, 10, 31), TZ);
        assertThat(r.getSessions()).isEmpty();
    }

    @Test
    void viewerSessions_hashesIpAndComputesDuration_andFiltersToRange() {
        ViewerSession inRange = ViewerSession.builder()
                .ip("1.2.3.4").viewerId("v1")
                .firstSeen(at(2025, 10, 15, 19, 0))
                .lastSeen(at(2025, 10, 15, 19, 30))
                .nightDate(LocalDate.of(2025, 10, 15))
                .eventCount(10)
                .build();
        ViewerSession outOfRange = ViewerSession.builder()
                .ip("9.9.9.9").viewerId("v2")
                .firstSeen(at(2024, 6, 1, 12, 0))
                .lastSeen(at(2024, 6, 1, 12, 5))
                .build();
        Show show = Show.builder().showToken(SHOW_TOKEN).showSubdomain("sub")
                .viewerSessions(new ArrayList<>(List.of(inRange, outOfRange))).build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForViewerSessions(SHOW_TOKEN)).thenReturn(Optional.of(show));

        ViewerSessionsResponse r = service.viewerSessions(ms(2025, 10, 14), ms(2025, 10, 16), TZ);

        assertThat(r.getSessions()).hasSize(1);
        ViewerSessionsResponse.Session s = r.getSessions().get(0);
        assertThat(s.getViewerId()).isEqualTo("v1");
        // Hashed IP — opaque 16 hex chars, NOT the raw IP.
        assertThat(s.getIpHash()).hasSize(16).matches("^[0-9a-f]+$");
        assertThat(s.getIpHash()).isNotEqualTo("1.2.3.4");
        assertThat(s.getDurationSeconds()).isEqualTo(30 * 60);
        assertThat(s.getEventCount()).isEqualTo(10);
    }

    @Test
    void viewerSessions_throws_whenShowMissing() {
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForViewerSessions(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.viewerSessions(0L, 1L, TZ))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- dashboardStatsByHour ----

    @Test
    void dashboardStatsByHour_groupsByDateAndHour_dedupesIpsForUnique() {
        Stat stats = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("a").dateTime(at(2025, 10, 15, 19, 1)).build(),
                        Stat.Page.builder().ip("a").dateTime(at(2025, 10, 15, 19, 2)).build(),
                        Stat.Page.builder().ip("b").dateTime(at(2025, 10, 15, 19, 5)).build(),
                        Stat.Page.builder().ip("c").dateTime(at(2025, 10, 15, 20, 0)).build())))
                .build();
        stubAuth(SHOW_TOKEN);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(true);
        when(statsRepository.pageStatsInRange(eq(SHOW_TOKEN), any(), any())).thenReturn(stats.getPage());

        DashboardHourlyStatsResponse r = service.dashboardStatsByHour(ms(2025, 10, 14), ms(2025, 10, 16), TZ);

        // Two buckets: hour 19 with total=3,unique=2; hour 20 with total=1,unique=1
        assertThat(r.getBuckets()).hasSize(2);
        DashboardHourlyStatsResponse.Bucket b19 = r.getBuckets().stream().filter(b -> b.getHour() == 19).findFirst().orElseThrow();
        DashboardHourlyStatsResponse.Bucket b20 = r.getBuckets().stream().filter(b -> b.getHour() == 20).findFirst().orElseThrow();
        assertThat(b19.getTotal()).isEqualTo(3);
        assertThat(b19.getUnique()).isEqualTo(2);
        assertThat(b20.getTotal()).isEqualTo(1);
        assertThat(b20.getUnique()).isEqualTo(1);
    }

    @Test
    void dashboardStatsByHour_nullStats_returnsEmptyBuckets() {
        stubAuth(SHOW_TOKEN);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(true);
        // pageStatsInRange unstubbed -> empty list -> no buckets.

        DashboardHourlyStatsResponse r = service.dashboardStatsByHour(ms(2025, 1, 1), ms(2025, 1, 7), TZ);
        assertThat(r.getBuckets()).isEmpty();
    }

    @Test
    void dashboardStatsByHour_throws_whenShowMissing() {
        stubAuth(SHOW_TOKEN);
        when(statsRepository.existsByShowToken(SHOW_TOKEN)).thenReturn(false);
        assertThatThrownBy(() -> service.dashboardStatsByHour(0L, 1L, TZ))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- dashboardLiveStats ----

    @Test
    void dashboardLiveStats_returnsActiveViewerCount_andDwellAndHeartbeatGapsAndVersions() {
        // The "tonight" window in the service is computed against the user's
        // tz (TZ_ID): today 00:00 in TZ_ID to +1 day. A viewer-session's
        // firstSeen.atZone(TZ_ID) must fall inside that window. We pick a
        // wall-clock time that is unambiguously "today" in TZ_ID by reading
        // ZonedDateTime.now(TZ_ID). The active-viewer cutoff, by contrast,
        // uses raw LocalDateTime.now() (JVM-local) — so we keep that branch
        // exercised by spreading visit timestamps close to JVM-now.
        LocalDateTime jvmNow = LocalDateTime.now();
        // For the session test we want a wall-clock TZ_ID timestamp that's
        // safely inside today (start-of-day .. start-of-tomorrow). Use today
        // 12:00 in TZ_ID — far from midnight on either side.
        LocalDateTime tzNow = ZonedDateTime.now(TZ_ID).toLocalDate().atTime(12, 0);
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>(List.of(
                        Request.builder().sequence(Sequence.builder().name("r").displayName("R").build())
                                .position(1).build())))
                .votes(new ArrayList<>(List.of(Vote.builder().votes(3).build(), Vote.builder().votes(5).build())))
                .sequences(new ArrayList<>(List.of(Sequence.builder().name("now-seq").displayName("Now Seq").build())))
                .playingNow("now-seq")
                .playingNext("")
                .playingNextFromSchedule("")
                .stats(Stat.builder()
                        .jukebox(new ArrayList<>())
                        .voting(new ArrayList<>()).build())
                .activeViewers(new ArrayList<>(List.of(
                        ActiveViewer.builder().ipAddress("a").visitDateTime(jvmNow.minusMinutes(1)).build(),
                        ActiveViewer.builder().ipAddress("a").visitDateTime(jvmNow.minusMinutes(2)).build(),
                        ActiveViewer.builder().viewerId("vid1").visitDateTime(jvmNow.minusMinutes(3)).build(),
                        ActiveViewer.builder().ipAddress("stale").visitDateTime(jvmNow.minusMinutes(30)).build())))
                .viewerSessions(new ArrayList<>(List.of(
                        ViewerSession.builder().ip("p").firstSeen(tzNow.minusMinutes(20)).lastSeen(tzNow.minusMinutes(10)).build())))
                .lastFppHeartbeat(jvmNow.minusMinutes(2))
                .heartbeatGaps(new ArrayList<>(List.of(
                        HeartbeatGap.builder().startedAt(jvmNow.minusHours(2)).endedAt(jvmNow.minusHours(1)).build())))
                .versionChanges(new ArrayList<>(List.of(
                        VersionChange.builder().at(jvmNow.minusDays(1)).pluginVersion("1.0").fppVersion("8.0").build(),
                        VersionChange.builder().at(jvmNow.minusDays(3)).pluginVersion("0.9").fppVersion("7.0").build())))
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.of(show));

        DashboardLiveStatsResponse r = service.dashboardLiveStats(0L, 0L, TZ);

        assertThat(r.getCurrentRequests()).isEqualTo(1);
        assertThat(r.getCurrentVotes()).isEqualTo(8);
        assertThat(r.getPlayingNow()).isEqualTo("Now Seq");
        // a + vid1 == 2 unique live identities, stale viewer excluded
        assertThat(r.getCurrentViewers()).isEqualTo(2);
        // Tonight session was 10 minutes
        assertThat(r.getMedianDwellSecondsTonight()).isEqualTo(10 * 60L);
        // Heartbeat fields surface
        assertThat(r.getLastHeartbeatMs()).isNotNull();
        assertThat(r.getHeartbeatGaps()).hasSize(1);
        // Versions sorted desc by atMs (newest first)
        assertThat(r.getVersionChanges()).hasSize(2);
        assertThat(r.getVersionChanges().get(0).getPluginVersion()).isEqualTo("1.0");
        assertThat(r.getVersionChanges().get(1).getPluginVersion()).isEqualTo("0.9");
    }

    @Test
    void dashboardLiveStats_throws_whenShowMissing() {
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.dashboardLiveStats(0L, 0L, TZ))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void dashboardLiveStats_playingNext_fallsBackToScheduled_whenNoRequests() {
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>())
                .votes(new ArrayList<>())
                .sequences(new ArrayList<>(List.of(
                        Sequence.builder().name("sched").displayName("Sched Display").build())))
                .playingNow("")
                .playingNext("")
                .playingNextFromSchedule("sched")
                .stats(Stat.builder().jukebox(new ArrayList<>()).voting(new ArrayList<>()).build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.of(show));

        DashboardLiveStatsResponse r = service.dashboardLiveStats(0L, 0L, TZ);
        assertThat(r.getPlayingNext()).isEqualTo("Sched Display");
    }

    // ---- PSA-v2 PR-4: queue-depth + NEXT_PLAYLIST predicate rollout ----

    @Test
    void dashboardLiveStats_currentRequests_excludesPsaSequences() {
        // PSA-v2 Q3: the operator's "current requests" tile must match the
        // viewer-facing jukeboxDepth cap, which now excludes PSAs/leaders.
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>(List.of(
                        Request.builder().position(1).sequence(Sequence.builder().name("PSA1").build()).build(),
                        Request.builder().position(2).sequence(Sequence.builder().name("Song1").build()).build(),
                        Request.builder().position(3).sequence(Sequence.builder().name("Song2").build()).build())))
                .votes(new ArrayList<>())
                .sequences(new ArrayList<>())
                .psaSequences(new ArrayList<>(List.of(
                        PsaSequence.builder().name("PSA1").build())))
                .playingNow("")
                .playingNext("")
                .playingNextFromSchedule("")
                .stats(Stat.builder().jukebox(new ArrayList<>()).voting(new ArrayList<>()).build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.of(show));

        DashboardLiveStatsResponse r = service.dashboardLiveStats(0L, 0L, TZ);
        // PSA1 is excluded; 2 viewer requests counted.
        assertThat(r.getCurrentRequests()).isEqualTo(2);
    }

    @Test
    void dashboardLiveStats_currentRequests_excludesLeaderSequences() {
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>(List.of(
                        Request.builder().position(1).sequence(Sequence.builder().name("ReqLeader").build()).build(),
                        Request.builder().position(2).sequence(Sequence.builder().name("Song1").build()).build())))
                .votes(new ArrayList<>())
                .sequences(new ArrayList<>())
                .psaSequences(new ArrayList<>())
                .requestLeaderSequence("ReqLeader")
                .playingNow("")
                .playingNext("")
                .playingNextFromSchedule("")
                .stats(Stat.builder().jukebox(new ArrayList<>()).voting(new ArrayList<>()).build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.of(show));

        DashboardLiveStatsResponse r = service.dashboardLiveStats(0L, 0L, TZ);
        assertThat(r.getCurrentRequests()).isEqualTo(1);
    }

    @Test
    void dashboardLiveStats_playingNext_returnsPsaAtFront_ofRequestQueue() {
        // Operator dashboard must surface the *actual* next item, including
        // PSAs. The viewer's NEXT_PLAYLIST filters PSAs (viewer service); the
        // operator's tile does not. The PSA chip on NowPlayingCard tags it
        // visually.
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>(List.of(
                        Request.builder().position(1).sequence(Sequence.builder().name("PSA1").displayName("PSA1 Display").build()).build(),
                        Request.builder().position(2).sequence(Sequence.builder().name("Song1").displayName("Song One").build()).build())))
                .votes(new ArrayList<>())
                .sequences(new ArrayList<>(List.of(
                        Sequence.builder().name("Song1").displayName("Song One").build())))
                .psaSequences(new ArrayList<>(List.of(PsaSequence.builder().name("PSA1").build())))
                .playingNow("")
                .playingNext("")
                .playingNextFromSchedule("")
                .stats(Stat.builder().jukebox(new ArrayList<>()).voting(new ArrayList<>()).build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.of(show));

        DashboardLiveStatsResponse r = service.dashboardLiveStats(0L, 0L, TZ);
        assertThat(r.getPlayingNext()).isEqualTo("PSA1 Display");
    }

    @Test
    void dashboardLiveStats_playingNext_returnsScheduledPsa_whenScheduleIsPsa() {
        // When FPP itself reports a PSA in playingNextFromSchedule, the
        // operator dashboard surfaces the PSA name. Operator needs to know
        // what's actually coming so they can react to it.
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>())
                .votes(new ArrayList<>())
                .sequences(new ArrayList<>(List.of(
                        Sequence.builder().name("PSA1").displayName("PSA1 Display").build())))
                .psaSequences(new ArrayList<>(List.of(PsaSequence.builder().name("PSA1").build())))
                .playingNow("")
                .playingNext("")
                .playingNextFromSchedule("PSA1")
                .stats(Stat.builder().jukebox(new ArrayList<>()).voting(new ArrayList<>()).build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.of(show));

        DashboardLiveStatsResponse r = service.dashboardLiveStats(0L, 0L, TZ);
        assertThat(r.getPlayingNext()).isEqualTo("PSA1 Display");
    }

    @Test
    void dashboardLiveStats_playingNext_returnsScheduledLeader_whenScheduleIsLeader() {
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>())
                .votes(new ArrayList<>())
                .sequences(new ArrayList<>(List.of(
                        Sequence.builder().name("VoteLeader").displayName("Vote Leader").build())))
                .psaSequences(new ArrayList<>())
                .voteLeaderSequence("VoteLeader")
                .playingNow("")
                .playingNext("")
                .playingNextFromSchedule("VoteLeader")
                .stats(Stat.builder().jukebox(new ArrayList<>()).voting(new ArrayList<>()).build())
                .build();
        stubAuth(SHOW_TOKEN);
        when(showRepository.findByShowTokenForLiveStats(SHOW_TOKEN)).thenReturn(Optional.of(show));

        DashboardLiveStatsResponse r = service.dashboardLiveStats(0L, 0L, TZ);
        assertThat(r.getPlayingNext()).isEqualTo("Vote Leader");
    }

    // ---- downloadStatsToExcel ----

    @Test
    void downloadStatsToExcel_delegatesAggregatedStats_toExcelUtil() {
        stubAuth(SHOW_TOKEN);
        when(statsRepository.hasStatsByShowToken(SHOW_TOKEN)).thenReturn(true);

        org.springframework.http.ResponseEntity<org.springframework.core.io.ByteArrayResource> stub =
                org.springframework.http.ResponseEntity.ok().build();
        when(excelUtil.generateDashboardExcel(org.mockito.ArgumentMatchers.any(DashboardStatsResponse.class),
                org.mockito.ArgumentMatchers.eq(TZ))).thenReturn(stub);

        DownloadStatsToExcelRequest req = DownloadStatsToExcelRequest.builder()
                .dateFilterStart(ms(2025, 10, 1)).dateFilterEnd(ms(2025, 10, 31)).timezone(TZ).build();

        assertThat(service.downloadStatsToExcel(req)).isSameAs(stub);
    }

    // ---- wrappedSummary — opt-in + token validation + season window ----

    @Test
    void wrappedSummary_returnsNull_whenTokenMissingOrBlank() {
        assertThat(service.wrappedSummary(null, "halloween", 2025, TZ)).isNull();
        assertThat(service.wrappedSummary("", "halloween", 2025, TZ)).isNull();
    }

    @Test
    void wrappedSummary_returnsNull_whenTokenUnknown() {
        when(showRepository.findByWrappedShareTokenForWrapped("bad-tok")).thenReturn(Optional.empty());
        assertThat(service.wrappedSummary("bad-tok", "halloween", 2025, TZ)).isNull();
    }

    @Test
    void wrappedSummary_returnsNull_whenShowNotOptedIn() {
        Show show = Show.builder().showToken("t").showName("X")
                .preferences(Preference.builder().wrappedPublic(false).build()).build();
        when(showRepository.findByWrappedShareTokenForWrapped("tok")).thenReturn(Optional.of(show));
        assertThat(service.wrappedSummary("tok", "halloween", 2025, TZ)).isNull();
    }

    @Test
    void wrappedSummary_throwsUnknownSeason_whenSeasonInvalid() {
        Show show = Show.builder().showName("X")
                .preferences(Preference.builder().wrappedPublic(true).build()).build();
        when(showRepository.findByWrappedShareTokenForWrapped("tok")).thenReturn(Optional.of(show));
        assertThatThrownBy(() -> service.wrappedSummary("tok", "easter", 2025, TZ))
                .isInstanceOf(RuntimeException.class).hasMessage("UNKNOWN_SEASON");
    }

    @Test
    void wrappedSummary_halloweenWindow_isOct1ThruNov7_inUserZone() {
        Show show = Show.builder().showName("Boo")
                .preferences(Preference.builder().wrappedPublic(true).build())
                .stats(Stat.builder()
                        .page(new ArrayList<>(List.of(
                                // In window
                                Stat.Page.builder().ip("a").dateTime(at(2025, 10, 31, 19, 0)).build(),
                                // Out of window (Nov 8)
                                Stat.Page.builder().ip("b").dateTime(at(2025, 11, 8, 19, 0)).build())))
                        .jukebox(new ArrayList<>())
                        .voting(new ArrayList<>())
                        .build())
                .build();
        when(showRepository.findByWrappedShareTokenForWrapped("tok")).thenReturn(Optional.of(show));

        WrappedSummaryResponse r = service.wrappedSummary("tok", "halloween", 2025, TZ);
        assertThat(r).isNotNull();
        assertThat(r.getSeason()).isEqualTo("halloween");
        assertThat(r.getYear()).isEqualTo(2025);
        assertThat(r.getShowName()).isEqualTo("Boo");
        // Only the in-window event counts
        assertThat(r.getActiveNights()).isEqualTo(1);
        assertThat(r.getTotalPageHits()).isEqualTo(1);
        // Window stamps are at the start-of-day in the user's tz.
        long expectedStart = LocalDate.of(2025, 10, 1).atStartOfDay(TZ_ID).toInstant().toEpochMilli();
        long expectedEnd = LocalDate.of(2025, 11, 8).atStartOfDay(TZ_ID).toInstant().toEpochMilli();
        assertThat(r.getStartDate()).isEqualTo(expectedStart);
        assertThat(r.getEndDate()).isEqualTo(expectedEnd);
    }

    @Test
    void wrappedSummary_christmasWindow_wrapsToNextYear() {
        Show show = Show.builder().showName("Xmas")
                .preferences(Preference.builder().wrappedPublic(true).build())
                .build();
        when(showRepository.findByWrappedShareTokenForWrapped("tok")).thenReturn(Optional.of(show));

        WrappedSummaryResponse r = service.wrappedSummary("tok", "christmas", 2025, TZ);
        assertThat(r).isNotNull();
        long expectedStart = LocalDate.of(2025, 11, 15).atStartOfDay(TZ_ID).toInstant().toEpochMilli();
        long expectedEnd = LocalDate.of(2026, 1, 8).atStartOfDay(TZ_ID).toInstant().toEpochMilli();
        assertThat(r.getStartDate()).isEqualTo(expectedStart);
        assertThat(r.getEndDate()).isEqualTo(expectedEnd);
    }

    @Test
    void wrappedSummary_nullTimezone_defaultsToAmericaNewYork() {
        Show show = Show.builder().showName("X")
                .preferences(Preference.builder().wrappedPublic(true).build()).build();
        when(showRepository.findByWrappedShareTokenForWrapped("tok")).thenReturn(Optional.of(show));

        // Don't crash; produce a valid object.
        WrappedSummaryResponse r = service.wrappedSummary("tok", "halloween", 2025, null);
        assertThat(r).isNotNull();
    }

    @Test
    void wrappedSummary_topRequestedAndVoted_computedAcrossSeason() {
        LocalDateTime t1 = at(2025, 10, 20, 19, 0);
        Show show = Show.builder().showName("X")
                .preferences(Preference.builder().wrappedPublic(true).build())
                .sequences(List.of(Sequence.builder().name("carol").duration(180).build()))
                .stats(Stat.builder()
                        .page(new ArrayList<>())
                        .jukebox(new ArrayList<>(List.of(
                                Stat.Jukebox.builder().name("carol").dateTime(t1).build(),
                                Stat.Jukebox.builder().name("carol").dateTime(t1.plusMinutes(1)).build(),
                                Stat.Jukebox.builder().name("wizards").dateTime(t1.plusMinutes(2)).build())))
                        .voting(new ArrayList<>(List.of(
                                Stat.Voting.builder().name("carol").dateTime(t1).build(),
                                Stat.Voting.builder().name("wizards").dateTime(t1).build(),
                                Stat.Voting.builder().name("wizards").dateTime(t1).build())))
                        .build())
                .build();
        when(showRepository.findByWrappedShareTokenForWrapped("tok")).thenReturn(Optional.of(show));

        WrappedSummaryResponse r = service.wrappedSummary("tok", "halloween", 2025, TZ);
        assertThat(r.getTopRequestedSequence()).isEqualTo("carol");
        assertThat(r.getTopRequestedCount()).isEqualTo(2);
        // 180s duration x 2 requests = 360s.
        assertThat(r.getTopRequestedTotalPlaySeconds()).isEqualTo(360L);
        assertThat(r.getTopVotedSequence()).isEqualTo("wizards");
        assertThat(r.getTopVotedCount()).isEqualTo(2);
    }

    @Test
    void wrappedSummary_throwsRateLimited_after30CallsInWindow() {
        Show show = Show.builder().showName("X")
                .preferences(Preference.builder().wrappedPublic(true).build()).build();
        when(showRepository.findByWrappedShareTokenForWrapped("tok")).thenReturn(Optional.of(show));

        // resolveCallerIp falls back to "unknown" when no request scope is set,
        // so all 31 calls share the same bucket and the 31st hits the limit.
        for (int i = 0; i < 30; i++) {
            service.wrappedSummary("tok", "halloween", 2025, TZ);
        }
        assertThatThrownBy(() -> service.wrappedSummary("tok", "halloween", 2025, TZ))
                .isInstanceOf(RuntimeException.class).hasMessage("RATE_LIMITED");
    }
}
