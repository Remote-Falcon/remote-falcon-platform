package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.ActiveViewer;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.models.ViewerSession;
import com.remotefalcon.library.models.Vote;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the Pattern A read-only projection contract on {@link ShowRepository}.
 *
 * <p>The dashboard read paths used to load the entire (multi-MB) Show just to
 * read one sub-array. {@code findByShowTokenForLiveStats},
 * {@code findByShowTokenForStats}, and {@code findByEmailCollationForAuth}
 * load only what each path needs.
 *
 * <p><b>Why this test exists — the safety rule it guards:</b> each projection
 * returns a PARTIALLY-POPULATED Show (excluded fields are {@code null}). Spring
 * Data {@code save()} does a full-document REPLACE, so passing a projected Show
 * to {@code save()} would WIPE the excluded arrays in the database. This test
 * proves which fields each projection drops, so a future change that widens a
 * projection (and thereby risks a destructive write-back, or re-bloats the read)
 * fails CI here rather than silently in production.
 */
@DataMongoTest
@Testcontainers
class ShowRepositoryProjectionTest {

    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MongoTemplate mongoTemplate;

    @Autowired
    private ShowRepository showRepository;

    private Show seeded;

    @BeforeEach
    void setup() {
        mongoTemplate.dropCollection(Show.class);
        seeded = mongoTemplate.insert(fullyPopulatedShow("token-abc", "Owner@Example.com"));
    }

    /**
     * Control assertion: the un-projected lookup returns every heavy array.
     * If this regresses, the projection assertions below are meaningless, so
     * the seed must stay fully populated.
     */
    @Test
    void fullLoad_returnsEveryHeavyArray() {
        Show full = showRepository.findByShowToken("token-abc").orElseThrow();

        assertThat(full.getStats()).isNotNull();
        assertThat(full.getViewerSessions()).isNotEmpty();
        assertThat(full.getActiveViewers()).isNotEmpty();
        assertThat(full.getPages()).isNotEmpty();
        assertThat(full.getRequests()).isNotEmpty();
        assertThat(full.getVotes()).isNotEmpty();
        assertThat(full.getSequences()).isNotEmpty();
    }

    @Test
    void forStats_keepsStatsAndPsaSequences_dropsLiveAndContentArrays() {
        Show show = showRepository.findByShowTokenForStats("token-abc").orElseThrow();

        // Included — the stats analytics paths read stats.*; psaEffectiveness
        // also reads psaSequences.
        assertThat(show.getShowToken()).isEqualTo("token-abc");
        assertThat(show.getPreferences()).isNotNull();
        assertThat(show.getStats()).isNotNull();
        assertThat(show.getStats().getPage()).isNotEmpty();
        assertThat(show.getPsaSequences()).isNotEmpty();

        // Excluded.
        assertThat(show.getViewerSessions()).isNull();
        assertThat(show.getActiveViewers()).isNull();
        assertThat(show.getSequences()).isNull();
        assertThat(show.getPages()).isNull();
        assertThat(show.getRequests()).isNull();
        assertThat(show.getVotes()).isNull();
    }

    @Test
    void forViewerSessions_keepsOnlySessions_dropsTheStatsBulk() {
        Show show = showRepository.findByShowTokenForViewerSessions("token-abc").orElseThrow();

        assertThat(show.getViewerSessions()).isNotEmpty();
        assertThat(show.getPreferences()).isNotNull();

        // The whole point: the audience tab never pays for the multi-MB stats.
        assertThat(show.getStats())
                .as("forViewerSessions must NOT load stats.* (the season's bulk)")
                .isNull();
        assertThat(show.getActiveViewers()).isNull();
        assertThat(show.getPages()).isNull();
        assertThat(show.getRequests()).isNull();
        assertThat(show.getVotes()).isNull();
    }

