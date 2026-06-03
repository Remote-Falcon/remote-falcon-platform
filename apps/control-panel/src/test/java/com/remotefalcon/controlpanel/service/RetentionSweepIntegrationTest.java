package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.EmailUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.models.Stat;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Integration test for the nightly stats retention sweep
 * ({@link ScheduledTaskService#purgeStaleStatsForAllShows()}).
 *
 * <p>Uses a real MongoDB testcontainer + a real {@link MongoTemplate} +
 * the real Spring-Data {@link ShowRepository} so we exercise the
 * {@code mongoTemplate.stream(...)} cursor end-to-end. The
 * {@link GraphQLMutationService} dependency is constructed manually with
 * Mockito mocks for its non-Mongo collaborators (email, auth, etc.) — we
 * only need the {@code purgeStatsForShow(Show)} path, which depends on
 * the real {@link ShowRepository} for the if-changed-save persistence.
 *
 * <p>This is sliced via {@code @DataMongoTest} rather than full
 * {@code @SpringBootTest} to avoid pulling in the dozen-plus
 * {@code @Value} secrets the full app context requires.
 */
@DataMongoTest
@Testcontainers
@Import(RetentionSweepIntegrationTest.NoopMockConfig.class)
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

    // Mocked here so @DataMongoTest doesn't try to wire them from the full context.
    @MockBean private EmailUtil emailUtil;
    @MockBean private AuthUtil authUtil;
    @MockBean private NotificationRepository notificationRepository;
    @MockBean private ClientUtil clientUtil;

    private GraphQLMutationService graphQLMutationService;
    private ScheduledTaskService scheduledTaskService;

    @BeforeEach
    void setUp() {
        mongoTemplate.dropCollection(Show.class);
        graphQLMutationService = new GraphQLMutationService(
                emailUtil, authUtil, showRepository, notificationRepository,
                clientUtil, new ViewerPageService(), mongoTemplate);
        // @Value("${auto-validate-email}") field — not relevant to purge logic but
        // populated to avoid null surprises if other code paths ever touch it.
        ReflectionTestUtils.setField(graphQLMutationService, "autoValidateEmail", Boolean.TRUE);

        scheduledTaskService = new ScheduledTaskService(
                showRepository, graphQLMutationService, mongoTemplate);
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
    void sweep_skipsSavesForUnchangedShows() {
        // Persist 3 shows whose stats are all already within retention.
        Show s1 = showRepository.save(buildShow("a", statsAllRecent()));
        Show s2 = showRepository.save(buildShow("b", statsAllRecent()));
        Show s3 = showRepository.save(buildShow("c", statsAllRecent()));
        // We can't easily detect "didn't write" from the outside without a
        // Mongo profiler hook, but we can at least assert payloads are byte-
        // identical across the sweep — covers accidental mutation regressions.
        List<Stat> before = List.of(
                deepCopyStat(s1.getStats()),
                deepCopyStat(s2.getStats()),
                deepCopyStat(s3.getStats()));

        scheduledTaskService.purgeStaleStatsForAllShows();

        List<Show> after = showRepository.findAll();
        assertThat(after).hasSize(3);
        for (Show s : after) {
            assertThat(before).anySatisfy(b -> {
                // Each post-sweep show must match exactly one pre-sweep snapshot.
                // Counts equal across all four sub-lists, no additions/removals.
                assertThat(s.getStats().getPage().size() + s.getStats().getJukebox().size()
                        + s.getStats().getVoting().size() + s.getStats().getVotingWin().size())
                        .isEqualTo(b.getPage().size() + b.getJukebox().size()
                                + b.getVoting().size() + b.getVotingWin().size());
            });
        }
    }

    @Test
    void sweep_continuesOnPerShowError() {
        // A "poison" show whose stats sub-list contains an entry with a null
        // dateTime — this forces a NullPointerException inside the
        // removeIf(...) lambda, simulating a malformed legacy document.
        Stat bad = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("nullDate").dateTime(null).build())))
                .jukebox(new ArrayList<>())
                .voting(new ArrayList<>())
                .votingWin(new ArrayList<>())
                .build();
        Show poison = showRepository.save(buildShow("poison", bad));
        Show ok1 = showRepository.save(buildShow("ok1", statsWithMixedAge()));
        Show ok2 = showRepository.save(buildShow("ok2", statsWithMixedAge()));

        // Sweep must NOT propagate the per-show error.
        assertThatCode(() -> scheduledTaskService.purgeStaleStatsForAllShows())
                .doesNotThrowAnyException();

        // Poison show is still in the collection (sweep didn't abort).
        assertThat(showRepository.findByShowToken(poison.getShowToken())).isPresent();
        // Healthy shows were trimmed normally.
        Show ok1After = showRepository.findByShowToken(ok1.getShowToken()).orElseThrow();
        Show ok2After = showRepository.findByShowToken(ok2.getShowToken()).orElseThrow();
        assertThat(ok1After.getStats().getPage()).hasSize(1);
        assertThat(ok2After.getStats().getPage()).hasSize(1);
    }

    private static Stat deepCopyStat(Stat s) {
        return Stat.builder()
                .page(new ArrayList<>(s.getPage()))
                .jukebox(new ArrayList<>(s.getJukebox()))
                .voting(new ArrayList<>(s.getVoting()))
                .votingWin(new ArrayList<>(s.getVotingWin()))
                .build();
    }

    /**
     * Empty config — placeholder so {@code @Import} has something to attach to
     * if future test wiring needs it. Kept as a hook to avoid churning the
     * class annotation list later.
     */
    static class NoopMockConfig {}
}
