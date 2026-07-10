package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.RotateShowTokenResponse;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.EmailUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link GraphQLMutationService#rotateShowToken()} — the
 * GraphQL mutation that mints a fresh {@code showToken} for the current
 * show. The showToken is the FPP plugin's credential AND the identity
 * claim inside the control-panel session JWT, so the mutation must also
 * re-issue a service token signed with the NEW showToken (otherwise the
 * caller's own session dies on the next request).
 */
@ExtendWith(MockitoExtension.class)
class RotateShowTokenTest {

    private static final String OLD_SHOW_TOKEN = "old-show-token-25-chars-x";
    private static final String RESIGNED_JWT = "resigned.jwt.token";

    @Mock private EmailUtil emailUtil;
    @Mock private AuthUtil authUtil;
    @Mock private ShowRepository showRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private ClientUtil clientUtil;
    @Mock private ViewerPageService viewerPageService;

    @InjectMocks private GraphQLMutationService service;

    private void stubAuth() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(OLD_SHOW_TOKEN).build());
    }

    private static Show showWithToken(String showToken) {
        return Show.builder().showToken(showToken).build();
    }

    /**
     * Stub the repository so the current show resolves by the old token and
     * any freshly-generated candidate token reads as unused (no collision).
     */
    private Show stubShowLookup() {
        Show show = showWithToken(OLD_SHOW_TOKEN);
        when(showRepository.findByShowToken(anyString())).thenAnswer(invocation ->
                OLD_SHOW_TOKEN.equals(invocation.getArgument(0)) ? Optional.of(show) : Optional.empty());
        return show;
    }

    @Test
    void rotateShowToken_mintsNewToken_savesShow_andReturnsResignedJwt() {
        stubAuth();
        Show show = stubShowLookup();
        when(authUtil.signJwt(show)).thenReturn(RESIGNED_JWT);

        RotateShowTokenResponse response = service.rotateShowToken();

        assertThat(response.getShowToken()).isNotNull().hasSize(25).isNotEqualTo(OLD_SHOW_TOKEN);
        assertThat(response.getServiceToken()).isEqualTo(RESIGNED_JWT);
        assertThat(show.getShowToken()).isEqualTo(response.getShowToken());

        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        assertThat(saved.getValue().getShowToken()).isEqualTo(response.getShowToken());
    }

    @Test
    void rotateShowToken_producesDifferentToken_onConsecutiveCalls() {
        stubAuth();
        Show show = stubShowLookup();
        when(authUtil.signJwt(show)).thenReturn(RESIGNED_JWT);

        String first = service.rotateShowToken().getShowToken();
        // Reset the show's token so the second call resolves it again.
        show.setShowToken(OLD_SHOW_TOKEN);
        String second = service.rotateShowToken().getShowToken();

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void rotateShowToken_regeneratesOnCollision_untilUnique() {
        stubAuth();
        Show show = showWithToken(OLD_SHOW_TOKEN);
        Show collidingShow = showWithToken("someone-elses-token");
        // First candidate token collides with another show; subsequent
        // candidates are free. Track calls so exactly one collision fires.
        final int[] candidateCalls = {0};
        when(showRepository.findByShowToken(anyString())).thenAnswer(invocation -> {
            String arg = invocation.getArgument(0);
            if (OLD_SHOW_TOKEN.equals(arg)) {
                return Optional.of(show);
            }
            candidateCalls[0]++;
            return candidateCalls[0] == 1 ? Optional.of(collidingShow) : Optional.empty();
        });
        when(authUtil.signJwt(show)).thenReturn(RESIGNED_JWT);

        RotateShowTokenResponse response = service.rotateShowToken();

        assertThat(candidateCalls[0]).isEqualTo(2);
        assertThat(response.getShowToken()).isNotNull().hasSize(25);
        verify(showRepository).save(show);
    }

    @Test
    void rotateShowToken_throwsAndDoesNotSave_whenJwtSigningFails() {
        stubAuth();
        Show show = stubShowLookup();
        when(authUtil.signJwt(show)).thenReturn(null);

        assertThatThrownBy(() -> service.rotateShowToken())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());

        // If the re-issued JWT can't be minted, the rotation must NOT
        // persist — otherwise the caller's session dies with no recovery.
        verify(showRepository, never()).save(any(Show.class));
    }

    @Test
    void rotateShowToken_throwsAndDoesNotSave_whenShowNotFound() {
        stubAuth();
        when(showRepository.findByShowToken(OLD_SHOW_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.rotateShowToken())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNEXPECTED_ERROR.name());

        verify(showRepository, never()).save(any(Show.class));
    }
}
