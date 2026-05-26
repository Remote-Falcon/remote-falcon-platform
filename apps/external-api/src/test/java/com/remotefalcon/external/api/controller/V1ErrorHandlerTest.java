package com.remotefalcon.external.api.controller;

import com.remotefalcon.external.api.service.PageApiService.SessionContextMissingException;
import com.remotefalcon.external.api.service.RfpbAuditLogger;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Tests for the sanitized error envelope on /v1/** (audit finding L3 +
 * follow-up: post-integration audit added the audit-log emit on 401/500).
 *
 * <p>Pins:
 *   - SessionContextMissingException → 401, not 500
 *   - Generic Exception → 500 with a fixed code, NO message echo
 *   - Envelope shape: error/status/ts; no path, headers, or stack
 *   - 401 + 500 both emit an rfpb_audit line (op="v1.unauthorized" / "v1.error")
 */
class V1ErrorHandlerTest {

    private final RfpbAuditLogger auditLogger = mock(RfpbAuditLogger.class);
    private final V1ErrorHandler handler = new V1ErrorHandler(auditLogger);
    private final HttpServletRequest req = mock(HttpServletRequest.class);

    @Test
    void sessionContextMissing_returns401_withSanitizedEnvelope_andAudits() {
        ResponseEntity<Map<String, Object>> resp =
                handler.handleSessionContextMissing(new SessionContextMissingException(), req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(resp.getBody())
                .containsEntry("error", "unauthorized")
                .containsEntry("status", 401)
                .containsKey("ts");
        assertThat(resp.getBody()).doesNotContainKeys("path", "headers", "message", "stackTrace");
        verify(auditLogger).logWrite(eq("v1.unauthorized"), eq(req), eq(401), any(), eq(""));
    }

    @Test
    void unknownException_returns500_withFixedCode_noMessageEcho_andAudits() {
        // Pretend the underlying exception's message contains DB internals
        // that must NOT leak to the caller (e.g. table name, query text).
        Exception underlying = new RuntimeException(
                "Could not connect to mongo at internal-mongo.cluster.local:27017");

        ResponseEntity<Map<String, Object>> resp = handler.handleAny(underlying, req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(resp.getBody())
                .containsEntry("error", "internal_error")
                .containsEntry("status", 500);
        // The underlying message must not be echoed in any form.
        assertThat(resp.getBody().toString()).doesNotContain("internal-mongo");
        assertThat(resp.getBody().toString()).doesNotContain("mongo");
        assertThat(resp.getBody().toString()).doesNotContain("27017");
        verify(auditLogger).logWrite(eq("v1.error"), eq(req), eq(500), any(), eq(""));
    }
}
