package com.remotefalcon.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.Claim;
import com.auth0.jwt.interfaces.DecodedJWT;

import java.util.UUID;

/**
 * Verifies HS256-signed launch JWTs minted by {@link LaunchTokenSigner}.
 * Consumed by {@code apps/external-api}'s {@code POST /v1/sessions/exchange}
 * endpoint.
 *
 * <p>Checks (in order, with the first failure throwing):
 * <ol>
 *   <li>Signature against the shared secret
 *   <li>Issuer = {@value #EXPECTED_ISSUER}
 *   <li>Audience contains {@value #EXPECTED_AUDIENCE}
 *   <li>Not expired
 *   <li>All required claims present and well-typed
 * </ol>
 *
 * <p>Does <strong>NOT</strong> check {@code jti} dedupe — that's the caller's
 * job, because the dedupe store is environment-specific (external-api uses a
 * Mongo TTL collection). Caller invokes verifier first, then tries to consume
 * the returned {@code jti} from their store; a duplicate-key on insert is the
 * replay signal.
 *
 * <p>Thread-safe. One instance per shared secret.
 */
public class LaunchTokenVerifier {

    /** Hard-coded — only RF mints these tokens. */
    public static final String EXPECTED_ISSUER = "remotefalcon";

    /** Hard-coded — only RFPB consumes them. */
    public static final String EXPECTED_AUDIENCE = "rfpagebuilder";

    private final JWTVerifier verifier;

    public LaunchTokenVerifier(String sharedSecret) {
        if (sharedSecret == null || sharedSecret.length() < 32) {
            throw new IllegalArgumentException(
                    "Launch token shared secret must be non-null and at least 32 chars");
        }
        Algorithm algorithm = Algorithm.HMAC256(sharedSecret);
        this.verifier = JWT.require(algorithm)
                .withIssuer(EXPECTED_ISSUER)
                .withAudience(EXPECTED_AUDIENCE)
                .acceptLeeway(0) // strict — no clock skew tolerance in v1
                .build();
    }

    /**
     * Verify the token and return the parsed payload. Throws
     * {@link LaunchTokenVerificationException} on any failure — caller
     * should translate this into HTTP 401.
     */
    public LaunchTokenPayload verify(String token) {
        if (token == null || token.isBlank()) {
            throw new LaunchTokenVerificationException("token must not be null or blank");
        }
        DecodedJWT decoded;
        try {
            decoded = verifier.verify(token);
        } catch (JWTVerificationException e) {
            // Includes signature mismatch, expired, wrong issuer/audience,
            // malformed JWT structure. Don't leak which specific check
            // failed — that's reconnaissance-friendly.
            throw new LaunchTokenVerificationException("Invalid launch token", e);
        }

        try {
            return LaunchTokenPayload.builder()
                    .iss(decoded.getIssuer())
                    .aud(firstAudience(decoded))
                    .sub(decoded.getSubject())
                    .showSubdomain(requireString(decoded, "showSubdomain"))
                    .showToken(requireString(decoded, "showToken"))
                    .pageId(UUID.fromString(requireString(decoded, "pageId")))
                    .etag(requireString(decoded, "etag"))
                    .scopes(requireStringList(decoded, "scopes"))
                    .iat(decoded.getIssuedAt() == null ? null : decoded.getIssuedAt().toInstant())
                    .exp(decoded.getExpiresAt() == null ? null : decoded.getExpiresAt().toInstant())
                    .jti(decoded.getId())
                    .build();
        } catch (IllegalArgumentException | NullPointerException e) {
            // Malformed claim shape: missing pageId, pageId not a UUID,
            // scopes not a list, etc. Same external surface as a verify
            // failure — don't differentiate to the caller.
            throw new LaunchTokenVerificationException("Malformed launch-token payload", e);
        }
    }

    private static String firstAudience(DecodedJWT decoded) {
        if (decoded.getAudience() == null || decoded.getAudience().isEmpty()) {
            throw new LaunchTokenVerificationException("missing aud claim");
        }
        return decoded.getAudience().get(0);
    }

    private static String requireString(DecodedJWT decoded, String name) {
        Claim claim = decoded.getClaim(name);
        if (claim == null || claim.isNull()) {
            throw new LaunchTokenVerificationException("missing claim: " + name);
        }
        String value = claim.asString();
        if (value == null || value.isBlank()) {
            throw new LaunchTokenVerificationException("blank claim: " + name);
        }
        return value;
    }

    private static java.util.List<String> requireStringList(DecodedJWT decoded, String name) {
        Claim claim = decoded.getClaim(name);
        if (claim == null || claim.isNull()) {
            throw new LaunchTokenVerificationException("missing claim: " + name);
        }
        java.util.List<String> list = claim.asList(String.class);
        if (list == null || list.isEmpty()) {
            throw new LaunchTokenVerificationException("empty claim: " + name);
        }
        return list;
    }
}
