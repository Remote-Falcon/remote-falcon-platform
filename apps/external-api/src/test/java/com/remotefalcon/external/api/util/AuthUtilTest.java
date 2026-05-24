package com.remotefalcon.external.api.util;

import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.external.api.testsupport.ExternalApiJwtFactory;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ApiAccess;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AuthUtil} — the JWT validation chain on every
 * external-api endpoint. Covers all four reject paths and the happy path,
 * exercising the real {@code com.auth0:java-jwt} stack against a real test JWT
 * minted by {@link ExternalApiJwtFactory}.
 *
 * <p>Mocks {@link ShowRepository} to avoid a Mongo dependency.
 */
@ExtendWith(MockitoExtension.class)
class AuthUtilTest {

    private static final String ACCESS_TOKEN = "test-access-token-uuid";
    private static final String SECRET = "test-secret-1234567890";

    @Mock private ShowRepository showRepository;
    @InjectMocks private AuthUtil authUtil;

    private HttpServletRequest request;

    @BeforeEach
    void setUp() {
        request = mock(HttpServletRequest.class);
    }

    @AfterEach
    void clearThreadLocal() {
        // Belt-and-braces: the production code path is always wrapped by
        // AccessAspect#finally → clearShowToken(), but in unit tests we call
        // isApiJwtValid() directly without the aspect, so wipe the
        // per-thread state ourselves to keep tests independent.
        authUtil.clearShowToken();
    }

    private Show showWith(String accessToken, String secret) {
        return Show.builder()
                .showToken("show-tok-" + accessToken)
                .apiAccess(ApiAccess.builder()
                        .apiAccessActive(true)
                        .apiAccessToken(accessToken)
                        .apiAccessSecret(secret)
                        .build())
                .build();
    }

    // ----- getTokenFromRequest -----

    @Test
    void getTokenFromRequest_returnsEmpty_whenAuthorizationHeaderMissing() {
        when(request.getHeader("Authorization")).thenReturn(null);
        assertThat(authUtil.getTokenFromRequest(request)).isEmpty();
    }

    @Test
    void getTokenFromRequest_returnsEmpty_whenHeaderIsNotBearer() {
        when(request.getHeader("Authorization")).thenReturn("Basic dXNlcjpwYXNz");
        assertThat(authUtil.getTokenFromRequest(request)).isEmpty();
    }

    @Test
    void getTokenFromRequest_returnsEmpty_whenBearerWithoutToken() {
        // "Bearer" alone (no space, no token) — split(" ") yields a single-element
        // array; accessing [1] throws ArrayIndexOutOfBounds, which AuthUtil
        // catches and logs. Token stays empty.
        when(request.getHeader("Authorization")).thenReturn("Bearer");
        assertThat(authUtil.getTokenFromRequest(request)).isEmpty();
    }

    @Test
    void getTokenFromRequest_extractsToken_fromBearerHeader() {
        when(request.getHeader("Authorization")).thenReturn("Bearer abc.def.ghi");
        assertThat(authUtil.getTokenFromRequest(request)).isEqualTo("abc.def.ghi");
    }

    @Test
    void getTokenFromRequest_acceptsLowercaseBearer() {
        // AuthUtil lowercases the header before the prefix check, so "bearer"
        // works as well as "Bearer".
        when(request.getHeader("Authorization")).thenReturn("bearer abc.def.ghi");
        assertThat(authUtil.getTokenFromRequest(request)).isEqualTo("abc.def.ghi");
    }

    // ----- isApiJwtValid -----

    @Test
    void isApiJwtValid_false_whenNoAuthorizationHeader() {
        when(request.getHeader("Authorization")).thenReturn(null);
        assertThat(authUtil.isApiJwtValid(request)).isFalse();
    }

    @Test
    void isApiJwtValid_false_whenTokenIsGarbage() {
        when(request.getHeader("Authorization"))
                .thenReturn("Bearer " + ExternalApiJwtFactory.garbage());
        assertThat(authUtil.isApiJwtValid(request)).isFalse();
    }

    @Test
    void isApiJwtValid_false_whenAccessTokenClaimMissing() {
        // A structurally-valid JWT signed with the right algorithm but missing
        // the accessToken claim. Previously AuthUtil dereferenced
        // decodedJWT.getClaims().get("accessToken") with no null check,
        // which NPE'd and surfaced as HTTP 500 to the caller (only
        // JWTVerificationException was caught). After the security fix the
        // method must treat this as an unauthenticated request and return
        // false → AccessAspect maps it to 401.
        String token = ExternalApiJwtFactory.issueWithoutAccessTokenClaim(SECRET);
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);

