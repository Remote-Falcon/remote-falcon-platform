package com.remotefalcon.external.api.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Response body for {@code POST /v1/sessions/exchange} and {@code POST
 * /v1/sessions/refresh}. RFPB stores the {@code bearer} in an httpOnly
 * cookie scoped to its domain; subsequent API calls send it as
 * {@code Authorization: Bearer <bearer>}.
 *
 * <p>{@code expiresAt} lets RFPB drive a client-side refresh schedule
 * before the bearer hard-expires. {@code showSubdomain} and {@code
 * pageId} let the RFPB UI render the binding badge without a separate
 * {@code GET /v1/me} round-trip.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionResponse {
    private String bearer;
    private Instant expiresAt;
    private String showSubdomain;
    private String pageId;
}
