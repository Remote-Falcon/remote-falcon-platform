package com.remotefalcon.external.api.controller;

import com.remotefalcon.external.api.service.PageApiService.SessionContextMissingException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;

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
public class V1ErrorHandler {

    /** Missing or empty session context — surfaces as 401 rather than 500. */
    @ExceptionHandler(SessionContextMissingException.class)
    public ResponseEntity<Map<String, Object>> handleSessionContextMissing(
            SessionContextMissingException ex, WebRequest req) {
        log.warn("Session context missing on /v1 request — call path bypassed BearerAspect");
        return error(HttpStatus.UNAUTHORIZED, "unauthorized");
    }

    /**
     * Anything we didn't anticipate. Returns 500 with a sanitized envelope
     * — no class name from the exception, no message (could leak internals
     * like DB error text), no stack. The full exception still hits the
     * server log via {@code log.error}.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAny(Exception ex, WebRequest req) {
        log.error("Unhandled /v1 exception", ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error");
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code) {
        return ResponseEntity.status(status).body(Map.of(
                "error", code,
                "status", status.value(),
                "ts", Instant.now().toString()));
    }
}
