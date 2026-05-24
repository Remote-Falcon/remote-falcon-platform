package com.remotefalcon.auth;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Claims carried in the launch JWT that hands a Remote Falcon show owner
 * off to RF Page Builder. Minted by {@code apps/control-panel}'s
 * {@code launchExternalEditor} GraphQL mutation, verified by
 * {@code apps/external-api}'s {@code POST /v1/sessions/exchange} endpoint.
 *
 * <p>The payload shape is intentionally OAuth 2.0 Authorization Code-flavored
 * (iss/aud/sub/iat/exp/jti) so swapping the implicit-consent shared-secret
 * issuance for a real /oauth/authorize endpoint later is purely additive —
 * the consume side ({@code LaunchTokenVerifier}) wouldn't need to change.
 *
 * <p>Single-use is enforced by {@code jti} dedupe on the consume side (see
 * external-api's {@code RfpbLaunchJtiRepository}). The signer side just
 * mints a random {@link UUID} per call.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LaunchTokenPayload {

    /** Issuer; always {@code "remotefalcon"}. */
    private String iss;

    /** Audience; always {@code "rfpagebuilder"}. */
    private String aud;

    /** Subject — RF user id (the show owner). */
    private String sub;

    /** Show subdomain (display + URL anchor for the RFPB UI). */
    private String showSubdomain;

    /**
     * Show's internal showToken. Used by external-api's session-exchange
     * to bind the resulting session bearer to a specific show — RFPB never
     * sees this string directly, only the session bearer that wraps it.
     */
    private String showToken;

    /** Page being launched into the visual editor. */
    private UUID pageId;

    /**
     * ETag of the page's current HTML+updatedAt at launch time. RFPB sends
     * this back in {@code If-Match} on its first PUT so a concurrent Monaco
     * save that happened mid-session surfaces as 412 immediately instead of
     * silently overwriting.
     */
    private String etag;

    /**
     * OAuth-style scopes the resulting session bearer should carry.
     * Typical: {@code ["viewer_page:read", "viewer_page:write"]}.
     */
    private List<String> scopes;

    /** Issued-at. */
    private Instant iat;

    /** Expiry. Launch tokens are short-lived (5 min) since they travel in a URL. */
    private Instant exp;

    /**
     * Unique token id. Enforces single-use via consume-side dedupe (replays
     * within the 5-minute exp window are rejected). Random UUID per mint.
     */
    private String jti;
}
