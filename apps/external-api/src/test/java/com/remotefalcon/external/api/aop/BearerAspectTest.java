package com.remotefalcon.external.api.aop;

import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import com.remotefalcon.external.api.service.RfpbSessionService;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BearerAspect}. Focus on the security-critical
 * invariants:
 * <ul>
 *   <li>Missing / malformed header → 401, never proceeds, ThreadLocal stays clear
 *   <li>Bearer resolves → context set, proceed invoked, ThreadLocal cleared after
 *   <li>Bearer doesn't resolve → 401, ThreadLocal stays clear
 *   <li>Scope mismatch → 403, ThreadLocal stays clear
 *   <li><strong>Proceed throws → ThreadLocal still cleared</strong>
 *       (the finally-block guarantee from #149)
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class BearerAspectTest {

    private static final SessionContext CONTEXT = SessionContext.builder()
            .showSubdomain("myxmas")
            .showToken("show-token")
            .pageId("page-id")
            .scopes(List.of("viewer_page:read", "viewer_page:write"))
            .build();

    @Mock private RfpbSessionService sessionService;
    @Mock private ProceedingJoinPoint joinPoint;
    @Mock private RequiresBearer requiresBearer; // annotation instance

    private BearerAspect aspect;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        aspect = new BearerAspect(sessionService);
        request = new MockHttpServletRequest();
        // Bind the request to the current thread so RequestContextHolder
        // can find it inside the aspect.
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        SessionContextHolder.clear(); // start with a clean slate
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
        SessionContextHolder.clear();
    }

    // ----- header parsing -----

    @Test
    void rejects_whenAuthorizationHeaderMissing() throws Throwable {
        // No scope stub — aspect short-circuits before reaching scope check.
        Object result = aspect.resolveBearer(joinPoint, requiresBearer);

        assertThat(result).isInstanceOf(ResponseEntity.class);
        assertThat(((ResponseEntity<?>) result).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(joinPoint, never()).proceed();
        assertThat(SessionContextHolder.get()).isNull();
    }

    @Test
    void rejects_whenAuthorizationHeaderHasNoBearerPrefix() throws Throwable {
        request.addHeader("Authorization", "Basic abc123");

        Object result = aspect.resolveBearer(joinPoint, requiresBearer);

        assertThat(((ResponseEntity<?>) result).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(joinPoint, never()).proceed();
        assertThat(SessionContextHolder.get()).isNull();
    }

    @Test
    void rejects_whenBearerIsEmpty() throws Throwable {
        request.addHeader("Authorization", "Bearer ");

        Object result = aspect.resolveBearer(joinPoint, requiresBearer);

        assertThat(((ResponseEntity<?>) result).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(joinPoint, never()).proceed();
        assertThat(SessionContextHolder.get()).isNull();
    }

    // ----- session resolution -----

    @Test
    void rejects_whenBearerDoesNotResolve() throws Throwable {
        request.addHeader("Authorization", "Bearer unknown-bearer");
        when(sessionService.resolveBearerToContext("unknown-bearer")).thenReturn(Optional.empty());

        Object result = aspect.resolveBearer(joinPoint, requiresBearer);

        assertThat(((ResponseEntity<?>) result).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(joinPoint, never()).proceed();
        assertThat(SessionContextHolder.get()).isNull();
    }

    @Test
    void proceeds_whenBearerResolves_andNoScopeRequired() throws Throwable {
        request.addHeader("Authorization", "Bearer valid-bearer");
        when(sessionService.resolveBearerToContext("valid-bearer")).thenReturn(Optional.of(CONTEXT));
        when(requiresBearer.scope()).thenReturn("");
        when(joinPoint.proceed()).thenReturn("controller-result");

        Object result = aspect.resolveBearer(joinPoint, requiresBearer);

        assertThat(result).isEqualTo("controller-result");
        verify(joinPoint).proceed();
        // ThreadLocal cleared by finally — not visible to next request
        assertThat(SessionContextHolder.get()).isNull();
    }

    @Test
    void context_isAvailableDuringProceed() throws Throwable {
        request.addHeader("Authorization", "Bearer valid-bearer");
        when(sessionService.resolveBearerToContext("valid-bearer")).thenReturn(Optional.of(CONTEXT));
        when(requiresBearer.scope()).thenReturn("");
        // While proceed runs, the context should be visible
        when(joinPoint.proceed()).thenAnswer(invocation -> {
            SessionContext seen = SessionContextHolder.get();
            assertThat(seen).isEqualTo(CONTEXT);
            return "ok";
        });

        aspect.resolveBearer(joinPoint, requiresBearer);

        // After the aspect returns, ThreadLocal is cleared
        assertThat(SessionContextHolder.get()).isNull();
    }

    // ----- scope enforcement -----

    @Test
    void rejects_withForbidden_whenScopeMissing() throws Throwable {
        request.addHeader("Authorization", "Bearer scoped-bearer");
        SessionContext readOnly = SessionContext.builder()
                .scopes(List.of("viewer_page:read"))
                .build();
        when(sessionService.resolveBearerToContext("scoped-bearer")).thenReturn(Optional.of(readOnly));
        when(requiresBearer.scope()).thenReturn("viewer_page:write");

        Object result = aspect.resolveBearer(joinPoint, requiresBearer);

        // 403 (not 401) — bearer is valid, just under-scoped
        assertThat(((ResponseEntity<?>) result).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(joinPoint, never()).proceed();
        assertThat(SessionContextHolder.get()).isNull();
    }

    @Test
    void proceeds_whenScopeMatches() throws Throwable {
        request.addHeader("Authorization", "Bearer scoped-bearer");
        when(sessionService.resolveBearerToContext("scoped-bearer")).thenReturn(Optional.of(CONTEXT));
        when(requiresBearer.scope()).thenReturn("viewer_page:write");
        when(joinPoint.proceed()).thenReturn("ok");

        Object result = aspect.resolveBearer(joinPoint, requiresBearer);

        assertThat(result).isEqualTo("ok");
        verify(joinPoint).proceed();
    }

    // ----- ThreadLocal cleanup invariant (security critical) -----

    @Test
    void threadLocal_clearedEvenWhenProceedThrows() throws Throwable {
        request.addHeader("Authorization", "Bearer valid-bearer");
        when(sessionService.resolveBearerToContext("valid-bearer")).thenReturn(Optional.of(CONTEXT));
        when(requiresBearer.scope()).thenReturn("");
        when(joinPoint.proceed()).thenThrow(new IllegalStateException("controller blew up"));

        // The thrown exception must propagate (the aspect doesn't swallow);
        // and the ThreadLocal must STILL be cleared.
        assertThatThrownBy(() -> aspect.resolveBearer(joinPoint, requiresBearer))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("controller blew up");

        // This is the security-critical assertion. Without the finally
        // cleanup, the next request on this Tomcat thread would see the
        // previous request's context — re-introducing the cross-tenant
        // leak that issue-tracker #149 documented.
        assertThat(SessionContextHolder.get()).isNull();
    }

    @Test
    void resolveBearer_notCalled_whenScopeFails_butThreadLocalClearedAnyway() throws Throwable {
        request.addHeader("Authorization", "Bearer scoped-bearer");
        SessionContext readOnly = SessionContext.builder()
                .showSubdomain(CONTEXT.getShowSubdomain())
                .showToken(CONTEXT.getShowToken())
                .pageId(CONTEXT.getPageId())
                .scopes(List.of("viewer_page:read"))
                .build();
        when(sessionService.resolveBearerToContext("scoped-bearer")).thenReturn(Optional.of(readOnly));
        when(requiresBearer.scope()).thenReturn("viewer_page:write");

        aspect.resolveBearer(joinPoint, requiresBearer);

        // Even when we never SET the context (scope failed early),
        // the cleanup is still safe to call.
        assertThat(SessionContextHolder.get()).isNull();
    }
}
