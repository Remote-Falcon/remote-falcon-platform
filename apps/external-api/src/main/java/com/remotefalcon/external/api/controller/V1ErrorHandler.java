package com.remotefalcon.external.api.controller;

import com.remotefalcon.external.api.service.PageApiService.SessionContextMissingException;
import com.remotefalcon.external.api.service.RfpbAuditLogger;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;

/**
 * Sanitized error envelope for the RFPB-facing {@code /v1/**} endpoints
 * (PR-F of the RFPB integration, audit finding L3).
 *
 * <p>Spring's default error attributes can include request path, headers,
 * and a stack-trace summary depending on configuration. For the bearer-
 * authenticated /v1/** surface we want a deliberate, minimal shape:
 *
 * <pre>{@code
 * { "error": "<class>", "status": 4xx|5xx, "ts": "<iso8601>" }
 * }</pre>
 *
 * <p>No path echo, no header echo, no message, no stack. Specific
 * controller methods already return their own typed bodies (e.g. the 412
 * conflict-state envelope from PUT /v1/pages/:id); this advice only
 * handles uncaught exceptions that escape a controller.
 *
 * <p>Restricted to {@code /v1/**} via the {@code basePackages} pattern —
 * legacy controllers retain their existing error behavior.
 *
 * <p>{@code Ordered.LOWEST_PRECEDENCE} so specific handlers in individual
 * controllers (if any are added later) win.
 */
@RestControllerAdvice(basePackageClasses = PagesController.class)
@Order(Ordered.LOWEST_PRECEDENCE)
@Slf4j
@RequiredArgsConstructor
public class V1ErrorHandler {

    private final RfpbAuditLogger auditLogger;

    /** Missing or empty session context — surfaces as 401 rather than 500. */
    @ExceptionHandler(SessionContextMissingException.class)
    public ResponseEntity<Map<String, Object>> handleSessionContextMissing(
            SessionContextMissingException ex, HttpServletRequest req) {
        log.warn("Session context missing on /v1 request — call path bypassed BearerAspect");
        // Audit 401s on /v1/** so a probe-the-bearer-aspect attack surfaces
        // in the audit feed alongside legitimate writes.
        auditLogger.logWrite("v1.unauthorized", req, 401, null, "");
        return error(HttpStatus.UNAUTHORIZED, "unauthorized");
    }

    /**
     * Anything we didn't anticipate. Returns 500 with a sanitized envelope
     * — no class name from the exception, no message (could leak internals
     * like DB error text), no stack. The full exception still hits the
     * server log via {@code log.error}.
     *
     * <p>Also writes an audit line so server-side failures on {@code /v1/**}
     * show up in the audit feed alongside the per-controller 200/4xx
     * entries — operationally important: a spike of audit lines with
     * {@code op="v1.error"} is a strong "the integration is broken"
     * signal that's otherwise only visible in raw app logs.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAny(Exception ex, HttpServletRequest req) {
        log.error("Unhandled /v1 exception", ex);
        auditLogger.logWrite("v1.error", req, 500, null, "");
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error");
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code) {
        return ResponseEntity.status(status).body(Map.of(
                "error", code,
                "status", status.value(),
                "ts", Instant.now().toString()));
    }
}
