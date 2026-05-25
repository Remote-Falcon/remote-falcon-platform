package com.remotefalcon.external.api.service;

import com.remotefalcon.auth.LaunchTokenPayload;
import com.remotefalcon.auth.LaunchTokenVerificationException;
import com.remotefalcon.auth.LaunchTokenVerifier;
import com.remotefalcon.external.api.document.RfpbLaunchJti;
import com.remotefalcon.external.api.document.RfpbSession;
import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.repository.RfpbLaunchJtiRepository;
import com.remotefalcon.external.api.repository.RfpbSessionRepository;
import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.external.api.response.SessionResponse;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ViewerPage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * Orchestrates the RF Page Builder session bearer lifecycle (PRD External
 * Viewer Page API, PR-B M3): exchange of launch JWTs for bearers, sliding
 * refresh, explicit revoke, and bearer-to-context resolution for the
 * {@link com.remotefalcon.external.api.aop.BearerAspect}.
 *
 * <p>Bearer format: 32 random bytes, base64url-encoded without padding.
 * Stored on disk as SHA-256(bearer) — the raw bearer never goes to Mongo,
 * so a compromised backup can't resurrect live sessions. Compares are
 * constant-time-ish at hash level (hash bytes are 32, equality is fast
 * regardless).
 *
 * <p>Replay defense: each successful exchange inserts the launch token's
 * {@code jti} into {@code rfpb_launch_jtis} with TTL. A second exchange
 * with the same {@code jti} hits a {@code DuplicateKeyException} from
 * Mongo's unique {@code _id} index and is rejected. The signer mints a
 * random {@code jti} per call, so this only fires on a deliberate replay
 * of the same launch URL.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RfpbSessionService {

    private static final SecureRandom RNG = new SecureRandom();
    private static final int BEARER_ENTROPY_BYTES = 32;

    private final LaunchTokenVerifier launchTokenVerifier;
    private final RfpbSessionRepository sessionRepository;
    private final RfpbLaunchJtiRepository jtiRepository;
    private final ShowRepository showRepository;

    @Value("${rfpb.session.ttl-seconds:1800}")
    private long sessionTtlSeconds;

    @Value("${rfpb.jti.dedupe-ttl-seconds:600}")
    private long jtiDedupeTtlSeconds;

    /**
     * Verify the launch JWT, dedupe its jti, mint a fresh bearer + session.
     * Single round-trip from RFPB's perspective; idempotent only in the
     * negative direction (a replayed jti rejects rather than re-issues).
     *
     * @throws LaunchTokenVerificationException if the JWT fails signature,
     *         issuer, audience, expiry, or claim-shape checks
     * @throws ReplayedLaunchTokenException if this {@code jti} has already
     *         been consumed
     */
    public SessionResponse exchangeLaunchToken(String launchJwt) {
        LaunchTokenPayload payload = launchTokenVerifier.verify(launchJwt);

        // Dedupe: insert the jti; duplicate-key means this token was already
        // exchanged. Do this BEFORE creating the session so a replay doesn't
        // leave a half-issued bearer floating around.
        Instant now = Instant.now();
        try {
            jtiRepository.save(RfpbLaunchJti.builder()
                    .jti(payload.getJti())
                    .consumedAt(now)
                    .expiresAt(now.plusSeconds(jtiDedupeTtlSeconds))
                    .build());
        } catch (DuplicateKeyException e) {
            throw new ReplayedLaunchTokenException("Launch token replay rejected: jti already consumed");
        }

        // Decision 7: auto-close older sessions for same (showToken, pageId).
        // Forgotten older tabs (laptop, phone, etc.) would otherwise pile up
        // and force the conflict UX to handle "I'm editing the same page in
        // two places" — its own headache. Simpler model: one user + one page
        // = one active session. Older tab's next API call surfaces 401 and
        // RFPB shows a "session was closed; reload" toast.
        String pageIdString = payload.getPageId() == null ? null : payload.getPageId().toString();
        if (pageIdString != null) {
            List<RfpbSession> existing = sessionRepository
                    .findByShowTokenAndPageIdAndRevokedAtIsNull(payload.getShowToken(), pageIdString);
            for (RfpbSession older : existing) {
                older.setRevokedAt(now);
            }
            if (!existing.isEmpty()) {
                sessionRepository.saveAll(existing);
            }
        }

        String bearer = mintBearerString();
        Instant expiresAt = now.plusSeconds(sessionTtlSeconds);
        RfpbSession session = RfpbSession.builder()
                .tokenHash(hash(bearer))
                .showSubdomain(payload.getShowSubdomain())
                .showToken(payload.getShowToken())
                .pageId(pageIdString)
                .scopes(payload.getScopes())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .build();
        sessionRepository.save(session);

        // Look up the bound page's display name so RFPB can render the binding
        // badge without a separate /v1/me round-trip. Best-effort: if the show
        // or page can't be found we return null pageName rather than failing
        // exchange — the editor can fetch it later via /v1/pages/:id.
        String pageName = lookupPageName(payload.getShowToken(), pageIdString);

        return SessionResponse.builder()
                .token(bearer)
                .expiresAt(expiresAt)
                .showSubdomain(session.getShowSubdomain())
                .pageId(session.getPageId())
                .pageName(pageName)
                .etag(payload.getEtag())
                .build();
    }

    private String lookupPageName(String showToken, String pageId) {
        if (showToken == null || pageId == null) {
            return null;
        }
        return showRepository.findByShowToken(showToken)
                .map(Show::getPages)
                .stream()
                .flatMap(List::stream)
                .filter(p -> p.getPageId() != null && pageId.equals(p.getPageId().toString()))
                .map(ViewerPage::getName)
                .findFirst()
                .orElse(null);
    }

    /**
     * Slide the expiry on an active session by another {@code session.ttl-
     * seconds} window. Returns the updated session metadata; throws if the
     * bearer is unknown, expired, or revoked.
     */
    public SessionResponse refresh(String bearer) {
        RfpbSession session = sessionRepository.findById(hash(bearer))
                .orElseThrow(() -> new SessionNotFoundException("Unknown bearer"));
        if (isExpiredOrRevoked(session)) {
            throw new SessionNotFoundException("Session expired or revoked");
        }
        Instant newExpiry = Instant.now().plusSeconds(sessionTtlSeconds);
        session.setExpiresAt(newExpiry);
        sessionRepository.save(session);

        return SessionResponse.builder()
                .token(bearer)
                .expiresAt(newExpiry)
                .showSubdomain(session.getShowSubdomain())
                .pageId(session.getPageId())
                .build();
    }

    /**
     * Explicit revoke. No-op (returns silently) if the bearer is already
     * unknown or expired — caller never needs to distinguish.
     */
    public void revoke(String bearer) {
        sessionRepository.findById(hash(bearer)).ifPresent(session -> {
            session.setRevokedAt(Instant.now());
            sessionRepository.save(session);
        });
    }

    /**
     * Used by {@link com.remotefalcon.external.api.aop.BearerAspect} on
     * every advised request. Returns empty if the bearer is unknown,
     * expired, or revoked — all three are 401 from the caller's perspective.
     */
    public Optional<SessionContext> resolveBearerToContext(String bearer) {
        if (bearer == null || bearer.isBlank()) {
            return Optional.empty();
        }
        return sessionRepository.findById(hash(bearer))
                .filter(session -> !isExpiredOrRevoked(session))
                .map(session -> SessionContext.builder()
                        .showSubdomain(session.getShowSubdomain())
                        .showToken(session.getShowToken())
                        .pageId(session.getPageId())
                        .scopes(session.getScopes())
                        .build());
    }

    private static boolean isExpiredOrRevoked(RfpbSession session) {
        return session.getRevokedAt() != null
                || (session.getExpiresAt() != null && session.getExpiresAt().isBefore(Instant.now()));
    }

    /**
     * 32 random bytes, base64url-encoded without padding. ~43 chars.
     * High entropy, URL-safe, no special handling needed in HTTP headers
     * or Set-Cookie.
     */
    private static String mintBearerString() {
        byte[] bytes = new byte[BEARER_ENTROPY_BYTES];
        RNG.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * SHA-256 of the bearer, base64url-encoded without padding.
     * Deterministic — same bearer always hashes to the same id.
     */
    static String hash(String bearer) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(bearer.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /**
     * Thrown when {@link #exchangeLaunchToken} hits a duplicate jti.
     * Translated to 401 by the SessionController.
     */
    public static class ReplayedLaunchTokenException extends RuntimeException {
        public ReplayedLaunchTokenException(String message) {
            super(message);
        }
    }

    /**
     * Thrown by {@link #refresh} when the bearer is unknown, expired, or
     * revoked. Translated to 401 by the SessionController.
     */
    public static class SessionNotFoundException extends RuntimeException {
        public SessionNotFoundException(String message) {
            super(message);
        }
    }
}
