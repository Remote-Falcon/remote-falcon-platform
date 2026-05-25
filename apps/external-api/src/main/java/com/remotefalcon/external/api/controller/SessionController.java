package com.remotefalcon.external.api.controller;

import com.remotefalcon.auth.LaunchTokenVerificationException;
import com.remotefalcon.external.api.aop.RequiresBearer;
import com.remotefalcon.external.api.request.SessionExchangeRequest;
import com.remotefalcon.external.api.response.SessionResponse;
import com.remotefalcon.external.api.service.RfpbSessionService;
import com.remotefalcon.external.api.service.RfpbSessionService.ReplayedLaunchTokenException;
import com.remotefalcon.external.api.service.RfpbSessionService.SessionNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for the RF Page Builder session lifecycle (PRD External
 * Viewer Page API, PR-B M3). All three endpoints are scoped under
 * {@code /v1/sessions}.
 *
 * <ul>
 *   <li>{@code POST /v1/sessions/exchange} — no auth (the body IS the
 *       auth: a launch JWT minted by control-panel). Returns a fresh
 *       session bearer.
 *   <li>{@code POST /v1/sessions/refresh} — bearer auth via
 *       {@link RequiresBearer}. Slides expiry.
 *   <li>{@code DELETE /v1/sessions/current} — bearer auth. Revokes the
 *       current bearer.
 * </ul>
 *
 * <p>All endpoints return 401 on auth-class failures (unknown bearer,
 * expired, revoked, invalid launch token, replay). Never leak which
 * specific check failed.
 */
@RestController
@RequestMapping("/v1/sessions")
@RequiredArgsConstructor
@Slf4j
public class SessionController {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final RfpbSessionService rfpbSessionService;

    /**
     * Trade a launch JWT for a session bearer. Single-use — the launch
     * token's jti is deduped at exchange time.
     *
     * <p>Accepts the launch token from either {@code Authorization: Bearer}
     * (RFPB's preferred form — keeps the token out of body / proxy logs) or
     * a JSON body with {@code launchToken}. Header wins if both are present.
     */
    @PostMapping("/exchange")
    public ResponseEntity<SessionResponse> exchange(
            HttpServletRequest request,
            @RequestBody(required = false) SessionExchangeRequest body) {
        String launchToken = extractBearer(request);
        if (launchToken == null && body != null) {
            launchToken = body.getLaunchToken();
        }
        if (launchToken == null || launchToken.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        try {
            return ResponseEntity.ok(rfpbSessionService.exchangeLaunchToken(launchToken));
        } catch (LaunchTokenVerificationException | ReplayedLaunchTokenException e) {
            // Both surface as 401. Don't differentiate to the caller —
            // "your launch token isn't valid for any reason" is the
            // useful signal; specifics are reconnaissance-friendly.
            return ResponseEntity.status(401).build();
        }
    }

    /**
     * Extend the session expiry by another full window. Requires a
     * currently-valid bearer; same 401 on any auth-class failure.
     */
    @PostMapping("/refresh")
    @RequiresBearer
    public ResponseEntity<SessionResponse> refresh(HttpServletRequest request) {
        String bearer = extractBearer(request);
        if (bearer == null) {
            // Shouldn't reach here — BearerAspect already validated. Belt
            // and suspenders in case of misconfigured routing.
            return ResponseEntity.status(401).build();
        }
        try {
            return ResponseEntity.ok(rfpbSessionService.refresh(bearer));
        } catch (SessionNotFoundException e) {
            return ResponseEntity.status(401).build();
        }
    }

    /**
     * Explicit revoke of the current bearer. Always returns 204; never
     * leaks whether the bearer was already revoked or unknown.
     */
    @DeleteMapping("/current")
    @RequiresBearer
    public ResponseEntity<Void> revokeCurrent(HttpServletRequest request) {
        String bearer = extractBearer(request);
        if (bearer != null) {
            rfpbSessionService.revoke(bearer);
        }
        return ResponseEntity.noContent().build();
    }

    private static String extractBearer(HttpServletRequest request) {
        String header = request.getHeader(AUTHORIZATION_HEADER);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            return null;
        }
        String token = header.substring(BEARER_PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }
}
