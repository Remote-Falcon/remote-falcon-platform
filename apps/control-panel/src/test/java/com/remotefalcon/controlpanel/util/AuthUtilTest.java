package com.remotefalcon.controlpanel.util;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.exception.InvalidJwtException;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ShowRole;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AuthUtil} — JWT signing, validation, and credential
 * header parsing. The end-to-end Basic-auth-to-Bearer chain is covered by
 * {@code JwtAuthIntegrationTest}; these tests pin the unit behavior of
 * each helper so a regression surfaces on the right line.
 */
@ExtendWith(MockitoExtension.class)
class AuthUtilTest {

    private static final String SIGN_KEY = "unit-test-signing-key-please-use-a-real-one-in-prod";

    @Mock private HttpServletRequest request;

    private AuthUtil authUtil;

    @BeforeEach
    void setUp() {
        authUtil = new AuthUtil();
        ReflectionTestUtils.setField(authUtil, "jwtSignKey", SIGN_KEY);
    }

    @AfterEach
    void tearDown() {
        // Make sure ThreadLocal state doesn't leak into the next test.
        authUtil.clearTokenDTO();
        RequestContextHolder.resetRequestAttributes();
    }

    /** Wire the supplied MockHttpServletRequest into RequestContextHolder so
     *  AuthUtil#getCurrentRequest can fetch it. */
    private static void bindRequest(MockHttpServletRequest mreq) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(mreq));
    }

    private static Show userShow() {
        return Show.builder()
                .showToken("tok-1")
                .email("user@example.com")
                .showSubdomain("subdomain")
                .showRole(ShowRole.USER)
                .build();
    }

    private static Show adminShow() {
        return Show.builder()
                .showToken("tok-admin")
                .email("admin@example.com")
                .showSubdomain("admin-sub")
                .showRole(ShowRole.ADMIN)
                .build();
    }

    @Test
    void signJwt_returnsNonNullJwt_thatDecodesToOurPayload() {
        Show show = userShow();
        String jwt = authUtil.signJwt(show);

        assertThat(jwt).isNotNull();

        // isJwtValid re-reads the token from RequestContextHolder (via
        // getJwtPayload -> getCurrentRequest), so bind the bearer there.
        MockHttpServletRequest mreq = new MockHttpServletRequest();
        mreq.addHeader("Authorization", "Bearer " + jwt);
        bindRequest(mreq);

        assertThat(authUtil.isJwtValid(mreq)).isTrue();

        TokenDTO dto = authUtil.getTokenDTO();
        assertThat(dto.getShowToken()).isEqualTo("tok-1");
        assertThat(dto.getEmail()).isEqualTo("user@example.com");
        assertThat(dto.getShowSubdomain()).isEqualTo("subdomain");
        assertThat(dto.getShowRole()).isEqualTo(ShowRole.USER);
    }

    @Test
    void isJwtValid_throwsInvalidJwt_whenAuthorizationHeaderMissing() {
        when(request.getHeader("Authorization")).thenReturn(null);
        assertThatThrownBy(() -> authUtil.isJwtValid(request))
                .isInstanceOf(InvalidJwtException.class);
    }

    @Test
    void isJwtValid_throwsInvalidJwt_onMalformedToken() {
        when(request.getHeader("Authorization")).thenReturn("Bearer not.a.real.jwt");
        assertThatThrownBy(() -> authUtil.isJwtValid(request))
                .isInstanceOf(InvalidJwtException.class);
    }

    @Test
    void isJwtValid_throwsInvalidJwt_onBearerWithoutToken() {
        // "Bearer" alone (no space-separated payload) — the split logic
        // wraps the IndexOutOfBounds in an InvalidJwtException.
        when(request.getHeader("Authorization")).thenReturn("Bearer");
        assertThatThrownBy(() -> authUtil.isJwtValid(request))
                .isInstanceOf(InvalidJwtException.class);
    }

    @Test
    void isAdminJwtValid_returnsFalse_forUserRoleToken() {
        String userJwt = authUtil.signJwt(userShow());
        MockHttpServletRequest mreq = new MockHttpServletRequest();
        mreq.addHeader("Authorization", "Bearer " + userJwt);
        bindRequest(mreq);

        assertThat(authUtil.isAdminJwtValid(mreq)).isFalse();
    }

    @Test
    void isAdminJwtValid_returnsTrue_forAdminRoleToken() {
        String adminJwt = authUtil.signJwt(adminShow());
        MockHttpServletRequest mreq = new MockHttpServletRequest();
        mreq.addHeader("Authorization", "Bearer " + adminJwt);
        bindRequest(mreq);

        assertThat(authUtil.isAdminJwtValid(mreq)).isTrue();
    }

    @Test
    void isAdminJwtValid_throws_whenTokenMissing() {
        when(request.getHeader("Authorization")).thenReturn(null);
        assertThatThrownBy(() -> authUtil.isAdminJwtValid(request))
                .isInstanceOf(InvalidJwtException.class);
    }

    @Test
    void getBasicAuthCredentials_parsesEmailAndPassword() {
        String userPass = "user@example.com:hunter2";
        String encoded = Base64.getEncoder()
                .encodeToString(userPass.getBytes(StandardCharsets.UTF_8));
        when(request.getHeader("Authorization")).thenReturn("Basic " + encoded);

        String[] creds = authUtil.getBasicAuthCredentials(request);
        assertThat(creds).containsExactly("user@example.com", "hunter2");
    }

    @Test
    void getBasicAuthCredentials_returnsNull_whenNotBasic() {
        when(request.getHeader("Authorization")).thenReturn("Bearer abc.def.ghi");
        assertThat(authUtil.getBasicAuthCredentials(request)).isNull();
    }

    @Test
    void getBasicAuthCredentials_returnsNull_whenAuthorizationMissing() {
        when(request.getHeader("Authorization")).thenReturn(null);
        assertThat(authUtil.getBasicAuthCredentials(request)).isNull();
    }

    @Test
    void getBasicAuthCredentials_handlesPasswordContainingColon() {
        // Password is "pa:ss:word" — the split must use limit=2 so the
        // colons inside the password aren't treated as separators.
        String userPass = "user@example.com:pa:ss:word";
        String encoded = Base64.getEncoder()
                .encodeToString(userPass.getBytes(StandardCharsets.UTF_8));
        when(request.getHeader("Authorization")).thenReturn("Basic " + encoded);

        String[] creds = authUtil.getBasicAuthCredentials(request);
        assertThat(creds).containsExactly("user@example.com", "pa:ss:word");
    }

    @Test
    void getPasswordFromHeader_decodesBase64Password() {
        String pw = "supersecret";
        String encoded = Base64.getEncoder().encodeToString(pw.getBytes(StandardCharsets.UTF_8));
        when(request.getHeader("Password")).thenReturn(encoded);

        assertThat(authUtil.getPasswordFromHeader(request)).isEqualTo(pw);
    }

    @Test
    void getPasswordFromHeader_returnsNull_whenHeaderAbsent() {
        when(request.getHeader("Password")).thenReturn(null);
        assertThat(authUtil.getPasswordFromHeader(request)).isNull();
    }

    @Test
    void getUpdatedPasswordFromHeader_decodesBase64NewPassword() {
        String pw = "newer-secret";
        String encoded = Base64.getEncoder().encodeToString(pw.getBytes(StandardCharsets.UTF_8));
        when(request.getHeader("NewPassword")).thenReturn(encoded);

        assertThat(authUtil.getUpdatedPasswordFromHeader(request)).isEqualTo(pw);
    }

    @Test
    void getUpdatedPasswordFromHeader_returnsNull_whenHeaderAbsent() {
        when(request.getHeader("NewPassword")).thenReturn(null);
        assertThat(authUtil.getUpdatedPasswordFromHeader(request)).isNull();
    }

    @Test
    void getTokenDTO_throws_whenThreadLocalEmpty() {
        // Clear, then immediately ask — must surface as InvalidJwtException
        // so AccessAspect can short-circuit downstream resolvers.
        authUtil.clearTokenDTO();
        assertThatThrownBy(() -> authUtil.getTokenDTO()).isInstanceOf(InvalidJwtException.class);
    }

    @Test
    void setTokenDTO_thenGetTokenDTO_roundTrips() {
        TokenDTO dto = TokenDTO.builder().showToken("set-and-get").email("x@y.z").build();
        TokenDTO returned = authUtil.setTokenDTO(dto);
        assertThat(returned).isSameAs(dto);
        assertThat(authUtil.getTokenDTO()).isSameAs(dto);
    }
}
