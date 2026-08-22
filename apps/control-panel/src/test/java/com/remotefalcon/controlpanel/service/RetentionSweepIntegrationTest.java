package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.models.ViewerSession;
import com.remotefalcon.library.models.Vote;
import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Integration tests for the nightly retention sweep and the document-size /
 * votes-bloat alarm ({@link ScheduledTaskService}).
 *
 * <p>Uses a real MongoDB testcontainer because both code paths are now
 * entirely server-side: the sweep is a single {@code updateMulti} of
 * {@code $pull}s and the alarm is an aggregation over {@code $size} /
 * {@code $strLenBytes}. Mocks can't exercise either — the operator semantics
 * ARE the behavior under test (BSON type bracketing on null dates, the
 * {@code $not $gte} inversion for votes, {@code $ifNull} guards on missing
 * arrays).
 *
 * <p>Sliced via {@code @DataMongoTest} rather than full {@code @SpringBootTest}
 * to avoid pulling in the dozen-plus {@code @Value} secrets the full app
 * context requires. {@link ScheduledTaskService} is constructed by hand — its
 * only collaborators on these paths are the repository and the template.
 */
@DataMongoTest
@Testcontainers
class RetentionSweepIntegrationTest {

    @Container
    static final MongoDBContainer MONGO =
            new MongoDBContainer(DockerImageName.parse("mongo:7"));

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", MONGO::getReplicaSetUrl);
        reg.add("spring.data.mongodb.database", () -> "remote-falcon-test");
    }

    @Autowired private MongoTemplate mongoTemplate;
    @Autowired private ShowRepository showRepository;

    private ScheduledTaskService scheduledTaskService;

    @BeforeEach
    void setUp() {
        mongoTemplate.dropCollection(Show.class);
        scheduledTaskService = new ScheduledTaskService(showRepository, mongoTemplate);
    }

    private static LocalDateTime stale() {
        return LocalDateTime.now().minusMonths(20);
    }

    private static LocalDateTime recent() {
        return LocalDateTime.now().minusDays(30);
    }

    private static Show buildShow(String suffix, Stat stats) {
        LocalDateTime now = LocalDateTime.now();
        return Show.builder()
                .showToken(UUID.randomUUID().toString())
                .email("user-" + suffix + "@example.com")
                .password("$2a$10$test.bcrypt.hash.placeholder.value.AAAAAAAAAAAAAAAAAAAAAA")
                .showName("Show " + suffix)
                .showSubdomain("show-" + suffix)
                .emailVerified(true)
                .createdDate(now.minusDays(30))
                .lastLoginDate(now.minusHours(1))
                .expireDate(now.plusYears(1))
                .showRole(ShowRole.USER)
                .stats(stats)
                .build();
    }

    private static Stat statsWithMixedAge() {
        return Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("a").dateTime(stale()).build(),
                        Stat.Page.builder().ip("b").dateTime(recent()).build())))
                .jukebox(new ArrayList<>(List.of(
                        Stat.Jukebox.builder().name("oldJ").dateTime(stale()).build(),
                        Stat.Jukebox.builder().name("newJ").dateTime(recent()).build())))
                .voting(new ArrayList<>(List.of(
                        Stat.Voting.builder().name("oldV").dateTime(stale()).build(),
                        Stat.Voting.builder().name("newV").dateTime(recent()).build())))
                .votingWin(new ArrayList<>(List.of(
                        Stat.VotingWin.builder().name("oldW").total(1).dateTime(stale()).build(),
                        Stat.VotingWin.builder().name("newW").total(2).dateTime(recent()).build())))
                .build();
    }

    private static Stat statsAllRecent() {
        return Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("a").dateTime(recent()).build())))
                .jukebox(new ArrayList<>(List.of(
                        Stat.Jukebox.builder().name("a").dateTime(recent()).build())))
                .voting(new ArrayList<>(List.of(
                        Stat.Voting.builder().name("a").dateTime(recent()).build())))
                .votingWin(new ArrayList<>(List.of(
                        Stat.VotingWin.builder().name("a").total(1).dateTime(recent()).build())))
                .build();
    }

    // ---- retention sweep -------------------------------------------------

    @Test
    void sweep_emptyCollection_noOp() {
        assertThatCode(() -> scheduledTaskService.purgeStaleStatsForAllShows())
                .doesNotThrowAnyException();
        assertThat(showRepository.count()).isZero();
    }

    @Test
    void sweep_trimsStaleStats_acrossManyShows() {
        int n = 50;
        for (int i = 0; i < n; i++) {
            showRepository.save(buildShow(String.valueOf(i), statsWithMixedAge()));
        }

        scheduledTaskService.purgeStaleStatsForAllShows();

        List<Show> all = showRepository.findAll();
        assertThat(all).hasSize(n);
        for (Show s : all) {
            assertThat(s.getStats().getPage()).hasSize(1);
            assertThat(s.getStats().getPage().get(0).getIp()).isEqualTo("b");
            assertThat(s.getStats().getJukebox()).hasSize(1);
            assertThat(s.getStats().getJukebox().get(0).getName()).isEqualTo("newJ");
            assertThat(s.getStats().getVoting()).hasSize(1);
            assertThat(s.getStats().getVoting().get(0).getName()).isEqualTo("newV");
            assertThat(s.getStats().getVotingWin()).hasSize(1);
            assertThat(s.getStats().getVotingWin().get(0).getName()).isEqualTo("newW");
        }
    }

    @Test
    void sweep_leavesInRetentionDataUntouched() {
        showRepository.save(buildShow("a", statsAllRecent()));
        showRepository.save(buildShow("b", statsAllRecent()));

        scheduledTaskService.purgeStaleStatsForAllShows();

        for (Show s : showRepository.findAll()) {
            assertThat(s.getStats().getPage()).hasSize(1);
            assertThat(s.getStats().getJukebox()).hasSize(1);
            assertThat(s.getStats().getVoting()).hasSize(1);
            assertThat(s.getStats().getVotingWin()).hasSize(1);
        }
    }

    @Test
    void sweep_nullDateTimeEntriesSurviveInertly() {
        // The predecessor (Java removeIf over loaded documents) threw an NPE
        // on a null dateTime and needed per-show error handling. Server-side
        // $lt can't throw: BSON type bracketing means a null/missing dateTime
        // simply never matches, so malformed legacy entries survive in place
        // and the sweep is total by construction.
        Stat bad = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("nullDate").dateTime(null).build())))
                .jukebox(new ArrayList<>())
                .voting(new ArrayList<>())
                .votingWin(new ArrayList<>())
                .build();
        Show poison = showRepository.save(buildShow("poison", bad));
        Show ok = showRepository.save(buildShow("ok", statsWithMixedAge()));

        assertThatCode(() -> scheduledTaskService.purgeStaleStatsForAllShows())
                .doesNotThrowAnyException();

        Show poisonAfter = showRepository.findByShowToken(poison.getShowToken()).orElseThrow();
        assertThat(poisonAfter.getStats().getPage()).hasSize(1);
        Show okAfter = showRepository.findByShowToken(ok.getShowToken()).orElseThrow();
        assertThat(okAfter.getStats().getPage()).hasSize(1);
    }

    @Test
    void sweep_trimsViewerSessions_theArrayWhoseRetentionWasNeverWritten() {
        // ViewerSession's javadoc claimed an 18-month trim from the day it
        // shipped (2026-05); the trim did not exist and the array grew
        // unbounded for a full preseason. This is the regression test that
        // was missing then.
        Show show = buildShow("vs", statsAllRecent());
        show.setViewerSessions(new ArrayList<>(List.of(
                ViewerSession.builder().viewerId("stale").lastSeen(stale()).build(),
                ViewerSession.builder().viewerId("fresh").lastSeen(recent()).build())));
        showRepository.save(show);

        scheduledTaskService.purgeStaleStatsForAllShows();

        Show after = showRepository.findByShowToken(show.getShowToken()).orElseThrow();
        assertThat(after.getViewerSessions()).hasSize(1);
        assertThat(after.getViewerSessions().get(0).getViewerId()).isEqualTo("fresh");
    }

    @Test
    void sweep_expiresVotesOlderThanADay_includingUndatedOnes() {
        // The 2026-08-22 whale: 6,066 stranded systemInjected PSA votes on one
        // show made every operation on it take seconds. Expiry is deliberately
        // inverted relative to the stats pulls ($not $gte instead of $lt): a
        // vote with a null or missing lastVoteTime has no readable age and is
        // exactly the junk this exists to remove, so it goes too. Margins are
        // wide (30h vs 1h) so a DST hour can't flip a boundary.
        Show show = buildShow("votes", statsAllRecent());
        show.setVotes(new ArrayList<>(List.of(
                Vote.builder().votes(1).lastVoteTime(LocalDateTime.now().minusHours(30))
                        .systemInjected(true).build(),
                Vote.builder().votes(1).lastVoteTime(null).build(),
                Vote.builder().votes(1).lastVoteTime(LocalDateTime.now().minusHours(1)).build())));
        showRepository.save(show);

        scheduledTaskService.purgeStaleStatsForAllShows();

        Show after = showRepository.findByShowToken(show.getShowToken()).orElseThrow();
        assertThat(after.getVotes()).hasSize(1);
        assertThat(after.getVotes().get(0).getLastVoteTime())
                .isAfter(LocalDateTime.now().minusHours(2));
    }

    // ---- document-size / votes-bloat alarm -------------------------------

    @Test
    void alarm_cleanFleet_flagsNothing() {
        showRepository.save(buildShow("clean1", statsAllRecent()));
        showRepository.save(buildShow("clean2", statsWithMixedAge()));

        assertThat(scheduledTaskService.alarmOnOversizedShows()).isEmpty();
    }

    @Test
    void alarm_flagsVotesBloat_farBelowTheSizeThreshold() {
        // The whale degraded UX at ~3 MB — a quarter of the size alarm. The
        // votes tripwire exists so the next one is flagged by count, not by
        // an operator noticing their dashboard crawling.
        Show bloated = buildShow("bloated", statsAllRecent());
        bloated.setVotes(new ArrayList<>(IntStream.range(0, ScheduledTaskService.VOTES_COUNT_ALARM + 1)
                .mapToObj(i -> Vote.builder().votes(1)
                        .lastVoteTime(LocalDateTime.now().minusHours(1)).build())
                .toList()));
        showRepository.save(bloated);
        showRepository.save(buildShow("clean", statsAllRecent()));

        List<Document> flagged = scheduledTaskService.alarmOnOversizedShows();

        assertThat(flagged).hasSize(1);
        assertThat(flagged.get(0).getString("showSubdomain")).isEqualTo("show-bloated");
        assertThat(flagged.get(0).getInteger("votesCount"))
                .isGreaterThan(ScheduledTaskService.VOTES_COUNT_ALARM);
    }

    @Test
    void alarm_flagsEstimatedOversize_fromRealPageHtmlBytes() {
        // $bsonSize returns null on DO Managed Mongo 8.0, which is how the
        // previous alarm silently matched nothing forever. Viewer-page HTML is
        // measured for real ($strLenBytes) because a page can be 1 byte or
        // 1 MB — 13 x 1 MB clears the 12 MB threshold on pages alone.
        String megabyte = "x".repeat(1_048_576);
        Show big = buildShow("big", statsAllRecent());
        big.setPages(new ArrayList<>(IntStream.range(0, 13)
                .mapToObj(i -> ViewerPage.builder().name("p" + i).active(i == 0)
                        .html(megabyte).build())
                .toList()));
        showRepository.save(big);
        showRepository.save(buildShow("small", statsAllRecent()));

        List<Document> flagged = scheduledTaskService.alarmOnOversizedShows();

        assertThat(flagged).hasSize(1);
        assertThat(flagged.get(0).getString("showSubdomain")).isEqualTo("show-big");
        assertThat(flagged.get(0).get("estBytes", Number.class).longValue())
                .isGreaterThan(ScheduledTaskService.DOC_SIZE_WARN_BYTES);
    }

    @Test
    void alarm_toleratesShowsWithNoArraysAtAll() {
        // $size on a missing field is an aggregation ERROR, not a zero — every
        // count in the estimator must ride an $ifNull. A bare legacy show with
        // no stats, pages, or votes must not blow up the whole sweep.
        Show bare = buildShow("bare", null);
        showRepository.save(bare);

        assertThatCode(() -> scheduledTaskService.alarmOnOversizedShows())
                .doesNotThrowAnyException();
        assertThat(scheduledTaskService.alarmOnOversizedShows()).isEmpty();
    }
}
