package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.ShowsOnAMap;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.NotificationPage;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.ShowNotification;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link GraphQLQueryService}. Covers signIn (bcrypt
 * matching + email-verified gate + token mint), impersonateShow,
 * getShowsAutoSuggest, getShow (PSA defaulting + request/sequence
 * sorting), showsOnAMap (opt-in projection), and the notification
 * listing queries.
 */
@ExtendWith(MockitoExtension.class)
class GraphQLQueryServiceTest {

    private static final String SHOW_TOKEN = "tok-1";

    @Mock private AuthUtil authUtil;
    @Mock private ClientUtil clientUtil;
    @Mock private ShowRepository showRepository;
    @Mock private NotificationRepository notificationRepository;

    @InjectMocks private GraphQLQueryService service;

    private static String basic(String email, String pw) {
        return "Basic " + Base64.getEncoder().encodeToString((email + ":" + pw).getBytes(StandardCharsets.UTF_8));
    }

    private static Show showWithBcrypt(String pw, boolean verified) {
        String hashed = new BCryptPasswordEncoder().encode(pw);
        return Show.builder()
                .showToken(SHOW_TOKEN)
                .email("user@example.com")
                .password(hashed)
                .emailVerified(verified)
                // signIn -> checkFields requires preferences to be non-null
                // (it reads viewerControlMode). Tests that want to exercise
                // null-preferences must build their own variant.
                .preferences(Preference.builder().viewerControlMode(ViewerControlMode.JUKEBOX).build())
                .stats(com.remotefalcon.library.models.Stat.builder().build())
                .requests(new ArrayList<>())
                .votes(new ArrayList<>())
                .build();
    }

    // ---- signIn ----

