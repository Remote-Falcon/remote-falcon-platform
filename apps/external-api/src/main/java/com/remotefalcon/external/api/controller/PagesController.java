package com.remotefalcon.external.api.controller;

import com.remotefalcon.external.api.aop.RequiresBearer;
import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import com.remotefalcon.external.api.request.PageWriteRequest;
import com.remotefalcon.external.api.response.PageResponse;
import com.remotefalcon.external.api.service.PageApiService;
import com.remotefalcon.external.api.service.PageApiService.EtagMismatchException;
import com.remotefalcon.external.api.service.PageApiService.PageNotFoundException;
import com.remotefalcon.external.api.service.RfpbAuditLogger;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST endpoints for the RFPB-facing viewer-page CRUD surface (PR-B M4).
 * All endpoints under {@code /v1/pages*} are gated by {@link
 * RequiresBearer} — bearer required + appropriate scope enforced by
 * {@link com.remotefalcon.external.api.aop.BearerAspect}.
 *
 * <p>v1 scope (intentionally minimal for the RFPB integration):
 * <ul>
 *   <li>{@code GET /v1/pages} — list. Scope: viewer_page:read.
 *   <li>{@code GET /v1/pages/:pageId} — fetch one (ETag header).
 *       Scope: viewer_page:read.
 *   <li>{@code PUT /v1/pages/:pageId} — update (If-Match required).
 *       Scope: viewer_page:write.
 *   <li>{@code GET /v1/me} — session introspection. No scope required
 *       beyond a valid bearer.
 * </ul>
 *
 * <p>{@code POST /v1/pages} (create) and {@code DELETE /v1/pages/:pageId}
 * are deferred to a follow-up: RFPB's editor flow doesn't create or
 * delete pages — those happen in the RF control panel's Monaco editor.
 * If a third party ever needs them, add here against the same bearer
 * model. Same for {@code POST /v1/pages/:pageId:activate} which is a
 * multi-page atomic toggle better-suited to v1.1.
 */
@RestController
@RequestMapping("/v1")
@RequiredArgsConstructor
@Slf4j
public class PagesController {

    private final PageApiService pageApiService;
    private final RfpbAuditLogger auditLogger;

    /**
     * Cache directive for bearer-authenticated GETs. Intermediates are
     * supposed to respect Authorization-bound responses but defense in
     * depth — explicit no-store, private removes any ambiguity for
     * intermediaries (audit finding L1).
     */
    private static final CacheControl NO_STORE = CacheControl.noStore().cachePrivate();

    /** List all viewer pages on the bearer's bound show. */
    @GetMapping("/pages")
    @RequiresBearer(scope = "viewer_page:read")
    public ResponseEntity<List<PageResponse>> listPages() {
        return ResponseEntity.ok().cacheControl(NO_STORE).body(pageApiService.listPages());
    }