    @Test
    void forLiveStats_keepsLiveArraysAndTodaysStatCounts_dropsPageStatsAndContent() {
        Show show = showRepository.findByShowTokenForLiveStats("token-abc").orElseThrow();

        // Kept — the poll reads stats.jukebox + stats.voting (today's totals),
        // the live operational arrays, and renders now/next from sequences.
        assertThat(show.getStats()).isNotNull();
        assertThat(show.getStats().getJukebox()).isNotEmpty();
        assertThat(show.getStats().getVoting()).isNotEmpty();
        assertThat(show.getViewerSessions()).isNotEmpty();
        assertThat(show.getActiveViewers()).isNotEmpty();
        assertThat(show.getVotes()).isNotEmpty();
        assertThat(show.getSequences()).isNotEmpty();
        assertThat(show.getRequests()).isNotEmpty();

        // Dropped — never read by the poll. stats.page is the largest stat
        // array (one entry per page view); pages is the viewer-page HTML.
        assertThat(show.getStats().getPage())
                .as("forLiveStats must drop stats.page — the per-pageview array the poll never reads")
                .isNull();
        assertThat(show.getStats().getVotingWin()).isNull();
        assertThat(show.getPages()).isNull();
    }

    @Test
    void forAuth_dropsStatsAndSessions_keepsEverythingSignInSelects() {
        Show show = showRepository.findByEmailCollationForAuth("owner@example.com").orElseThrow();

        // Included — credentials + everything the UI's SIGN_IN query selects,
        // so the login response stays byte-identical for the client.
        assertThat(show.getEmail()).isEqualTo("Owner@Example.com");
        assertThat(show.getPassword()).isNotBlank();
        assertThat(show.getShowToken()).isEqualTo("token-abc");
        assertThat(show.getShowRole()).isNotNull();
        assertThat(show.getPreferences()).isNotNull();
        assertThat(show.getSequences()).isNotEmpty();
        assertThat(show.getPages()).isNotEmpty();
        assertThat(show.getRequests()).isNotEmpty();
        assertThat(show.getVotes()).isNotEmpty();
        assertThat(show.getActiveViewers()).isNotEmpty();

        // Excluded — NOT selected by SIGN_IN, so dropping them shrinks the
        // per-login payload (stats is the season's 5–10 MB bulk) with no
        // client-visible change.
        assertThat(show.getStats())
                .as("signIn must not pay the cost of loading stats on every login")
                .isNull();
        assertThat(show.getViewerSessions()).isNull();
    }

    /**
     * forAuth must preserve the case-insensitive collation match of the
     * original findByEmailCollation — adding {@code fields} must not change the
     * lookup semantics.
     */
    @Test
    void forAuth_matchesEmailCaseInsensitively() {
        assertThat(showRepository.findByEmailCollationForAuth("OWNER@EXAMPLE.COM")).isPresent();
        assertThat(showRepository.findByEmailCollationForAuth("nobody@example.com")).isEmpty();
    }

    /** A Show with every projected-away array populated, so exclusions are observable. */
    private static Show fullyPopulatedShow(String showToken, String email) {
        LocalDateTime now = LocalDateTime.now();
        Sequence seq = Sequence.builder().name("Wizards in Winter").duration(180).order(1).build();

        return ShowFactory.builder()
                .showToken(showToken)
                .email(email)
                .preferences(Preference.builder().viewerControlMode(ViewerControlMode.JUKEBOX).build())
                .sequences(List.of(seq))
                .psaSequences(List.of(PsaSequence.builder().name("Intro PSA").order(1).enabled(true).build()))
                .stats(Stat.builder()
                        .page(List.of(Stat.Page.builder().ip("1.2.3.4").viewerId("v1").dateTime(now).build()))
                        .jukebox(List.of(Stat.Jukebox.builder().name("Wizards in Winter").viewerId("v1").dateTime(now).build()))
                        .voting(List.of(Stat.Voting.builder().name("Wizards in Winter").viewerId("v1").dateTime(now).build()))
                        .votingWin(List.of(Stat.VotingWin.builder().name("Wizards in Winter").dateTime(now).build()))
                        .build())
                .viewerSessions(List.of(ViewerSession.builder()
                        .ip("1.2.3.4").viewerId("v1").nightDate(LocalDate.now())
                        .firstSeen(now).lastSeen(now).eventCount(3).build()))
                .activeViewers(List.of(ActiveViewer.builder()
                        .ipAddress("1.2.3.4").viewerId("v1").visitDateTime(now).build()))
                .pages(List.of(ViewerPage.builder().name("home").active(true).html("<p>Welcome</p>").build()))
                .requests(List.of(Request.builder().sequence(seq).position(1).viewerRequested("1.2.3.4").build()))
                .votes(List.of(Vote.builder().sequence(seq).votes(2).build()))
                .build();
    }
}