    @Test
    void signIn_returnsShowWithJwt_andUpdatesLastLogin_onCorrectPassword() {
        Show show = showWithBcrypt("hunter2", true);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"user@example.com", "hunter2"});
        when(clientUtil.getClientIp(req)).thenReturn("198.51.100.1");
        when(showRepository.findByEmailCollation("user@example.com")).thenReturn(Optional.of(show));
        when(authUtil.signJwt(any(Show.class))).thenReturn("fake-jwt");

        Show signed = service.signIn();

        assertThat(signed.getServiceToken()).isEqualTo("fake-jwt");
        assertThat(show.getLastLoginIp()).isEqualTo("198.51.100.1");
        assertThat(show.getLastLoginDate()).isNotNull();
        // 2-year session-extend
        assertThat(show.getExpireDate()).isAfter(LocalDateTime.now().plusYears(1));
        verify(showRepository, times(1)).save(show);
    }

    @Test
    void signIn_throwsEmailNotVerified_whenPasswordMatchesButEmailUnverified() {
        Show show = showWithBcrypt("pw", false);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"user@example.com", "pw"});
        when(showRepository.findByEmailCollation("user@example.com")).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.signIn())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.EMAIL_NOT_VERIFIED.name());

        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void signIn_throwsShowNotFound_whenEmailMissing() {
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"nobody@x.com", "pw"});
        when(showRepository.findByEmailCollation("nobody@x.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.signIn())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void signIn_throwsUnauthorized_whenPasswordDoesNotMatch() {
        Show show = showWithBcrypt("real-pw", true);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"user@example.com", "wrong"});
        when(showRepository.findByEmailCollation("user@example.com")).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.signIn())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    @Test
    void signIn_throwsUnauthorized_whenNoBasicAuthHeader() {
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(null);

        assertThatThrownBy(() -> service.signIn())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    @Test
    void signIn_seedsDefaults_whenPreferenceAndStatsMissing() {
        // checkFields() runs on every successful sign-in to backfill defaults
        // for legacy documents.
        Show show = showWithBcrypt("pw", true);
        // Force the null-defaults branches.
        show.setPreferences(Preference.builder().build()); // viewerControlMode null
        show.setStats(null);
        show.setRequests(null);
        show.setVotes(null);
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"user@example.com", "pw"});
        when(clientUtil.getClientIp(req)).thenReturn("1.1.1.1");
        when(showRepository.findByEmailCollation("user@example.com")).thenReturn(Optional.of(show));
        when(authUtil.signJwt(any(Show.class))).thenReturn("jwt");

        service.signIn();

        assertThat(show.getPreferences().getViewerControlMode()).isEqualTo(ViewerControlMode.JUKEBOX);
        assertThat(show.getStats()).isNotNull();
        assertThat(show.getRequests()).isNotNull();
        assertThat(show.getVotes()).isNotNull();
    }

    // ---- impersonateShow ----

    @Test
    void impersonateShow_returnsShowWithJwt() {
        Show show = Show.builder().showToken(SHOW_TOKEN).showSubdomain("sub").build();
        when(showRepository.findByShowSubdomain("sub")).thenReturn(Optional.of(show));
        when(authUtil.signJwt(show)).thenReturn("impersonate-jwt");

        Show imp = service.impersonateShow("sub");
        assertThat(imp.getServiceToken()).isEqualTo("impersonate-jwt");
    }

    @Test
    void impersonateShow_throws_whenSubdomainMissing() {
        when(showRepository.findByShowSubdomain("missing")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.impersonateShow("missing"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- getShowsAutoSuggest ----

    @Test
    void getShowsAutoSuggest_returnsEmpty_onBlankInput() {
        assertThat(service.getShowsAutoSuggest("")).isEmpty();
        assertThat(service.getShowsAutoSuggest(null)).isEmpty();
        assertThat(service.getShowsAutoSuggest("   ")).isEmpty();
        verify(showRepository, never()).findTop25ByShowNameContainingIgnoreCase(any());
    }

    @Test
    void getShowsAutoSuggest_mapsShowNames() {
        // Note: findTop25... returns the ShowNameOnly projection (a one-method
        // interface). The service code calls .getShowName() on each row, but
        // the lambda goes through Show::getShowName style — we just need a
        // List<ShowNameOnly> impl that returns the names we want.
        com.remotefalcon.controlpanel.repository.ShowNameOnly a = () -> "Holiday Lights";
        com.remotefalcon.controlpanel.repository.ShowNameOnly b = () -> "Christmas Lights";
        when(showRepository.findTop25ByShowNameContainingIgnoreCase("lights"))
                .thenReturn(List.of(a, b));

        assertThat(service.getShowsAutoSuggest("lights"))
                .containsExactly("Holiday Lights", "Christmas Lights");
    }

    // ---- verifyPasswordResetLink ----

    @Test
    void verifyPasswordResetLink_setsServiceToken_whenLinkValid() {
        Show show = Show.builder().showToken(SHOW_TOKEN).build();
        when(showRepository.findByPasswordResetLinkAndPasswordResetExpiryGreaterThan(
                org.mockito.ArgumentMatchers.eq("link"), any())).thenReturn(Optional.of(show));
        when(authUtil.signJwt(show)).thenReturn("reset-jwt");

        Show r = service.verifyPasswordResetLink("link");
        assertThat(r.getServiceToken()).isEqualTo("reset-jwt");
    }

    @Test
    void verifyPasswordResetLink_throwsUnauthorized_whenLinkInvalidOrExpired() {
        when(showRepository.findByPasswordResetLinkAndPasswordResetExpiryGreaterThan(
                org.mockito.ArgumentMatchers.eq("bad"), any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.verifyPasswordResetLink("bad"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    // ---- getShow ----

    @Test
    void getShow_sortsActiveFirstByOrder_andRequestsByPosition_andBackfillsPsaLastPlayed() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());

        Sequence inactive = Sequence.builder().name("z").active(false).order(1).build();
        Sequence activeLow = Sequence.builder().name("a").active(true).order(5).build();
        Sequence activeHigh = Sequence.builder().name("b").active(true).order(1).build();

        Request r1 = Request.builder().position(3).build();
        Request r2 = Request.builder().position(1).build();
        Request r3 = Request.builder().position(2).build();

        PsaSequence psaNeedsBackfill = PsaSequence.builder().name("psa1").lastPlayed(null).build();
        LocalDateTime existing = LocalDateTime.now().minusDays(2);
        PsaSequence psaKeepIt = PsaSequence.builder().name("psa2").lastPlayed(existing).build();

        Show show = Show.builder().showToken(SHOW_TOKEN)
                .sequences(new ArrayList<>(List.of(inactive, activeLow, activeHigh)))
                .requests(new ArrayList<>(List.of(r1, r2, r3)))
                .psaSequences(new ArrayList<>(List.of(psaNeedsBackfill, psaKeepIt)))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        Show fetched = service.getShow();

        // Sort: active first, ordered by order asc -> b (1), a (5), then inactive z (1)
        assertThat(fetched.getSequences()).extracting(Sequence::getName).containsExactly("b", "a", "z");
        // Requests sorted by position ascending
        assertThat(fetched.getRequests()).extracting(Request::getPosition).containsExactly(1, 2, 3);
        // PSA backfill only on the null entry
        assertThat(psaNeedsBackfill.getLastPlayed()).isNotNull();
        assertThat(psaKeepIt.getLastPlayed()).isEqualTo(existing);
        verify(showRepository).save(show);
    }

    @Test
    void getShow_throwsUnexpected_whenTokenNotFound() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getShow())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());
    }

    // ---- showsOnAMap ----

    @Test
    void showsOnAMap_onlyIncludesShowsWithOptInPreference() {
        Show optIn = Show.builder().showName("Yes")
                .preferences(Preference.builder().showOnMap(true).showLatitude(1.0f).showLongitude(2.0f).build())
                .build();
        Show optOut = Show.builder().showName("No")
                .preferences(Preference.builder().showOnMap(false).showLatitude(3.0f).showLongitude(4.0f).build())
                .build();
        Show noPref = Show.builder().showName("Null").preferences(null).build();
        when(showRepository.getShowsOnMap()).thenReturn(List.of(optIn, optOut, noPref));

        List<ShowsOnAMap> shown = service.showsOnAMap();
        assertThat(shown).hasSize(1);
        assertThat(shown.get(0).getShowName()).isEqualTo("Yes");
        assertThat(shown.get(0).getShowLatitude()).isEqualTo(1.0f);
        assertThat(shown.get(0).getShowLongitude()).isEqualTo(2.0f);
    }

    // ---- getShowByShowName ----

    @Test
    void getShowByShowName_returnsShow_orNull() {
        when(showRepository.findByShowName("known")).thenReturn(Optional.of(Show.builder().build()));
        when(showRepository.findByShowName("unknown")).thenReturn(Optional.empty());
        assertThat(service.getShowByShowName("known")).isNotNull();
        assertThat(service.getShowByShowName("unknown")).isNull();
    }

    // ---- getNotifications ----

    @Test
    void getNotifications_combinesGlobalAndShow_sortsByCreatedDateDescending_andCapsAt20() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());

        // 18 global (created at decreasing times), plus 5 show notifications.
        List<Notification> globals = new ArrayList<>();
        for (int i = 0; i < 18; i++) {
            globals.add(Notification.builder()
                    .uuid("g" + i)
                    .type(NotificationType.ADMIN)
                    .createdDate(LocalDateTime.now().minusMinutes(i + 100))
                    .subject("g-subj-" + i)
                    .build());
        }
        when(notificationRepository.findAll()).thenReturn(globals);

        List<ShowNotification> showNotis = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            showNotis.add(ShowNotification.builder()
                    .read(false).deleted(false)
                    .notification(com.remotefalcon.library.models.NotificationModel.builder()
                            .uuid("s" + i)
                            .type(NotificationType.USER)
                            .createdDate(LocalDateTime.now().minusMinutes(i))
                            .build())
                    .build());
        }
        Show show = Show.builder().showToken(SHOW_TOKEN).showNotifications(showNotis).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        List<com.remotefalcon.library.models.NotificationModel> result = service.getNotifications();

        // 5 show + 18 global = 23, capped at 20.
        assertThat(result).hasSize(20);
        // First entries should be the show ones (smaller minutes-ago).
        assertThat(result.get(0).getUuid()).startsWith("s");
        // Sorted desc by createdDate.
        for (int i = 1; i < result.size(); i++) {
            assertThat(result.get(i - 1).getCreatedDate())
                    .isAfterOrEqualTo(result.get(i).getCreatedDate());
        }
    }

    @Test
    void getNotifications_handlesNullGlobalAndShowNotifications() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
        when(notificationRepository.findAll()).thenReturn(null);
        Show show = Show.builder().showToken(SHOW_TOKEN).showNotifications(null).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThat(service.getNotifications()).isEmpty();
    }

    @Test
    void getNotifications_throwsUnexpected_whenShowMissing() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
        when(notificationRepository.findAll()).thenReturn(Collections.emptyList());
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getNotifications())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());
    }

    // ---- listAdminNotifications ----

    @Test
    void listAdminNotifications_defaultsToOffset0Limit10() {
        Notification n1 = Notification.builder()
                .uuid("u1").type(NotificationType.ADMIN).createdDate(LocalDateTime.now()).build();
        Page<Notification> page = new PageImpl<>(List.of(n1), PageRequest.of(0, 10), 1);
        when(notificationRepository.findByTypeOrderByCreatedDateDesc(
                org.mockito.ArgumentMatchers.eq(NotificationType.ADMIN),
                org.mockito.ArgumentMatchers.any(PageRequest.class))).thenReturn(page);

        NotificationPage result = service.listAdminNotifications(null, null);

        assertThat(result.getItems()).hasSize(1);
        assertThat(result.getTotal()).isEqualTo(1);
    }

    @Test
    void listAdminNotifications_capsLimitAt100() {
        Page<Notification> empty = new PageImpl<>(Collections.emptyList(), PageRequest.of(0, 100), 0);
        when(notificationRepository.findByTypeOrderByCreatedDateDesc(
                org.mockito.ArgumentMatchers.any(NotificationType.class),
                org.mockito.ArgumentMatchers.any(PageRequest.class))).thenReturn(empty);

        // Asking for 500 — must be clamped to 100.
        org.mockito.ArgumentCaptor<PageRequest> cap = org.mockito.ArgumentCaptor.forClass(PageRequest.class);
        service.listAdminNotifications(0, 500);
        verify(notificationRepository).findByTypeOrderByCreatedDateDesc(any(), cap.capture());
        assertThat(cap.getValue().getPageSize()).isEqualTo(100);
    }

    @Test
    void listAdminNotifications_negativeOffsetCoercedToZero_andNonPositiveLimitCoercedTo10() {
        Page<Notification> empty = new PageImpl<>(Collections.emptyList(), PageRequest.of(0, 10), 0);
        when(notificationRepository.findByTypeOrderByCreatedDateDesc(
                org.mockito.ArgumentMatchers.any(NotificationType.class),
                org.mockito.ArgumentMatchers.any(PageRequest.class))).thenReturn(empty);

        org.mockito.ArgumentCaptor<PageRequest> cap = org.mockito.ArgumentCaptor.forClass(PageRequest.class);
        service.listAdminNotifications(-5, 0);
        verify(notificationRepository).findByTypeOrderByCreatedDateDesc(any(), cap.capture());
        assertThat(cap.getValue().getPageSize()).isEqualTo(10);
        assertThat(cap.getValue().getPageNumber()).isZero();
    }
}
