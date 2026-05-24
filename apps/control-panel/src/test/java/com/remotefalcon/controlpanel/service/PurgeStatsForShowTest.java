package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.EmailUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.Stat;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for {@link GraphQLMutationService#purgeStatsForShow(Show)} —
 * the 18-month stats retention trim logic that is called nightly by the
 * scheduled sweep (see {@link ScheduledTaskService#purgeStaleStatsForAllShows()})
 * and on-demand from the {@code purgeStats} GraphQL mutation.
 *
 * <p>Pure in-memory test: no Spring context, no Mongo, ~10 ms per case.
 * Builds {@link Show} objects with mixed-age stats and asserts that only
 * entries older than 18 months are removed.
 */
@ExtendWith(MockitoExtension.class)
class PurgeStatsForShowTest {

    @Mock private EmailUtil emailUtil;
    @Mock private AuthUtil authUtil;
    @Mock private ShowRepository showRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private ClientUtil clientUtil;
    @Mock private ViewerPageService viewerPageService;

    @InjectMocks private GraphQLMutationService service;

    private static LocalDateTime stale() {
        // Comfortably older than the 18-month cutoff.
        return LocalDateTime.now().minusMonths(20);
    }

    private static LocalDateTime recent() {
        return LocalDateTime.now().minusDays(30);
    }

    private static Show showWithStats(Stat stats) {
        return Show.builder().showToken("tok").stats(stats).build();
    }

    @Test
    void purgeStatsForShow_removesPageStatsOlderThan18Months() {
        Stat.Page stalePage = Stat.Page.builder().ip("1.1.1.1").dateTime(stale()).build();
        Stat.Page recentPage = Stat.Page.builder().ip("2.2.2.2").dateTime(recent()).build();
        Stat stats = Stat.builder()
                .page(new ArrayList<>(List.of(stalePage, recentPage)))
                .jukebox(new ArrayList<>())
                .voting(new ArrayList<>())
                .votingWin(new ArrayList<>())
                .build();
        Show show = showWithStats(stats);

        service.purgeStatsForShow(show);

        assertThat(show.getStats().getPage()).containsExactly(recentPage);
        verify(showRepository, times(1)).save(show);
    }

    @Test
    void purgeStatsForShow_removesJukeboxVotingVotingWinStats_sameWay() {
        Stat.Jukebox staleJ = Stat.Jukebox.builder().name("oldSeq").dateTime(stale()).build();
        Stat.Jukebox recentJ = Stat.Jukebox.builder().name("newSeq").dateTime(recent()).build();
        Stat.Voting staleV = Stat.Voting.builder().name("oldSeq").dateTime(stale()).build();
        Stat.Voting recentV = Stat.Voting.builder().name("newSeq").dateTime(recent()).build();
        Stat.VotingWin staleW = Stat.VotingWin.builder().name("oldSeq").total(3).dateTime(stale()).build();
        Stat.VotingWin recentW = Stat.VotingWin.builder().name("newSeq").total(5).dateTime(recent()).build();

        Stat stats = Stat.builder()
                .page(new ArrayList<>())
                .jukebox(new ArrayList<>(List.of(staleJ, recentJ)))
                .voting(new ArrayList<>(List.of(staleV, recentV)))
                .votingWin(new ArrayList<>(List.of(staleW, recentW)))
                .build();
        Show show = showWithStats(stats);

        service.purgeStatsForShow(show);

        assertThat(show.getStats().getJukebox()).containsExactly(recentJ);
        assertThat(show.getStats().getVoting()).containsExactly(recentV);
        assertThat(show.getStats().getVotingWin()).containsExactly(recentW);
        verify(showRepository, times(1)).save(show);
    }

    @Test
    void purgeStatsForShow_removesAcrossAllFourLists_savesOnce() {
        Stat stats = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("a").dateTime(stale()).build(),
                        Stat.Page.builder().ip("b").dateTime(recent()).build())))
                .jukebox(new ArrayList<>(List.of(
                        Stat.Jukebox.builder().name("a").dateTime(stale()).build())))
                .voting(new ArrayList<>(List.of(
                        Stat.Voting.builder().name("a").dateTime(stale()).build())))
                .votingWin(new ArrayList<>(List.of(
                        Stat.VotingWin.builder().name("a").total(1).dateTime(stale()).build())))
                .build();
        Show show = showWithStats(stats);

        service.purgeStatsForShow(show);

        assertThat(show.getStats().getPage()).hasSize(1);
        assertThat(show.getStats().getJukebox()).isEmpty();
        assertThat(show.getStats().getVoting()).isEmpty();
        assertThat(show.getStats().getVotingWin()).isEmpty();
        // if-changed-save: only one persistence call even though four lists changed.
        verify(showRepository, times(1)).save(show);
    }

    @Test
    void purgeStatsForShow_doesNotSave_whenNothingChanged() {
        Stat stats = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("a").dateTime(recent()).build())))
                .jukebox(new ArrayList<>(List.of(
                        Stat.Jukebox.builder().name("a").dateTime(recent()).build())))
                .voting(new ArrayList<>(List.of(
                        Stat.Voting.builder().name("a").dateTime(recent()).build())))
                .votingWin(new ArrayList<>(List.of(
                        Stat.VotingWin.builder().name("a").total(1).dateTime(recent()).build())))
                .build();
        Show show = showWithStats(stats);

        service.purgeStatsForShow(show);

        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void purgeStatsForShow_handlesBoundaryAtExactlyEighteenMonths() {
        // The cut-off uses isBefore(now.minusMonths(18)). An entry timestamped
        // exactly at the cut-off (or slightly after) must NOT be removed.
        Stat.Page boundary = Stat.Page.builder()
                .ip("boundary")
                .dateTime(LocalDateTime.now().minusMonths(18).plusSeconds(5))
                .build();
        Stat stats = Stat.builder()
                .page(new ArrayList<>(List.of(boundary)))
                .jukebox(new ArrayList<>())
                .voting(new ArrayList<>())
                .votingWin(new ArrayList<>())
                .build();
        Show show = showWithStats(stats);

        service.purgeStatsForShow(show);

        assertThat(show.getStats().getPage()).containsExactly(boundary);
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void purgeStatsForShow_handlesNullStats() {
        Show show = Show.builder().showToken("tok").stats(null).build();

        assertThatCode(() -> service.purgeStatsForShow(show)).doesNotThrowAnyException();
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void purgeStatsForShow_handlesNullSubLists() {
        // Stat object exists but each sub-list is null — the production code
        // guards every list with a null check.
        Stat stats = Stat.builder().build();
        Show show = showWithStats(stats);

        assertThatCode(() -> service.purgeStatsForShow(show)).doesNotThrowAnyException();
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void purgeStatsForShow_handlesEmptyStatsLists() {
        Stat stats = Stat.builder()
                .page(new ArrayList<>())
                .jukebox(new ArrayList<>())
                .voting(new ArrayList<>())
                .votingWin(new ArrayList<>())
                .build();
        Show show = showWithStats(stats);

        service.purgeStatsForShow(show);

        verify(showRepository, never()).save(any(Show.class));
    }
}
