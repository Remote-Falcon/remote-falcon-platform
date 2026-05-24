package com.remotefalcon.external.api.aop;

import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import com.remotefalcon.external.api.service.RfpbSessionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Optional;

/**
 * Around-advice for {@link RequiresBearer}. Resolves the
 * {@code Authorization: Bearer <token>} header to a {@link SessionContext}
 * via {@link RfpbSessionService}, enforces the declared scope, deposits
 * the context on the current thread, and guarantees cleanup.
 *
 * <p>Cleanup contract: the {@code finally} block calls
 * {@link SessionContextHolder#clear()} regardless of whether the request
 * succeeded, failed validation, or threw. Mirror of the
 * {@code AuthUtil.clearShowToken} contract in {@link AccessAspect} — same
 * Tomcat thread-pool leak concern that drove issue-tracker #149.
 *
 * <p>Distinct from {@link AccessAspect} so the two auth models can coexist
 * cleanly on different endpoints. Never put both on the same controller
 * method.
 */
@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
public class BearerAspect {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final RfpbSessionService rfpbSessionService;

    @Around("@annotation(requiresBearer)")
    public Object resolveBearer(ProceedingJoinPoint pjp, RequiresBearer requiresBearer)
            throws Throwable {
        HttpServletRequest request = ((ServletRequestAttributes)
                RequestContextHolder.currentRequestAttributes()).getRequest();
        try {
            String bearer = extractBearer(request);
            if (bearer == null) {
                return ResponseEntity.status(401).build();
            }
            Optional<SessionContext> context = rfpbSessionService.resolveBearerToContext(bearer);
            if (context.isEmpty()) {
                return ResponseEntity.status(401).build();
            }
            if (!hasRequiredScope(context.get(), requiresBearer.scope())) {
                // Bearer is valid but doesn't carry the scope the endpoint
                // requires (e.g. a viewer_page:read session hitting a PUT).
                // Distinguish from auth failure with a 403 — caller learns
                // their session works but lacks the right scope.
                return ResponseEntity.status(403).build();
            }
            SessionContextHolder.set(context.get());
            return pjp.proceed();
        } finally {
            SessionContextHolder.clear();
        }
    }

    /**
     * Extract the raw bearer from the {@code Authorization} header.
     * Returns null on missing/malformed header — never throws, never
     * leaks the partial header into logs.
     */
    private static String extractBearer(HttpServletRequest request) {
        String header = request.getHeader(AUTHORIZATION_HEADER);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            return null;
        }
        String token = header.substring(BEARER_PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }

    private static boolean hasRequiredScope(SessionContext context, String requiredScope) {
        if (requiredScope == null || requiredScope.isEmpty()) {
            return true; // no scope requirement
        }
        return context.getScopes() != null && context.getScopes().contains(requiredScope);
    }
}
