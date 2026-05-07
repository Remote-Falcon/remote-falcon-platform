package com.remotefalcon.controlpanel.auth;

import com.remotefalcon.controlpanel.service.ControlPanelService;
import com.remotefalcon.testfixtures.JwtFactory;
import com.remotefalcon.testfixtures.TestSecrets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end integration test for the control-panel JWT auth chain.
 *
 * <p>Exercises three real components together against a live Spring context:
 * <ul>
 *   <li>{@link com.remotefalcon.controlpanel.util.AuthUtil} — token parsing,
 *       signature verification (HMAC-SHA256 against {@code jwt.user}), and
 *       issuer check.</li>
 *   <li>{@link com.remotefalcon.controlpanel.aop.AccessAspect} — the AOP
 *       {@code @Around} advice that intercepts {@code @RequiresAccess}-annotated
 *       methods, calls {@code AuthUtil.isJwtValid}, and either proceeds or
 *       rejects.</li>
 *   <li>The {@code @RequiresAccess} annotation itself, applied to a real
 *       protected endpoint ({@code GET /controlPanel/gitHubIssues} on
 *       {@code ControlPanelController}). The downstream service is mocked so
 *       this test stays focused on the auth surface.</li>
 * </ul>
 *
 * <p>Tokens come from {@link JwtFactory#issueControlPanel}, which mints a
 * production-shaped token (issuer {@code remotefalcon}, {@code user-data}
 * claim, HS256 signed against {@link TestSecrets#JWT_KEY}). The same key is
 * supplied to the running app via {@code application-test.yml} as
 * {@code jwt.user}, so a token minted by the test validates against the
 * production filter chain end-to-end.
 *
 * <p>A bug in <em>any</em> of the three components above breaks the entire
 * authenticated surface; this test is the regression net for that.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class JwtAuthIntegrationTest {

    private static final String PROTECTED_ENDPOINT = "/controlPanel/gitHubIssues";

    /**
     * Real testcontainers Mongo. Spring Data's {@code @EnableMongoRepositories}
     * runs during context refresh and demands a {@code mongoTemplate} bean
     * before {@code @MockBean} can register replacements; mocking Mongo at
     * test scope was tried and didn't work cleanly. Cost is +5s startup once
     * per test class; tradeoff worth it for context stability.
     */
    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MockMvc mockMvc;

    /**
     * The downstream service is mocked so the protected endpoint can return
     * cleanly when auth succeeds, without making real GitHub calls.
     */
    @MockBean
    private ControlPanelService controlPanelService;

    /**
     * Configures the mocked downstream so a successful auth path returns 200
     * instead of NPE-ing on a null ResponseEntity.
     */
    private void stubGitHubIssuesOk() {
        when(controlPanelService.gitHubIssues())
                .thenReturn(ResponseEntity.status(HttpStatus.OK).body(List.of()));
    }

    // ------------------------------------------------------------------
    // Positive path: valid token → endpoint reached, downstream invoked.
    // ------------------------------------------------------------------

    @Test
    void protectedEndpoint_returns200_withValidToken() throws Exception {
        stubGitHubIssuesOk();
        String token = JwtFactory.issueControlPanel(
                "test-show-token", "test@example.com", "test-show", "USER");

        mockMvc.perform(get(PROTECTED_ENDPOINT)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void protectedEndpoint_acceptsAdminToken() throws Exception {
        // @RequiresAccess is binary "logged in" — it does not enforce role.
        // An ADMIN token must therefore also pass.
        stubGitHubIssuesOk();
        String token = JwtFactory.issueControlPanel(
                "admin-token", "admin@example.com", "admin-show", "ADMIN");

        mockMvc.perform(get(PROTECTED_ENDPOINT)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void protectedEndpoint_acceptsTokenCaseInsensitiveBearerPrefix() throws Exception {
        // AuthUtil#getTokenFromRequest lowercases the prefix before comparing,
        // so "bearer <token>" is accepted as well as "Bearer <token>".
        stubGitHubIssuesOk();
        String token = JwtFactory.issueControlPanel(
                "lowercase-bearer", "lc@example.com", "lc-show", "USER");

        mockMvc.perform(get(PROTECTED_ENDPOINT)
                        .header("Authorization", "bearer " + token))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------
    // Negative paths: AccessAspect throws RuntimeException(INVALID_JWT)
    // when AuthUtil rejects the token. Because AccessAspect runs as AOP
    // BEFORE the controller method, the exception bypasses Spring MVC's
    // exception resolver chain and bubbles all the way up to MockMvc's
    // perform() call as a NestedServletException with the original
    // RuntimeException as cause.
    //
    // The contract under test is "rejected requests do not reach the
    // controller body" — we assert that contract by catching the
    // exception and verifying the cause is INVALID_JWT. If a future
    // commit adds a @ControllerAdvice mapping INVALID_JWT to 401/403,
    // these tests should be re-shaped to assert on the response status.
    // ------------------------------------------------------------------

    /** Asserts the request was rejected at the auth layer with INVALID_JWT. */
    private void assertRejectedAsInvalidJwt(Runnable mockMvcCall) {
        assertThatThrownBy(mockMvcCall::run)
                .rootCause()
                .isInstanceOf(RuntimeException.class)
                .hasMessage("INVALID_JWT");
    }

    @Test
    void protectedEndpoint_rejects_withoutAuthorizationHeader() {
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT)); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }

    @Test
    void protectedEndpoint_rejects_withEmptyBearerToken() {
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT).header("Authorization", "Bearer ")); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }

    @Test
    void protectedEndpoint_rejects_withMalformedToken() {
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT)
                    .header("Authorization", "Bearer " + JwtFactory.malformed())); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }

    @Test
    void protectedEndpoint_rejects_withGarbageToken() {
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT)
                    .header("Authorization", "Bearer not-a-real-jwt")); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }

    @Test
    void protectedEndpoint_rejects_withExpiredToken() {
        String token = JwtFactory.expiredControlPanel(
                "expired-token", "expired@example.com", "expired-show", "USER");
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT)
                    .header("Authorization", "Bearer " + token)); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }

    @Test
    void protectedEndpoint_rejects_withWrongIssuer() {
        // AuthUtil#isJwtValid builds the verifier with .withIssuer("remotefalcon"),
        // so a token signed with the right key but the wrong issuer is rejected.
        String token = JwtFactory.wrongIssuerControlPanel(
                "wrong-iss", "wi@example.com", "wi-show", "USER");
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT)
                    .header("Authorization", "Bearer " + token)); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }

    @Test
    void protectedEndpoint_rejects_tokenSignedWithWrongKey() {
        // Token signed with a different (but length-valid) HMAC key is rejected
        // at signature-verification time. We mint via the io.jsonwebtoken stack
        // directly here so we don't need a separate "wrong key" factory method.
        String token = io.jsonwebtoken.Jwts.builder()
                .issuer("remotefalcon")
                .claim("user-data", java.util.Map.of(
                        "showToken", "wk",
                        "email", "wk@example.com",
                        "showSubdomain", "wk",
                        "showRole", "USER"))
                .issuedAt(java.util.Date.from(java.time.Instant.now()))
                .expiration(java.util.Date.from(java.time.Instant.now().plus(Duration.ofHours(1))))
                .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                        "totally-different-256-bit-key-padding-padding-padding".getBytes()),
                        io.jsonwebtoken.Jwts.SIG.HS256)
                .compact();
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT)
                    .header("Authorization", "Bearer " + token)); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }

    @Test
    void protectedEndpoint_rejects_basicAuthInsteadOfBearer() {
        // AuthUtil#getTokenFromRequest only extracts on a "Bearer" prefix; a
        // Basic-auth header therefore yields an empty token and is rejected.
        assertRejectedAsInvalidJwt(() -> {
            try { mockMvc.perform(get(PROTECTED_ENDPOINT)
                    .header("Authorization", "Basic dXNlcjpwYXNz")); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }
}
