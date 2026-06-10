package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.testfixtures.ShowFactory;
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

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the {@link StatsRepository} aggregation pipelines: that they unwind
 * the right {@code stats.*} sub-array, filter to the {@code [lower, upper]}
 * window, and map each unwound element back to its model type.
 *
 * <p>These pipelines feed the {@code build*Stats} helpers a pre-narrowed
 * superset; the helpers' unchanged Java filter does the precise trimming (see
 * {@link StatsRepository} javadoc), so this test pins the Mongo-side behavior
 * the parity contract depends on: nothing in-window is dropped, things well
 * outside the window are excluded, and field mapping survives {@code $replaceRoot}.
 */
@DataMongoTest
@Testcontainers
class StatsRepositoryTest {

    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MongoTemplate mongoTemplate;

    @Autowired
    private StatsRepository statsRepository;

    // Window: 2025-10-14 .. 2025-10-17 (wall-clock), as the production code
    // passes it — LocalDateTime bound reinterpreted as a UTC instant.
    private static final Date LOWER = date(LocalDateTime.of(2025, 10, 14, 0, 0));
    private static final Date UPPER = date(LocalDateTime.of(2025, 10, 17, 0, 0));

    @BeforeEach
    void setup() {
        mongoTemplate.dropCollection(Show.class);
    }

    @Test
    void pageStatsInRange_returnsOnlyInWindow_andMapsFields() {
        mongoTemplate.insert(ShowFactory.builder()
                .showToken("t1")
                .stats(Stat.builder()
                        .page(List.of(
                                page("1.1.1.1", LocalDateTime.of(2025, 10, 10, 12, 0)),   // before
                                page("2.2.2.2", LocalDateTime.of(2025, 10, 15, 12, 0)),   // in
                                page("3.3.3.3", LocalDateTime.of(2025, 10, 16, 9, 30)),   // in
                                page("4.4.4.4", LocalDateTime.of(2025, 10, 25, 12, 0))))  // after
                        .build())
                .build());

        List<Stat.Page> result = statsRepository.pageStatsInRange("t1", LOWER, UPPER);

        assertThat(result).extracting(Stat.Page::getIp)
                .containsExactlyInAnyOrder("2.2.2.2", "3.3.3.3");
        assertThat(result).allSatisfy(p -> assertThat(p.getDateTime()).isNotNull());
    }

    @Test
    void jukeboxStatsInRange_filtersToWindow_andMapsName() {
        mongoTemplate.insert(ShowFactory.builder()
                .showToken("t1")
                .stats(Stat.builder()
                        .jukebox(List.of(
                                jukebox("Old", LocalDateTime.of(2025, 9, 1, 12, 0)),
                                jukebox("Wizards", LocalDateTime.of(2025, 10, 15, 20, 0))))
                        .build())
                .build());

        List<Stat.Jukebox> result = statsRepository.jukeboxStatsInRange("t1", LOWER, UPPER);

        assertThat(result).extracting(Stat.Jukebox::getName).containsExactly("Wizards");
    }

    @Test
    void votingStatsInRange_filtersToWindow() {
        mongoTemplate.insert(ShowFactory.builder()
                .showToken("t1")
                .stats(Stat.builder()
                        .voting(List.of(
                                voting("A", LocalDateTime.of(2025, 10, 15, 20, 0)),
                                voting("B", LocalDateTime.of(2025, 12, 1, 20, 0))))
                        .build())
                .build());

        assertThat(statsRepository.votingStatsInRange("t1", LOWER, UPPER))
                .extracting(Stat.Voting::getName).containsExactly("A");
    }

    @Test
    void votingWinStatsInRange_filtersToWindow() {
        mongoTemplate.insert(ShowFactory.builder()
                .showToken("t1")
                .stats(Stat.builder()
                        .votingWin(List.of(
                                votingWin("A", LocalDateTime.of(2025, 10, 15, 20, 0)),
                                votingWin("B", LocalDateTime.of(2025, 1, 1, 20, 0))))
                        .build())
                .build());

        assertThat(statsRepository.votingWinStatsInRange("t1", LOWER, UPPER))
                .extracting(Stat.VotingWin::getName).containsExactly("A");
    }

