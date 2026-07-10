package com.remotefalcon.controlpanel.util;

import com.remotefalcon.controlpanel.exception.InvalidJwtException;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.enums.StatusResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 2FA PRD §8 — the MFA-pending challenge token. The load-bearing assertion
 * is the §8.2 guard: a pending token must be rejected by isJwtValid /
 * isAdminJwtValid, otherwise password-only authentication could reach every
 * protected resolver and the second factor would be decorative.
 */
class AuthUtilMfaTest {

    private static final String SIGN_KEY = "unit-test-signing-key-please-use-a-real-one-in-prod";

    private AuthUtil authUtil;

    @BeforeEach
    void setUp() {
        authUtil = new AuthUtil();
        ReflectionTestUtils.setField(authUtil, "jwtSignKey", SIGN_KEY);
        ReflectionTestUtils.setField(authUtil, "mfaPendingTokenMinutes", 5);
    }

    @AfterEach
    void tearDown() {
        authUtil.clearTokenDTO();
        RequestContextHolder.resetRequestAttributes();
    }

    private static Show enrolledShow() {
        return Show.builder()
                .showToken("tok-mfa")
                .email("user@example.com")
                .showSubdomain("subdomain")
                .showRole(ShowRole.USER)
                .build();
    }

    private static MockHttpServletRequest bearer(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    @Test
    void signMfaPendingJwt_roundTrips_throughValidateMfaPendingToken() {
        String pending = authUtil.signMfaPendingJwt(enrolledShow());
        assertThat(pending).isNotNull();

        assertThat(authUtil.validateMfaPendingToken(bearer(pending))).isEqualTo("tok-mfa");
    }

    @Test
    void isJwtValid_rejectsPendingToken() {
        String pending = authUtil.signMfaPendingJwt(enrolledShow());

        assertThatThrownBy(() -> authUtil.isJwtValid(bearer(pending)))
                .isInstanceOf(InvalidJwtException.class);
    }

    @Test
    void isAdminJwtValid_rejectsPendingToken_evenForAdminShows() {
        Show admin = enrolledShow();
        admin.setShowRole(ShowRole.ADMIN);
        String pending = authUtil.signMfaPendingJwt(admin);

        assertThatThrownBy(() -> authUtil.isAdminJwtValid(bearer(pending)))
                .isInstanceOf(InvalidJwtException.class);
    }

    @Test
    void validateMfaPendingToken_rejectsFullServiceToken() {
        // A real 30-day session token must not satisfy the challenge step —
        // the pending claim is required, not just a valid signature.
        String fullToken = authUtil.signJwt(enrolledShow());

        assertThatThrownBy(() -> authUtil.validateMfaPendingToken(bearer(fullToken)))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.MFA_CHALLENGE_EXPIRED.name());
    }

    @Test
    void validateMfaPendingToken_rejectsExpiredChallenge() {
        ReflectionTestUtils.setField(authUtil, "mfaPendingTokenMinutes", -1);
        String expired = authUtil.signMfaPendingJwt(enrolledShow());
        ReflectionTestUtils.setField(authUtil, "mfaPendingTokenMinutes", 5);

        assertThatThrownBy(() -> authUtil.validateMfaPendingToken(bearer(expired)))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.MFA_CHALLENGE_EXPIRED.name());
    }

    @Test
    void validateMfaPendingToken_rejectsMissingAndGarbageTokens() {
        assertThatThrownBy(() -> authUtil.validateMfaPendingToken(new MockHttpServletRequest()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.MFA_CHALLENGE_EXPIRED.name());

        assertThatThrownBy(() -> authUtil.validateMfaPendingToken(bearer("not-a-jwt")))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.MFA_CHALLENGE_EXPIRED.name());
    }

    @Test
    void fullServiceToken_stillPassesIsJwtValid() {
        // Regression guard: the pending-claim check must not break normal
        // session tokens.
        String fullToken = authUtil.signJwt(enrolledShow());
        MockHttpServletRequest request = bearer(fullToken);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        assertThat(authUtil.isJwtValid(request)).isTrue();
    }
}
