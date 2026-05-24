package com.remotefalcon.external.api.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

/**
 * Persistent session bearer for the RF Page Builder integration (PRD
 * External Viewer Page API, PR-B M3). Created when a launch JWT is
 * exchanged at {@code POST /v1/sessions/exchange}; consumed on every
 * subsequent API call from RFPB during the editor session.
 *
 * <p>Stored in collection {@code rfpb_sessions}. {@code _id} is the
 * <strong>hash</strong> of the raw bearer (SHA-256, base64url-encoded) —
 * the raw bearer never goes to disk so a compromised Mongo backup can't
 * resurrect live sessions.
 *
 * <p>TTL is enforced by a Mongo TTL index on {@code expiresAt} — created
 * declaratively via the {@code @Indexed(expireAfter)} annotation below.
 * Sliding expiry is implemented by {@code RfpbSessionService.refresh}
 * updating {@code expiresAt} on each successful API call.
 */
@Document(collection = "rfpb_sessions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RfpbSession {

    /** SHA-256 hash of the bearer, base64url-encoded. */
    @Id
    private String tokenHash;

    /** Bound show — set at exchange time from the launch JWT. */
    private String showSubdomain;
    private String showToken;

    /**
     * Specific page the editor session is scoped to. Single-page in v1 —
     * one launch = one session = one page.
     */
    private String pageId; // UUID stored as string for Mongo simplicity

    /** OAuth-style scopes carried from the launch token. */
    private List<String> scopes;

    private Instant issuedAt;

    /**
     * Auto-expire trigger. Mongo's TTL monitor reaps documents where
     * {@code expiresAt < now}. {@code expireAfter = "0"} means "exactly
     * when the timestamp passes" (rather than N seconds after) — RFPB
     * relies on this for clean session cleanup without explicit revocation
     * for the common case of "user closed the tab."
     */
    @Indexed(expireAfter = "0")
    private Instant expiresAt;

    /**
     * Set when the session is explicitly revoked (DELETE /v1/sessions/
     * current, auto-dedupe on new launch for same user+page, show deletion
     * cascade). Revoked sessions stay in Mongo until expiresAt for audit
     * but {@code resolveBearerToContext} treats them as expired.
     */
    private Instant revokedAt;
}