    /**
     * Fetch one page. Carries the {@code ETag} HTTP header so the client
     * can use {@code If-Match} on a subsequent PUT.
     */
    @GetMapping("/pages/{pageId}")
    @RequiresBearer(scope = "viewer_page:read")
    public ResponseEntity<PageResponse> getPage(@PathVariable String pageId) {
        UUID id;
        try {
            id = UUID.fromString(pageId);
        } catch (IllegalArgumentException e) {
            // Malformed UUID — treat as not-found (same external surface
            // as a real not-found; don't leak whether the value is
            // structurally invalid vs missing).
            return ResponseEntity.notFound().build();
        }
        try {
            PageResponse response = pageApiService.getPage(id);
            return ResponseEntity.ok()
                    .cacheControl(NO_STORE)
                    .eTag("\"" + response.getEtag() + "\"")
                    .body(response);
        } catch (PageNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Update a page.
     *
     * <p>Default path: requires the {@code If-Match} header carrying the
     * ETag of the version the client last read. Mismatch returns 412 with
     * the current server state in the body so the client can present a
     * conflict modal. Missing header returns 428 Precondition Required.
     *
     * <p>Force path ({@code ?force=true}): {@code If-Match} is optional
     * and any value (matching, stale, or absent) is bypassed. RFPB sets
     * this when the user clicks "Overwrite anyway" in the conflict modal —
     * sending the stale ETag would just re-trigger the 412, so the client
     * intentionally omits the header. Force-PUTs are audit-logged under
     * {@code op="page.update.force"} so a security review can spot the
     * override pattern in the audit feed.
     */
    @PutMapping("/pages/{pageId}")
    @RequiresBearer(scope = "viewer_page:write")
    public ResponseEntity<?> updatePage(
            @PathVariable String pageId,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestParam(value = "force", required = false, defaultValue = "false") boolean force,
            @RequestBody PageWriteRequest body,
            HttpServletRequest request) {
        String op = force ? "page.update.force" : "page.update";
        UUID id;
        try {
            id = UUID.fromString(pageId);
        } catch (IllegalArgumentException e) {
            auditLogger.logWrite(op, request, 404, null, "viewer_page:write");
            return ResponseEntity.notFound().build();
        }
        if (body == null) {
            auditLogger.logWrite(op, request, 400, null, "viewer_page:write");
            return ResponseEntity.badRequest().body(v1ErrorBody(400, "bad_request"));
        }
        // Conditional-request enforcement is owner-side: without force, the
        // client MUST supply If-Match. 428 Precondition Required (RFC 6585)
        // is the precise answer — distinguishes "you forgot the header" from
        // "you sent a stale ETag" (412).
        if (!force && (ifMatch == null || ifMatch.isBlank())) {
            auditLogger.logWrite(op, request, 428, null, "viewer_page:write");
            return ResponseEntity.status(428).body(v1ErrorBody(428, "precondition_required"));
        }
        String ifMatchClean = stripQuotes(ifMatch);
        try {
            PageResponse updated = pageApiService.updatePage(id,
                    body.getName(), body.getActive(), body.getHtml(), ifMatchClean, force);
            // Successful write — log the persisted content hash so an
            // auditor can correlate this audit line with the rfpb_sessions
            // + the page's current ETag.
            auditLogger.logWrite(op, request, 200, updated.getHtml(), "viewer_page:write");
            return ResponseEntity.ok()
                    .eTag("\"" + updated.getEtag() + "\"")
                    .body(updated);
        } catch (PageNotFoundException e) {
            auditLogger.logWrite(op, request, 404, null, "viewer_page:write");
            return ResponseEntity.notFound().build();
        } catch (EtagMismatchException e) {
            // 412 with the current server state so the client can show a
            // conflict modal with the latest version. ETag header carries
            // the current ETag too — clients can use it as If-Match in
            // their "overwrite anyway" follow-up. Unreachable when force=true
            // (service skips the etag check entirely in that case).
            auditLogger.logWrite(op, request, 412, null, "viewer_page:write");
            return ResponseEntity.status(412)
                    .eTag("\"" + e.getCurrentServerState().getEtag() + "\"")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(e.getCurrentServerState());
        } catch (IllegalArgumentException e) {
            // Sanitizer or size-cap rejection — 400 with the canonical
            // v1 envelope. The exception message is omitted from the
            // body (could leak DB internals on a future refactor); the
            // status code distinguishes this from the missing-body 400
            // via the audit log's status field.
            auditLogger.logWrite(op, request, 400, null, "viewer_page:write");
            return ResponseEntity.badRequest().body(v1ErrorBody(400, "bad_request"));
        }
    }

    /**
     * Build the canonical {@code /v1/**} error envelope used by both this
     * controller (for typed 4xx responses it owns) and {@link V1ErrorHandler}
     * (for uncaught exceptions). Same shape on every 4xx/5xx return from a
     * /v1 endpoint so clients can branch on the {@code error} code without
     * special-casing each origin.
     */
    private static Map<String, Object> v1ErrorBody(int status, String code) {
        return Map.of(
                "error", code,
                "status", status,
                "ts", Instant.now().toString());
    }

    /**
     * Session introspection. Returns the show + page + scopes the
     * current bearer is bound to, plus the bearer-derived user identity
     * if RFPB needs it for rendering chrome.
     */
    @GetMapping("/me")
    @RequiresBearer
    public ResponseEntity<Map<String, Object>> me() {
        SessionContext ctx = SessionContextHolder.get();
        if (ctx == null) {
            // BearerAspect ensured the context exists; this is defensive.
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok().cacheControl(NO_STORE).body(Map.of(
                "showSubdomain", ctx.getShowSubdomain(),
                "pageId", ctx.getPageId() == null ? "" : ctx.getPageId(),
                "scopes", ctx.getScopes() == null ? List.of() : ctx.getScopes()));
    }

    /**
     * HTTP ETags are conventionally quoted: {@code If-Match: "<hex>"}.
     * Strip quotes for internal comparison so clients can send either
     * the quoted or raw form.
     */
    private static String stripQuotes(String etag) {
        if (etag == null) return null;
        String trimmed = etag.trim();
        if (trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length() >= 2) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }
}
