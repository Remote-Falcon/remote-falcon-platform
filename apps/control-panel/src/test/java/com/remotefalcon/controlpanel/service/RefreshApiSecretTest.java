package com.remotefalcon.controlpanel.service;

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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link GraphQLMutationService#refreshApiSecret()} — the
 * GraphQL mutation that rotates only the {@code apiAccessSecret} on an
 * existing, active API integration. The access token is intentionally
 * preserved so existing JWTs can be re-signed without re-issuing the token.
 */
@ExtendWith(MockitoExtension.class)
class RefreshApiSecretTest {

    private static final String SHOW_TOKEN = "tok-xyz";
    private static final String EXISTING_ACCESS_TOKEN = "existing-access-token-20c";
    private static final String EXISTING_SECRET = "existing-secret-20chars";

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

    private static Show showWithApiAccess(ApiAccess apiAccess) {
        return Show.builder().showToken(SHOW_TOKEN).apiAccess(apiAccess).build();
    }

    @Test
    void refreshApiSecret_rotatesSecret_keepsAccessToken_andSaves() {
        stubAuth();
        ApiAccess existing = ApiAccess.builder()
                .apiAccessActive(true)
                .apiAccessToken(EXISTING_ACCESS_TOKEN)
                .apiAccessSecret(EXISTING_SECRET)
                .build();
        Show show = showWithApiAccess(existing);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        String newSecret = service.refreshApiSecret();

        assertThat(newSecret).isNotNull().hasSize(20).isNotEqualTo(EXISTING_SECRET);
        assertThat(show.getApiAccess().getApiAccessSecret()).isEqualTo(newSecret);
        // Access token must NOT rotate — external-api looks up shows by it.
        assertThat(show.getApiAccess().getApiAccessToken()).isEqualTo(EXISTING_ACCESS_TOKEN);
        assertThat(show.getApiAccess().getApiAccessActive()).isTrue();

        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        assertThat(saved.getValue().getApiAccess().getApiAccessSecret()).isEqualTo(newSecret);
    }

    @Test
    void refreshApiSecret_producesDifferentSecret_onConsecutiveCalls() {
        stubAuth();
        ApiAccess existing = ApiAccess.builder()
                .apiAccessActive(true)
                .apiAccessToken(EXISTING_ACCESS_TOKEN)
                .apiAccessSecret(EXISTING_SECRET)
                .build();
        Show show = showWithApiAccess(existing);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        String first = service.refreshApiSecret();
        String second = service.refreshApiSecret();

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void refreshApiSecret_throwsAndDoesNotSave_whenApiAccessIsNull() {
        stubAuth();
        Show show = showWithApiAccess(null);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.refreshApiSecret())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());

        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void refreshApiSecret_throwsAndDoesNotSave_whenApiAccessInactive() {
        stubAuth();
        ApiAccess inactive = ApiAccess.builder()
                .apiAccessActive(false)
                .apiAccessToken(EXISTING_ACCESS_TOKEN)
                .apiAccessSecret(EXISTING_SECRET)
                .build();
        Show show = showWithApiAccess(inactive);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.refreshApiSecret())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());

        // Inactive integration should remain untouched.
        assertThat(show.getApiAccess().getApiAccessSecret()).isEqualTo(EXISTING_SECRET);
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void refreshApiSecret_throwsAndDoesNotSave_whenShowNotFound() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.refreshApiSecret())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());

        verify(showRepository, never()).save(any(Show.class));
    }
}
