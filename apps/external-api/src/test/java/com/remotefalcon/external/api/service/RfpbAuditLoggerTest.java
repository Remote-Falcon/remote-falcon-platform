package com.remotefalcon.external.api.service;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link RfpbAuditLogger}. Verifies the structured log
 * line carries the expected fields (operation, show, page, scope,
 * endpoint, ip, status, content_hash, session_hash) and that the
 * RFPB_AUDIT marker is attached so PostHog Logs filters can target
 * audit entries cleanly.
 *
 * <p>Uses Logback's {@link ListAppender} to capture log events in
 * process — no PostHog mock needed, the test only proves the slf4j
 * surface is correct. Round-trip through OTel Collector → PostHog Logs
 * is operational concern; that path is shared with every other service
 * log in this codebase and well-exercised.
 */
class RfpbAuditLoggerTest {

    private final RfpbAuditLogger auditLogger = new RfpbAuditLogger();
    private ListAppender<ILoggingEvent> appender;

    @BeforeEach
    void attachAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(RfpbAuditLogger.class);
        appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        SessionContextHolder.set(SessionContext.builder()
                .showSubdomain("myxmas")
                .showToken("show-token-test")
                .pageId("11111111-2222-3333-4444-555555555555")
                .scopes(List.of("viewer_page:write"))
                .build());
    }

    @AfterEach
    void detachAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(RfpbAuditLogger.class);
        logger.detachAppender(appender);
        SessionContextHolder.clear();
    }

    private static MockHttpServletRequest req() {
        MockHttpServletRequest r = new MockHttpServletRequest("PUT", "/v1/pages/abc");
        r.addHeader("Authorization", "Bearer test-bearer-value");
        r.setRemoteAddr("198.51.100.42");
        return r;
    }

    @Test
    void emits_singleInfoLine_withAuditMarker_andAllFields() {
        auditLogger.logWrite("page.update", req(), 200, "<p>persisted</p>", "viewer_page:write");

        assertThat(appender.list).hasSize(1);
        ILoggingEvent event = appender.list.get(0);
        assertThat(event.getLevel().toString()).isEqualTo("INFO");
        assertThat(event.getMarkerList()).isNotNull();
        assertThat(event.getMarkerList().get(0).getName()).isEqualTo("RFPB_AUDIT");

        String formatted = event.getFormattedMessage();
        assertThat(formatted).contains("op=\"page.update\"");
        assertThat(formatted).contains("show=\"show-token-test\"");
        assertThat(formatted).contains("page=\"11111111-2222-3333-4444-555555555555\"");
        assertThat(formatted).contains("scope=\"viewer_page:write\"");
        assertThat(formatted).contains("endpoint=\"/v1/pages/abc\"");
        assertThat(formatted).contains("ip=\"198.51.100.42\"");
        assertThat(formatted).contains("status=200");
        // content_hash and session_hash are sha256, not asserted exact —
        // just confirm they're populated (non-empty).
        assertThat(formatted).containsPattern("content_hash=\"[0-9a-f]{64}\"");
        assertThat(formatted).containsPattern("session_hash=\"[A-Za-z0-9_-]{43}\"");
    }

    @Test
    void usesXForwardedFor_whenPresent() {
        MockHttpServletRequest r = req();
        r.addHeader("X-Forwarded-For", "203.0.113.7, 10.0.0.1");

        auditLogger.logWrite("page.update", r, 200, "x", "viewer_page:write");

        // Leftmost XFF entry — the originating client
        assertThat(appender.list.get(0).getFormattedMessage()).contains("ip=\"203.0.113.7\"");
    }

    @Test
    void scrubsCrLfAndQuotes_fromXForwardedFor_toPreventLogInjection() {
        // X-Forwarded-For is client-controlled. An attacker that puts a
        // newline + forged audit line in the leftmost XFF entry should
        // not be able to escape our quoted-field log format. The single
        // emitted message should contain only the scrubbed value, never
        // the injected payload.
        MockHttpServletRequest r = req();
        r.addHeader("X-Forwarded-For",
                "1.2.3.4\r\nop=\"page.update\" status=200 ip=\"forged");

        auditLogger.logWrite("page.update", r, 200, "x", "viewer_page:write");

        assertThat(appender.list).hasSize(1);
        String formatted = appender.list.get(0).getFormattedMessage();
        assertThat(formatted).doesNotContain("\r");
        assertThat(formatted).doesNotContain("\n");
        // Each \r and \n becomes a single _; each " also becomes a single _.
        // The forged segment lands wholly inside the ip="..." field, with
        // no quote escape to terminate it early.
        assertThat(formatted)
                .contains("ip=\"1.2.3.4__op=_page.update_ status=200 ip=_forged\"");
    }

    @Test
    void emptyContent_andEmptySession_areLoggedAsEmptyStrings() {
        // Failure path: page not found → no persisted content, audit line
        // still emitted so the auditor sees the rejection.
        SessionContextHolder.clear();
        MockHttpServletRequest r = new MockHttpServletRequest("PUT", "/v1/pages/abc");
        // no Authorization header

        auditLogger.logWrite("page.update", r, 404, null, "viewer_page:write");

        String formatted = appender.list.get(0).getFormattedMessage();
        assertThat(formatted).contains("status=404");
        assertThat(formatted).contains("show=\"anonymous\"");
        assertThat(formatted).contains("content_hash=\"\"");
        assertThat(formatted).contains("session_hash=\"\"");
    }

    @Test
    void contentHash_isDeterministic_forSameContent() {
        auditLogger.logWrite("page.update", req(), 200, "<p>same</p>", "viewer_page:write");
        auditLogger.logWrite("page.update", req(), 200, "<p>same</p>", "viewer_page:write");

        String first = appender.list.get(0).getFormattedMessage();
        String second = appender.list.get(1).getFormattedMessage();
        // Extract the content_hash from both — they should match
        String hashA = first.replaceAll(".*content_hash=\"([0-9a-f]+)\".*", "$1");
        String hashB = second.replaceAll(".*content_hash=\"([0-9a-f]+)\".*", "$1");
        assertThat(hashA).isEqualTo(hashB);
    }

    @Test
    void contentHash_differs_forDifferentContent() {
        auditLogger.logWrite("page.update", req(), 200, "<p>one</p>", "viewer_page:write");
        auditLogger.logWrite("page.update", req(), 200, "<p>two</p>", "viewer_page:write");

        String hashOne = appender.list.get(0).getFormattedMessage()
                .replaceAll(".*content_hash=\"([0-9a-f]+)\".*", "$1");
        String hashTwo = appender.list.get(1).getFormattedMessage()
                .replaceAll(".*content_hash=\"([0-9a-f]+)\".*", "$1");
        assertThat(hashOne).isNotEqualTo(hashTwo);
    }
}
