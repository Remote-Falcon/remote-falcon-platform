package com.remotefalcon.external.api.service;

import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Marker;
import org.slf4j.MarkerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * Structured audit logger for write operations on {@code /v1/**} (PR-C M4
 * of the RFPB integration). Emits a single INFO log entry per write
 * carrying everything the auditor needs:
 *
 * <ul>
 *   <li>{@code show} — the show token (acts as the show id; user identity
 *       is implicit since each show has one owner)
 *   <li>{@code scope} — the @RequiresBearer scope satisfied by the request
 *   <li>{@code endpoint} — request URI
 *   <li>{@code ip} — client IP (post-X-Forwarded-For if behind nginx)
 *   <li>{@code status} — HTTP response status
 *   <li>{@code content_hash} — SHA-256 of the persisted content (so an
 *       auditor can correlate audit lines with persisted versions
 *       without needing the content itself in the log)
 *   <li>{@code session_hash} — session-bearer hash bound to the request
 * </ul>
 *
 * <p>No new telemetry plumbing — the in-cluster OTel Collector
 * DaemonSet (Obs-1) tails container stdout via filelog and ships every
 * log line to PostHog Logs. Structured marker + key/value pairs survive
 * round-trip through that pipeline; PostHog Logs filter by these fields
 * directly. See ops/k8s/otel-collector/.
 *
 * <p>Read access (GET /v1/pages, GET /v1/pages/:id, GET /v1/me) is NOT
 * audited — would generate ~1 row per second per active editor with low
 * forensic value. If audit-of-reads becomes important (e.g., for
 * compliance) it's an additive change here.
 */
@Component
@Slf4j
public class RfpbAuditLogger {

    /**
     * Marker so PostHog Logs can filter audit entries cleanly:
     * {@code attributes.marker == "RFPB_AUDIT"}.
     */
    private static final Marker AUDIT_MARKER = MarkerFactory.getMarker("RFPB_AUDIT");

    public void logWrite(String operation, HttpServletRequest request, int statusCode,
                         String persistedContent, String scope) {
        SessionContext ctx = SessionContextHolder.get();
        String showToken = ctx == null ? "anonymous" : nullSafe(ctx.getShowToken());
        String pageId = ctx == null ? "" : nullSafe(ctx.getPageId());
        String contentHash = persistedContent == null ? "" : sha256Hex(persistedContent);
        String sessionHash = (request.getHeader("Authorization") == null)
                ? ""
                : hashBearer(request.getHeader("Authorization"));

        // Structured key=value format. Single line per audit event so it
        // survives newline-sensitive log parsers (PostHog Logs is fine
        // either way; this keeps the line scannable in raw kubectl logs
        // too). Quote values so embedded spaces don't break parsers.
        log.info(AUDIT_MARKER,
                "rfpb_audit op=\"{}\" show=\"{}\" page=\"{}\" scope=\"{}\" endpoint=\"{}\" "
                        + "ip=\"{}\" status={} content_hash=\"{}\" session_hash=\"{}\"",
                operation,
                showToken,
                pageId,
                scope,
                request.getRequestURI(),
                clientIp(request),
                statusCode,
                contentHash,
                sessionHash);
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s;
    }

    /**
     * SHA-256 of the persisted content, hex-encoded. Same algo as
     * {@link com.remotefalcon.external.api.service.ViewerPageEtag} but
     * over raw content (not html||updatedAt) — auditor uses this to
     * correlate with the actual persisted version.
     */
    private static String sha256Hex(String content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(content.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            return "";
        }
    }

    /**
     * Hashed bearer (matches RfpbSession storage hash) so the audit line
     * can be cross-referenced with rfpb_sessions without ever putting
     * the raw bearer in a log.
     */
    private static String hashBearer(String authorizationHeader) {
        String prefix = "Bearer ";
        if (!authorizationHeader.startsWith(prefix)) return "";
        String raw = authorizationHeader.substring(prefix.length()).trim();
        if (raw.isEmpty()) return "";
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            return "";
        }
    }

    /**
     * Client IP — honors X-Forwarded-For if present (production traffic
     * goes through nginx-ingress), falls back to remote address. Takes
     * the leftmost entry of XFF (the originating client).
     *
     * <p>XFF is client-controlled. Tomcat rejects CR/LF in the request
     * line, but not in arbitrary header values, so an attacker could put
     * {@code "\nfake_audit_line\n} in the leftmost XFF entry and forge
     * additional audit log lines for forensic confusion. SLF4J parameter
     * substitution does not scrub these. {@link #scrub(String)} strips
     * the characters that would terminate or break out of our
     * quoted-field log format before the value reaches any logger.
     */
    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            String raw = comma > 0 ? xff.substring(0, comma).trim() : xff.trim();
            return scrub(raw);
        }
        return scrub(request.getRemoteAddr());
    }

    /**
     * Strips CR, LF, and double-quote chars from a value bound for the
     * audit log. Keeps everything else verbatim — the goal is log
     * integrity (no line injection, no field escape), not input
     * validation.
     */
    private static String scrub(String value) {
        if (value == null) {
            return null;
        }
        return value.replaceAll("[\\r\\n\"]", "_");
    }
}