    @Test
    void pageStatsInRange_dropsElementsWithNullDateTime() {
        // A malformed/legacy element with a null dateTime must be excluded by the
        // $match (it is neither >= lower nor <= upper). The old build* helpers
        // NPE'd on such an element; the aggregation simply drops it.
        mongoTemplate.insert(ShowFactory.builder()
                .showToken("t1")
                .stats(Stat.builder()
                        .page(List.of(
                                page("good", LocalDateTime.of(2025, 10, 15, 12, 0)),
                                Stat.Page.builder().ip("null-dt").viewerId("v").dateTime(null).build()))
                        .build())
                .build());

        assertThat(statsRepository.pageStatsInRange("t1", LOWER, UPPER))
                .extracting(Stat.Page::getIp).containsExactly("good");
    }

    @Test
    void pageStatsInRange_windowBoundsAreInclusive() {
        // $gte/$lte: an element exactly at lower or upper is kept; just outside is dropped.
        mongoTemplate.insert(ShowFactory.builder()
                .showToken("t1")
                .stats(Stat.builder()
                        .page(List.of(
                                page("at-lower", LocalDateTime.of(2025, 10, 14, 0, 0)),
                                page("at-upper", LocalDateTime.of(2025, 10, 17, 0, 0)),
                                page("below-lower", LocalDateTime.of(2025, 10, 13, 23, 59))))
                        .build())
                .build());

        assertThat(statsRepository.pageStatsInRange("t1", LOWER, UPPER))
                .extracting(Stat.Page::getIp)
                .containsExactlyInAnyOrder("at-lower", "at-upper");
    }

    @Test
    void rejectedRequestsInRange_filtersToWindow_andMapsReason() {
        mongoTemplate.insert(ShowFactory.builder()
                .showToken("t1")
                .stats(Stat.builder()
                        .rejectedRequests(List.of(
                                rejected("NAUGHTY", LocalDateTime.of(2025, 10, 15, 20, 0)),
                                rejected("QUEUE_FULL", LocalDateTime.of(2025, 12, 1, 20, 0))))
                        .build())
                .build());

        assertThat(statsRepository.rejectedRequestsInRange("t1", LOWER, UPPER))
                .extracting(Stat.RejectedRequest::getReason).containsExactly("NAUGHTY");
    }

    @Test
    void inRange_returnsEmpty_whenStatsArrayNullOrAbsent() {
        mongoTemplate.insert(ShowFactory.builder().showToken("t1").stats(null).build());

        assertThat(statsRepository.pageStatsInRange("t1", LOWER, UPPER)).isEmpty();
        assertThat(statsRepository.jukeboxStatsInRange("t1", LOWER, UPPER)).isEmpty();
    }

    @Test
    void inRange_returnsEmpty_whenShowTokenUnknown() {
        mongoTemplate.insert(ShowFactory.builder().showToken("t1").build());

        assertThat(statsRepository.pageStatsInRange("nope", LOWER, UPPER)).isEmpty();
    }

    @Test
    void existsByShowToken_reflectsPresence() {
        mongoTemplate.insert(ShowFactory.builder().showToken("t1").build());

        assertThat(statsRepository.existsByShowToken("t1")).isTrue();
        assertThat(statsRepository.existsByShowToken("nope")).isFalse();
    }

    private static Date date(LocalDateTime localWallClock) {
        return Date.from(localWallClock.toInstant(ZoneOffset.UTC));
    }

    private static Stat.Page page(String ip, LocalDateTime dt) {
        return Stat.Page.builder().ip(ip).viewerId("v").dateTime(dt).build();
    }

    private static Stat.Jukebox jukebox(String name, LocalDateTime dt) {
        return Stat.Jukebox.builder().name(name).viewerId("v").dateTime(dt).build();
    }

    private static Stat.Voting voting(String name, LocalDateTime dt) {
        return Stat.Voting.builder().name(name).viewerId("v").dateTime(dt).build();
    }

    private static Stat.VotingWin votingWin(String name, LocalDateTime dt) {
        return Stat.VotingWin.builder().name(name).total(1).dateTime(dt).build();
    }

    private static Stat.RejectedRequest rejected(String reason, LocalDateTime dt) {
        return Stat.RejectedRequest.builder().reason(reason).viewerId("v").dateTime(dt).build();
    }
}
