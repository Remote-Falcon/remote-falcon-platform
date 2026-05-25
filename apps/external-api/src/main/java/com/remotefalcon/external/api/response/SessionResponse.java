package com.remotefalcon.external.api.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Response body for {@code POST /v1/sessions/exchange} and {@code POST
 * /v1/sessions/refresh}. RFPB stores the {@code token} in an httpOnly
 * cookie scoped to its domain; subsequent API calls send it as
 * {@code Authorization: Bearer <token>}.
 *
 * <p>Field is named {@code token} (not {@code bearer}) to match RFPB's
 * client expectation — RFPB's exchange consumer parses {@code data.token}.
 * "Bearer" is the HTTP authentication scheme; "token" is the value carried.
 *
 * <p>{@code expiresAt} lets RFPB drive a client-side refresh schedule
 * before the token hard-expires. {@code showSubdomain} and {@code pageId}
 * let the RFPB UI render the binding badge without a separate
 * {@code GET /v1/me} round-trip.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionResponse {
    private String token;
    private Instant expiresAt;
    private String showSubdomain;
    private String pageId;
    /** Display name of the bound page; lets RFPB render the binding badge without an extra round-trip. */
    private String pageName;
    /** Current page ETag at exchange time; RFPB uses this as the first {@code If-Match} value on PUT. */
    private String etag;
}