        assertThat(authUtil.isApiJwtValid(request)).isFalse();
        assertThat(authUtil.getShowToken()).isNull();
    }

    @Test
    void isApiJwtValid_false_whenShowNotFoundForAccessToken() {
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(showRepository.findByApiAccessApiAccessToken(ACCESS_TOKEN))
                .thenReturn(Optional.empty());

        assertThat(authUtil.isApiJwtValid(request)).isFalse();
        assertThat(authUtil.getShowToken()).isNull();
    }

    @Test
    void isApiJwtValid_false_whenSignatureMismatch() {
        // Token signed with the wrong secret — the show is found, but
        // verifier.verify() throws SignatureVerificationException (a subclass of
        // JWTVerificationException), caught and mapped to false.
        String tokenSignedWithWrongSecret =
                ExternalApiJwtFactory.issue(ACCESS_TOKEN, "totally-different-secret");
        when(request.getHeader("Authorization"))
                .thenReturn("Bearer " + tokenSignedWithWrongSecret);
        when(showRepository.findByApiAccessApiAccessToken(ACCESS_TOKEN))
                .thenReturn(Optional.of(showWith(ACCESS_TOKEN, SECRET)));

        assertThat(authUtil.isApiJwtValid(request)).isFalse();
    }

    @Test
    void isApiJwtValid_true_andSetsShowToken_onHappyPath() {
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        Show show = showWith(ACCESS_TOKEN, SECRET);
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(showRepository.findByApiAccessApiAccessToken(ACCESS_TOKEN))
                .thenReturn(Optional.of(show));

        assertThat(authUtil.isApiJwtValid(request)).isTrue();
        // Side effect: showToken is stashed on the current thread for
        // downstream services on the same request thread.
        assertThat(authUtil.getShowToken()).isEqualTo(show.getShowToken());
    }

    @Test
    void clearShowToken_wipesPerThreadValue() {
        // Mimic the production lifecycle: aspect validates, service reads,
        // aspect clears in finally. After clear the next call on this thread
        // should see null again.
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        Show show = showWith(ACCESS_TOKEN, SECRET);
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);
        when(showRepository.findByApiAccessApiAccessToken(ACCESS_TOKEN))
                .thenReturn(Optional.of(show));

        assertThat(authUtil.isApiJwtValid(request)).isTrue();
        assertThat(authUtil.getShowToken()).isEqualTo(show.getShowToken());

        authUtil.clearShowToken();
        assertThat(authUtil.getShowToken()).isNull();
    }

    // ----- Concurrent token race — guards against issue-tracker #149 -----
    //
    // Pre-fix: AuthUtil#showToken was a plain mutable instance field on a
    // Spring singleton. Two concurrent requests for different shows would
    // race — thread B could overwrite the field after thread A's auth but
    // before A's downstream read, so A returned B's tenant data.
    //
    // Fix: showToken is now a ThreadLocal. This test runs two threads in
    // tight loops binding their own tokens via isApiJwtValid() and reading
    // them back via getShowToken(); a CountDownLatch maximises overlap.
    // With the broken instance-field design this assertion would flake; on
    // the fixed ThreadLocal it is deterministic.
    @Test
    void isApiJwtValid_showToken_isPerThread_underConcurrency() throws Exception {
        String tokenA = ExternalApiJwtFactory.issue("access-A", "secret-A");
        String tokenB = ExternalApiJwtFactory.issue("access-B", "secret-B");
        Show showA = showWith("access-A", "secret-A");
        Show showB = showWith("access-B", "secret-B");

        // Each thread will use its own mocked request; only one of these
        // stubbings is hit per thread, so use lenient() to keep STRICT_STUBS
        // happy.
        lenient().when(showRepository.findByApiAccessApiAccessToken("access-A"))
                .thenReturn(Optional.of(showA));
        lenient().when(showRepository.findByApiAccessApiAccessToken("access-B"))
                .thenReturn(Optional.of(showB));

        final int iterations = 1000;
        final ConcurrentLinkedQueue<String> mismatches = new ConcurrentLinkedQueue<>();
        final AtomicReference<Throwable> firstError = new AtomicReference<>();
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(2);

        Runnable worker = () -> {
            try {
                // Pin each thread to a single tenant — any cross-thread bleed
                // shows up as observed != expected.
                String tokenToUse;
                String expectedShow;
                if (Thread.currentThread().getName().endsWith("-A")) {
                    tokenToUse = tokenA;
                    expectedShow = showA.getShowToken();
                } else {
                    tokenToUse = tokenB;
                    expectedShow = showB.getShowToken();
                }
                start.await();
                for (int i = 0; i < iterations; i++) {
                    HttpServletRequest req = mock(HttpServletRequest.class);
                    when(req.getHeader("Authorization")).thenReturn("Bearer " + tokenToUse);

                    boolean ok = authUtil.isApiJwtValid(req);
                    String observed = authUtil.getShowToken();
                    authUtil.clearShowToken(); // mimic AccessAspect's finally
                    if (!ok || !expectedShow.equals(observed)) {
                        mismatches.add("expected=" + expectedShow + " actual=" + observed
                                + " ok=" + ok + " thread=" + Thread.currentThread().getName());
                    }
                }
            } catch (Throwable t) {
                firstError.compareAndSet(null, t);
            } finally {
                done.countDown();
            }
        };

        ExecutorService pool = Executors.newFixedThreadPool(2, r -> {
            Thread t = new Thread(r);
            // Name encodes which tenant the thread pins to.
            int n = nextThreadIndex.getAndIncrement();
            t.setName("auth-race-" + (n % 2 == 0 ? "A" : "B"));
            return t;
        });
        try {
            pool.submit(worker);
            pool.submit(worker);
            start.countDown();
            assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }

        if (firstError.get() != null) {
            throw new AssertionError("worker threw", firstError.get());
        }
        assertThat(mismatches)
                .as("cross-thread showToken bleed observed in %d iterations", mismatches.size())
                .isEmpty();
    }

    private static final java.util.concurrent.atomic.AtomicInteger nextThreadIndex =
            new java.util.concurrent.atomic.AtomicInteger();
}
