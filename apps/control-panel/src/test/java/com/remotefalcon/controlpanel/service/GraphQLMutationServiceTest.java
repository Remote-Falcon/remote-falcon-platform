package com.remotefalcon.controlpanel.service;

import com.mailersend.sdk.MailerSendResponse;
import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.EmailUtil;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.SequenceGroup;
import com.remotefalcon.library.models.ShowNotification;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.UserProfile;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.models.Vote;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link GraphQLMutationService} mutations beyond what
 * {@link RequestApiAccessTest}, {@link RefreshApiSecretTest}, and
 * {@link PurgeStatsForShowTest} already pin down.
 *
 * <p>Each test mocks repository + email + auth so the focus is on the
 * mutation's business logic: success path, not-found path, validation,
 * and any rollback / save semantics worth keeping honest.
 */
@ExtendWith(MockitoExtension.class)
class GraphQLMutationServiceTest {

    private static final String SHOW_TOKEN = "tok-test";

    @Mock private EmailUtil emailUtil;
    @Mock private AuthUtil authUtil;
    @Mock private ShowRepository showRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private ClientUtil clientUtil;
    @Mock private ViewerPageService viewerPageService;

    @InjectMocks private GraphQLMutationService service;

    private void stubAuth() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
    }

    private static MailerSendResponse mailer(int status) {
        MailerSendResponse r = new MailerSendResponse();
        r.responseStatusCode = status;
        return r;
    }

    // ---- signUp ----

    @Test
    void signUp_createsShow_andSendsVerifyEmail_whenAutoValidateDisabled() {
        ReflectionTestUtils.setField(service, "autoValidateEmail", Boolean.FALSE);

        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"new@example.com", "password"});
        when(clientUtil.getClientIp(req)).thenReturn("203.0.113.1");

        when(showRepository.findByEmailCollation("new@example.com")).thenReturn(Optional.empty());
        when(showRepository.findByShowSubdomain("my show".replaceAll("\\s", "").toLowerCase())).thenReturn(Optional.empty());
        when(showRepository.findByShowToken(anyString())).thenReturn(Optional.empty());
        when(emailUtil.sendSignUpEmail(any(Show.class))).thenReturn(mailer(202));

        Boolean ok = service.signUp("Matt", "S", "My Show");

        assertThat(ok).isTrue();
        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        Show s = saved.getValue();
        assertThat(s.getEmail()).isEqualTo("new@example.com");
        assertThat(s.getShowName()).isEqualTo("My Show");
        assertThat(s.getShowSubdomain()).isEqualTo("myshow");
        // Auto-validate off — emailVerified mirrors that.
        assertThat(s.getEmailVerified()).isFalse();
        // Password is bcrypt-encoded.
        assertThat(new BCryptPasswordEncoder().matches("password", s.getPassword())).isTrue();
        // Default page list initialized.
        assertThat(s.getPages()).hasSize(1);
        verify(emailUtil, times(1)).sendSignUpEmail(any(Show.class));
    }

    @Test
    void signUp_throwsEmailCannotBeSent_whenAutoValidateOffAndMailerReturnsNon202() {
        ReflectionTestUtils.setField(service, "autoValidateEmail", Boolean.FALSE);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"new@example.com", "pw"});
        when(clientUtil.getClientIp(req)).thenReturn("1.1.1.1");
        when(showRepository.findByEmailCollation(anyString())).thenReturn(Optional.empty());
        when(showRepository.findByShowSubdomain(anyString())).thenReturn(Optional.empty());
        when(showRepository.findByShowToken(anyString())).thenReturn(Optional.empty());
        when(emailUtil.sendSignUpEmail(any(Show.class))).thenReturn(mailer(500));

        assertThatThrownBy(() -> service.signUp("F", "L", "MyShow"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.EMAIL_CANNOT_BE_SENT.name());

        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void signUp_skipsEmail_whenAutoValidateEnabled() {
        ReflectionTestUtils.setField(service, "autoValidateEmail", Boolean.TRUE);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"a@b.c", "pw"});
        when(clientUtil.getClientIp(req)).thenReturn("1.1.1.1");
        when(showRepository.findByEmailCollation(anyString())).thenReturn(Optional.empty());
        when(showRepository.findByShowSubdomain(anyString())).thenReturn(Optional.empty());
        when(showRepository.findByShowToken(anyString())).thenReturn(Optional.empty());

        Boolean ok = service.signUp("F", "L", "Auto");
        assertThat(ok).isTrue();

        verify(emailUtil, never()).sendSignUpEmail(any(Show.class));
        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        assertThat(saved.getValue().getEmailVerified()).isTrue();
    }

    @Test
    void signUp_throwsShowExists_whenEmailAlreadyRegistered() {
        ReflectionTestUtils.setField(service, "autoValidateEmail", Boolean.TRUE);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"dup@example.com", "pw"});
        when(showRepository.findByEmailCollation("dup@example.com"))
                .thenReturn(Optional.of(Show.builder().build()));

        assertThatThrownBy(() -> service.signUp("F", "L", "Dup"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_EXISTS.name());

        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void signUp_throwsShowExists_whenSubdomainAlreadyTaken() {
        ReflectionTestUtils.setField(service, "autoValidateEmail", Boolean.TRUE);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"new@example.com", "pw"});
        when(showRepository.findByEmailCollation(anyString())).thenReturn(Optional.empty());
        when(showRepository.findByShowSubdomain("dupshow"))
                .thenReturn(Optional.of(Show.builder().build()));

        assertThatThrownBy(() -> service.signUp("F", "L", "Dup Show"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_EXISTS.name());
    }

    @Test
    void signUp_throwsUnexpected_whenNoBasicCreds() {
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(null);

        assertThatThrownBy(() -> service.signUp("F", "L", "X"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());
    }

    // ---- forgotPassword ----

    @Test
    void forgotPassword_setsTokenAndExpiry_sendsEmail_andReturnsTrue() {
        Show show = Show.builder().email("u@e.com").showName("X").showToken("t").build();
        when(showRepository.findByEmailCollation("u@e.com")).thenReturn(Optional.of(show));
        when(emailUtil.sendForgotPasswordEmail(any(Show.class), anyString())).thenReturn(mailer(202));

        assertThat(service.forgotPassword("u@e.com")).isTrue();
        assertThat(show.getPasswordResetLink()).isNotNull().hasSize(25);
        assertThat(show.getPasswordResetExpiry()).isAfter(LocalDateTime.now().plusHours(23));
        verify(showRepository).save(show);
    }

    @Test
    void forgotPassword_throwsEmailCannotBeSent_onNon202() {
        Show show = Show.builder().email("u@e.com").showName("X").build();
        when(showRepository.findByEmailCollation("u@e.com")).thenReturn(Optional.of(show));
        when(emailUtil.sendForgotPasswordEmail(any(Show.class), anyString())).thenReturn(mailer(500));

        assertThatThrownBy(() -> service.forgotPassword("u@e.com"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.EMAIL_CANNOT_BE_SENT.name());
    }

    @Test
    void forgotPassword_throwsUnauthorized_whenEmailNotFound() {
        when(showRepository.findByEmailCollation("nope@x.com")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.forgotPassword("nope@x.com"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    // ---- verifyEmail ----

    @Test
    void verifyEmail_setsFlagAndSaves() {
        Show show = Show.builder().showToken("tok").emailVerified(false).build();
        when(showRepository.findByShowToken("tok")).thenReturn(Optional.of(show));

        assertThat(service.verifyEmail("tok")).isTrue();
        assertThat(show.getEmailVerified()).isTrue();
        verify(showRepository).save(show);
    }

    @Test
    void verifyEmail_throwsUnauthorized_whenTokenNotFound() {
        when(showRepository.findByShowToken("bad")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.verifyEmail("bad"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    // ---- updateUserProfile ----

    @Test
    void updateUserProfile_setsProfileAndSaves() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        UserProfile profile = UserProfile.builder().firstName("Up").lastName("Dated").build();
        assertThat(service.updateUserProfile(profile)).isTrue();
        assertThat(show.getUserProfile()).isSameAs(profile);
        verify(showRepository).save(show);
    }

    @Test
    void updateUserProfile_throwsUnexpected_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateUserProfile(UserProfile.builder().build()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());
    }

    // ---- updateShow ----

    @Test
    void updateShow_emailUnchanged_nameUnchanged_doesNothingButReturnsTrue() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .email("same@x.com").showName("Same Name").showSubdomain("samename").build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThat(service.updateShow("same@x.com", "Same Name")).isTrue();
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void updateShow_emailChanged_resendsVerificationAndUnsetsVerified() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .email("old@x.com").showName("Same").showSubdomain("same")
                .emailVerified(true).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(emailUtil.sendSignUpEmail(any(Show.class))).thenReturn(mailer(202));

        assertThat(service.updateShow("new@x.com", "Same")).isTrue();
        assertThat(show.getEmail()).isEqualTo("new@x.com");
        assertThat(show.getEmailVerified()).isFalse();
        verify(showRepository).save(show);
    }

    @Test
    void updateShow_emailChangeMailerFails_throwsEmailCannotBeSent() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .email("old@x.com").showName("Same").showSubdomain("same").emailVerified(true).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(emailUtil.sendSignUpEmail(any(Show.class))).thenReturn(mailer(500));

        assertThatThrownBy(() -> service.updateShow("new@x.com", "Same"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.EMAIL_CANNOT_BE_SENT.name());
    }

    @Test
    void updateShow_nameChange_updatesSubdomain_whenAvailable() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .email("same@x.com").showName("Old Name").showSubdomain("oldname").build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(showRepository.findByShowSubdomain("brandnew")).thenReturn(Optional.empty());

        assertThat(service.updateShow("same@x.com", "Brand New")).isTrue();
        assertThat(show.getShowName()).isEqualTo("Brand New");
        assertThat(show.getShowSubdomain()).isEqualTo("brandnew");
        verify(showRepository).save(show);
    }

    @Test
    void updateShow_nameChange_throwsShowExists_whenSubdomainTaken() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .email("same@x.com").showName("Old").showSubdomain("old").build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(showRepository.findByShowSubdomain("taken"))
                .thenReturn(Optional.of(Show.builder().build()));

        assertThatThrownBy(() -> service.updateShow("same@x.com", "Taken"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_EXISTS.name());
    }

    // ---- updatePreferences (wrappedShareToken token-management quirks) ----

    @Test
    void updatePreferences_generatesShareToken_whenFlippingPublicTrue() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .preferences(Preference.builder()
                        .viewerControlEnabled(false)
                        .wrappedPublic(false)
                        .build())
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        Preference newPrefs = Preference.builder()
                .viewerControlEnabled(false)
                .wrappedPublic(true)
                .build();
        assertThat(service.updatePreferences(newPrefs)).isTrue();
        assertThat(newPrefs.getWrappedShareToken()).isNotNull().isNotEmpty();
    }

    @Test
    void updatePreferences_preservesExistingShareToken_whenStillPublic() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .preferences(Preference.builder()
                        .viewerControlEnabled(false)
                        .wrappedPublic(true)
                        .wrappedShareToken("EXISTING-TOKEN")
                        .build())
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        Preference newPrefs = Preference.builder()
                .viewerControlEnabled(false)
                .wrappedPublic(true)
                .build();
        service.updatePreferences(newPrefs);
        assertThat(newPrefs.getWrappedShareToken()).isEqualTo("EXISTING-TOKEN");
    }

    @Test
    void updatePreferences_resetsSequencesPlayed_whenViewerControlEnabledFlips() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .preferences(Preference.builder().viewerControlEnabled(false).sequencesPlayed(42).build())
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        Preference newPrefs = Preference.builder()
                .viewerControlEnabled(true).sequencesPlayed(99).build();
        service.updatePreferences(newPrefs);

        // The mutation should have force-reset the counter to 0.
        assertThat(newPrefs.getSequencesPlayed()).isZero();
    }

    @Test
    void updatePreferences_throwsUnexpected_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updatePreferences(Preference.builder().build()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());
    }

    // ---- updatePages / updatePsaSequences / updateSequences / updateSequenceGroups ----

    @Test
    void updatePages_setsListAndSaves_andReturnsPersistedPages() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        List<ViewerPage> pages = List.of(ViewerPage.builder().name("p1").active(true).html("h").build());
        List<ViewerPage> returned = service.updatePages(pages);

        // Contract: the service returns the persisted page list so the UI
        // can dispatch authoritative state including server-minted pageIds
        // (populated inside ViewerPageService.prepareForWrite, which is
        // mocked in this test — its own coverage lives in
        // ViewerPageServiceTest). Same list reference because prepareForWrite
        // mutates in place.
        assertThat(returned).isNotNull();
        assertThat(returned).isSameAs(pages);
        assertThat(show.getPages()).isSameAs(pages);
    }

    @Test
    void updatePsaSequences_setsListAndSaves() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        List<PsaSequence> psas = List.of(PsaSequence.builder().name("psa-1").build());
        assertThat(service.updatePsaSequences(psas)).isTrue();
        assertThat(show.getPsaSequences()).isEqualTo(psas);
    }

    @Test
    void updateSequences_dedupesViaSet_andSaves() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        Sequence a = Sequence.builder().name("alpha").order(1).build();
        Sequence b = Sequence.builder().name("beta").order(2).build();
        // Dup with identical fields — Set should collapse the two.
        List<Sequence> seqs = new ArrayList<>(List.of(a, b, a));
        service.updateSequences(seqs);
        assertThat(show.getSequences()).hasSize(2);
    }

    @Test
    void updateSequenceGroups_setsListAndSaves() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        List<SequenceGroup> groups = List.of(SequenceGroup.builder().name("g1").build());
        assertThat(service.updateSequenceGroups(groups)).isTrue();
        assertThat(show.getSequenceGroups()).isEqualTo(groups);
    }

    // ---- deleteAccount ----

    @Test
    void deleteAccount_invokesDeleteByShowToken() {
        stubAuth();
        assertThat(service.deleteAccount()).isTrue();
        verify(showRepository).deleteByShowToken(SHOW_TOKEN);
    }

    // ---- playSequenceFromControlPanel ----

    @Test
    void playSequenceFromControlPanel_jukeboxMode_addsOwnerRequest() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .preferences(Preference.builder().viewerControlMode(ViewerControlMode.JUKEBOX).build())
                .requests(new ArrayList<>())
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        Sequence seq = Sequence.builder().name("Carol").displayName("Carol of the Bells").build();
        assertThat(service.playSequenceFromControlPanel(seq)).isTrue();
        assertThat(show.getRequests()).hasSize(1);
        assertThat(show.getRequests().get(0).getOwnerRequested()).isTrue();
        assertThat(show.getRequests().get(0).getPosition()).isZero();
    }

    @Test
    void playSequenceFromControlPanel_jukeboxMode_throws_whenOwnerAlreadyRequested() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .preferences(Preference.builder().viewerControlMode(ViewerControlMode.JUKEBOX).build())
                .requests(new ArrayList<>(List.of(
                        Request.builder().ownerRequested(true).position(1).build())))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.playSequenceFromControlPanel(Sequence.builder().name("S").build()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.OWNER_REQUESTED.name());
    }

    @Test
    void playSequenceFromControlPanel_votingMode_addsOwnerVote_with1000Votes() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .preferences(Preference.builder().viewerControlMode(ViewerControlMode.VOTING).build())
                .votes(new ArrayList<>())
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        Sequence seq = Sequence.builder().name("X").build();
        assertThat(service.playSequenceFromControlPanel(seq)).isTrue();
        assertThat(show.getVotes()).hasSize(1);
        Vote v = show.getVotes().get(0);
        assertThat(v.getOwnerVoted()).isTrue();
        assertThat(v.getVotes()).isEqualTo(1000);
    }

    @Test
    void playSequenceFromControlPanel_votingMode_throws_whenOwnerAlreadyVoted() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .preferences(Preference.builder().viewerControlMode(ViewerControlMode.VOTING).build())
                .votes(new ArrayList<>(List.of(Vote.builder().ownerVoted(true).votes(1000).build())))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.playSequenceFromControlPanel(Sequence.builder().name("Y").build()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.OWNER_REQUESTED.name());
    }

    // ---- deleteSingleRequest / deleteNowPlaying / deleteAllRequests / resetAllVotes ----

    @Test
    void deleteSingleRequest_removesByPosition_reindexes_andSetsPlayingNextToFirstRemaining() {
        stubAuth();
        Sequence s1 = Sequence.builder().name("a").displayName("Alpha").build();
        Sequence s2 = Sequence.builder().name("b").displayName("Beta").build();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>(List.of(
                        Request.builder().sequence(s1).position(1).build(),
                        Request.builder().sequence(s2).position(2).build())))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        service.deleteSingleRequest(1);
        assertThat(show.getRequests()).hasSize(1);
        // Position renumbered to 1.
        assertThat(show.getRequests().get(0).getPosition()).isEqualTo(1);
        // PlayingNext == first remaining displayName.
        assertThat(show.getPlayingNext()).isEqualTo("Beta");
    }

    @Test
    void deleteSingleRequest_clearsPlayingNext_whenLastRequestGone() {
        stubAuth();
        Sequence s1 = Sequence.builder().name("a").displayName("Alpha").build();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .playingNext("Alpha")
                .requests(new ArrayList<>(List.of(
                        Request.builder().sequence(s1).position(1).build())))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        service.deleteSingleRequest(1);
        assertThat(show.getRequests()).isEmpty();
        assertThat(show.getPlayingNext()).isEmpty();
    }

    @Test
    void deleteNowPlaying_clearsAllThreeNowPlayingFields() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .playingNow("now").playingNext("nxt").playingNextFromSchedule("sched").build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        service.deleteNowPlaying();
        assertThat(show.getPlayingNow()).isEmpty();
        assertThat(show.getPlayingNext()).isEmpty();
        assertThat(show.getPlayingNextFromSchedule()).isEmpty();
    }

    @Test
    void deleteAllRequests_clearsRequests_andResetsVisibilityCountsOnSequencesAndGroups() {
        stubAuth();
        Sequence s = Sequence.builder().name("a").visibilityCount(5).build();
        SequenceGroup g = SequenceGroup.builder().name("g").visibilityCount(7).build();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .requests(new ArrayList<>(List.of(Request.builder().build())))
                .sequences(new ArrayList<>(List.of(s)))
                .sequenceGroups(new ArrayList<>(List.of(g)))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        service.deleteAllRequests();

        assertThat(show.getRequests()).isEmpty();
        assertThat(show.getSequences().get(0).getVisibilityCount()).isZero();
        assertThat(show.getSequenceGroups().get(0).getVisibilityCount()).isZero();
    }

    @Test
    void resetAllVotes_clearsVotes_andResetsVisibilityCounts() {
        stubAuth();
        Sequence s = Sequence.builder().name("a").visibilityCount(5).build();
        SequenceGroup g = SequenceGroup.builder().name("g").visibilityCount(2).build();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .votes(new ArrayList<>(List.of(Vote.builder().votes(3).build())))
                .sequences(new ArrayList<>(List.of(s)))
                .sequenceGroups(new ArrayList<>(List.of(g)))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        service.resetAllVotes();

        assertThat(show.getVotes()).isEmpty();
        assertThat(show.getSequences().get(0).getVisibilityCount()).isZero();
        assertThat(show.getSequenceGroups().get(0).getVisibilityCount()).isZero();
    }

    // ---- purgeStats / deleteStatsWithinRange ----

    @Test
    void purgeStats_delegatesToPurgeStatsForShow_onCurrentShow() {
        stubAuth();
        Stat stat = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("1").dateTime(LocalDateTime.now().minusMonths(20)).build())))
                .jukebox(new ArrayList<>()).voting(new ArrayList<>()).votingWin(new ArrayList<>())
                .build();
        Show show = Show.builder().showToken(SHOW_TOKEN).stats(stat).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThat(service.purgeStats()).isTrue();
        assertThat(show.getStats().getPage()).isEmpty();
    }

    @Test
    void deleteStatsWithinRange_dropsEntriesStrictlyInsideTheWindow() {
        stubAuth();
        ZoneId tz = ZoneId.of("America/Chicago");
        LocalDateTime in = ZonedDateTime.of(2025, 10, 15, 12, 0, 0, 0, tz).toLocalDateTime();
        LocalDateTime out = ZonedDateTime.of(2024, 6, 1, 12, 0, 0, 0, tz).toLocalDateTime();

        Stat stat = Stat.builder()
                .page(new ArrayList<>(List.of(
                        Stat.Page.builder().ip("in").dateTime(in).build(),
                        Stat.Page.builder().ip("out").dateTime(out).build())))
                .jukebox(new ArrayList<>()).voting(new ArrayList<>()).votingWin(new ArrayList<>())
                .build();
        Show show = Show.builder().showToken(SHOW_TOKEN).stats(stat).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        long start = ZonedDateTime.of(2025, 10, 1, 0, 0, 0, 0, tz).toInstant().toEpochMilli();
        long end = ZonedDateTime.of(2025, 10, 31, 0, 0, 0, 0, tz).toInstant().toEpochMilli();

        assertThat(service.deleteStatsWithinRange(start, end, "America/Chicago")).isTrue();

        // The in-window entry was removed; the out-of-window entry kept.
        assertThat(show.getStats().getPage()).extracting(Stat.Page::getIp).containsExactly("out");
    }

    @Test
    void deleteStatsWithinRange_throwsShowNotFound_whenMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.deleteStatsWithinRange(1L, 2L, "UTC"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- adminUpdateShow ----

    @Test
    void adminUpdateShow_preservesExistingIdAndPassword_onSave() {
        Show existing = Show.builder().id("mongo-id-1").password("hashed").showToken("tok-admin").build();
        Show incoming = Show.builder().showToken("tok-admin").email("changed@x.com").password("attack-pw").build();
        when(showRepository.findByShowToken("tok-admin")).thenReturn(Optional.of(existing));

        assertThat(service.adminUpdateShow(incoming)).isTrue();
        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo("mongo-id-1");
        // Password from DB, NOT what the caller tried to inject.
        assertThat(saved.getValue().getPassword()).isEqualTo("hashed");
        assertThat(saved.getValue().getEmail()).isEqualTo("changed@x.com");
    }

    @Test
    void adminUpdateShow_noop_whenShowTokenMissing_andReturnsTrue() {
        Show incoming = Show.builder().showToken("nope").build();
        when(showRepository.findByShowToken("nope")).thenReturn(Optional.empty());
        assertThat(service.adminUpdateShow(incoming)).isTrue();
        verify(showRepository, never()).save(any(Show.class));
    }

    // ---- notification mutations ----

    @Test
    void createNotification_assignsUuid_createdDate_andAdminType() {
        Notification n = Notification.builder().subject("S").preview("P").message("M").build();

        assertThat(service.createNotification(n)).isTrue();
        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(saved.capture());
        assertThat(saved.getValue().getUuid()).isNotNull().isNotEmpty();
        assertThat(saved.getValue().getCreatedDate()).isNotNull();
        assertThat(saved.getValue().getType()).isEqualTo(NotificationType.ADMIN);
    }

    @Test
    void deleteNotification_delegatesToRepository() {
        assertThat(service.deleteNotification("uuid-1")).isTrue();
        verify(notificationRepository).deleteByUuid("uuid-1");
    }

    @Test
    void updateNotification_updatesUserFacingFields_keepsUuidAndCreatedDate() {
        LocalDateTime created = LocalDateTime.now().minusDays(1);
        Notification existing = Notification.builder()
                .uuid("uuid-1").type(NotificationType.ADMIN).createdDate(created)
                .subject("old-s").preview("old-p").message("old-m").link("old-l").build();
        when(notificationRepository.findByUuid("uuid-1")).thenReturn(Optional.of(existing));

        Notification incoming = Notification.builder()
                .subject("new-s").preview("new-p").message("new-m").link("new-l").build();
        assertThat(service.updateNotification("uuid-1", incoming)).isTrue();

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(saved.capture());
        Notification s = saved.getValue();
        // Immutable fields preserved (issue #PRD-004).
        assertThat(s.getUuid()).isEqualTo("uuid-1");
        assertThat(s.getType()).isEqualTo(NotificationType.ADMIN);
        assertThat(s.getCreatedDate()).isEqualTo(created);
        // Mutable user-facing fields updated.
        assertThat(s.getSubject()).isEqualTo("new-s");
        assertThat(s.getPreview()).isEqualTo("new-p");
        assertThat(s.getMessage()).isEqualTo("new-m");
        assertThat(s.getLink()).isEqualTo("new-l");
    }

    @Test
    void updateNotification_throws_whenUuidUnknown() {
        when(notificationRepository.findByUuid("missing")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateNotification("missing", Notification.builder().build()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());
    }

    @Test
    void createNotificationForUser_appendsToShowNotifications() {
        Show show = Show.builder().showSubdomain("sub").showNotifications(null).build();
        when(showRepository.findByShowSubdomain("sub")).thenReturn(Optional.of(show));

        Notification n = Notification.builder().subject("S").preview("P").message("M").build();
        assertThat(service.createNotificationForUser(n, "sub")).isTrue();
        // List was lazily created, with one entry.
        assertThat(show.getShowNotifications()).hasSize(1);
        ShowNotification sn = show.getShowNotifications().get(0);
        assertThat(sn.getNotification().getSubject()).isEqualTo("S");
        assertThat(sn.getNotification().getType()).isEqualTo(NotificationType.USER);
        assertThat(sn.getRead()).isFalse();
        assertThat(sn.getDeleted()).isFalse();
        verify(showRepository).save(show);
    }

    @Test
    void createNotificationForUser_returnsFalse_whenSubdomainUnknown() {
        when(showRepository.findByShowSubdomain("missing")).thenReturn(Optional.empty());
        assertThat(service.createNotificationForUser(Notification.builder().build(), "missing")).isFalse();
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void buildShowNotification_initializesEmptyList_thenAppends() {
        Show show = Show.builder().showNotifications(null).build();
        Notification n = Notification.builder().subject("s").build();
        service.buildShowNotification(n, show, NotificationType.FPP_HEALTH);
        assertThat(show.getShowNotifications()).hasSize(1);
        assertThat(show.getShowNotifications().get(0).getNotification().getType())
                .isEqualTo(NotificationType.FPP_HEALTH);
    }
}
