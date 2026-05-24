package com.remotefalcon.controlpanel.service;

import com.mailersend.sdk.MailerSendResponse;
import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.EmailUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.ApiAccess;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link GraphQLMutationService#requestApiAccess()} — the
 * GraphQL mutation that issues a new access token + secret and emails them
 * to the show owner.
 *
 * <p>Pins issue #139's invariant: a non-202 from MailerSend must NOT roll
 * back the credentials (the previous behavior re-applied the same values
 * it had just persisted, then threw {@code UNEXPECTED_ERROR} — leaving the
 * show with active API access the user never received an email for and a
 * misleading error toast). The GraphQL response is the source of truth for
 * the credentials; the email is a copy-paste convenience. If MailerSend
 * is degraded, the user still gets their credentials in the UI.
 */
@ExtendWith(MockitoExtension.class)
class RequestApiAccessTest {

    private static final String SHOW_TOKEN = "tok-xyz";
    private static final String SHOW_SUBDOMAIN = "shortslights";

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

    private static Show showWithNoApiAccess() {
        return Show.builder().showToken(SHOW_TOKEN).showSubdomain(SHOW_SUBDOMAIN).build();
    }

    private static Show showWithApiAccess(ApiAccess apiAccess) {
        return Show.builder()
                .showToken(SHOW_TOKEN)
                .showSubdomain(SHOW_SUBDOMAIN)
                .apiAccess(apiAccess)
                .build();
    }

    private static MailerSendResponse mailerResponse(int status) {
        MailerSendResponse r = new MailerSendResponse();
        r.responseStatusCode = status;
        return r;
    }

    @Test
    void requestApiAccess_issuesActiveCredentials_andSendsEmail_onHappyPath() {
        stubAuth();
        Show show = showWithNoApiAccess();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(emailUtil.sendRequestApiAccessEmail(any(Show.class), anyString(), anyString()))
                .thenReturn(mailerResponse(202));

        ApiAccess result = service.requestApiAccess();

        assertThat(result).isNotNull();
        assertThat(result.getApiAccessActive()).isTrue();
        assertThat(result.getApiAccessToken()).isNotNull().hasSize(20);
        assertThat(result.getApiAccessSecret()).isNotNull().hasSize(20);

        // Single save — issue, then email. No second "rollback save".
        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository, times(1)).save(saved.capture());
        assertThat(saved.getValue().getApiAccess().getApiAccessToken()).isEqualTo(result.getApiAccessToken());
        verify(emailUtil, times(1)).sendRequestApiAccessEmail(any(Show.class), anyString(), anyString());
    }

    @Test
    void requestApiAccess_returnsCredentials_evenWhenEmailFailsWithNon202() {
        // Issue #139 regression guard. Previously this path re-applied the
        // same credentials and threw UNEXPECTED_ERROR — leaving the user
        // with an active integration and an error toast.
        stubAuth();
        Show show = showWithNoApiAccess();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(emailUtil.sendRequestApiAccessEmail(any(Show.class), anyString(), anyString()))
                .thenReturn(mailerResponse(500));

        ApiAccess result = service.requestApiAccess();

        assertThat(result).isNotNull();
        assertThat(result.getApiAccessActive()).isTrue();
        assertThat(result.getApiAccessToken()).isNotNull().hasSize(20);
        assertThat(result.getApiAccessSecret()).isNotNull().hasSize(20);

        // Exactly one save — the original. The fake-rollback re-save is gone.
        verify(showRepository, times(1)).save(any(Show.class));
    }

    @Test
    void requestApiAccess_returnsCredentials_evenWhenEmailUtilReturnsNull() {
        // Defensive: some failure paths inside EmailUtil can return null
        // rather than a status-bearing response. The fix should not NPE
        // on response.responseStatusCode in that case.
        stubAuth();
        Show show = showWithNoApiAccess();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(emailUtil.sendRequestApiAccessEmail(any(Show.class), anyString(), anyString()))
                .thenReturn(null);

        ApiAccess result = service.requestApiAccess();

        assertThat(result).isNotNull();
        assertThat(result.getApiAccessActive()).isTrue();
        verify(showRepository, times(1)).save(any(Show.class));
    }

    @Test
    void requestApiAccess_throws_whenIntegrationAlreadyActive() {
        stubAuth();
        ApiAccess existing = ApiAccess.builder()
                .apiAccessActive(true)
                .apiAccessToken("existing-token")
                .apiAccessSecret("existing-secret")
                .build();
        Show show = showWithApiAccess(existing);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.requestApiAccess())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.API_ACCESS_REQUESTED.name());

        // Already-active integration must not be touched.
        assertThat(show.getApiAccess().getApiAccessToken()).isEqualTo("existing-token");
        verify(showRepository, never()).save(any(Show.class));
        verify(emailUtil, never()).sendRequestApiAccessEmail(any(Show.class), anyString(), anyString());
    }

    @Test
    void requestApiAccess_throws_whenShowNotFound() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.requestApiAccess())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());

        verify(showRepository, never()).save(any(Show.class));
        verify(emailUtil, never()).sendRequestApiAccessEmail(any(Show.class), anyString(), anyString());
    }

    @Test
    void requestApiAccess_initializesApiAccess_whenNullOnShow() {
        // Show exists but has never had API access — apiAccess field is null.
        // The mutation should initialize it, not NPE.
        stubAuth();
        Show show = showWithNoApiAccess();  // apiAccess is null
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));
        when(emailUtil.sendRequestApiAccessEmail(any(Show.class), anyString(), anyString()))
                .thenReturn(mailerResponse(202));

        ApiAccess result = service.requestApiAccess();

        assertThat(result).isNotNull();
        assertThat(result.getApiAccessActive()).isTrue();
        assertThat(show.getApiAccess()).isNotNull();
    }
}
