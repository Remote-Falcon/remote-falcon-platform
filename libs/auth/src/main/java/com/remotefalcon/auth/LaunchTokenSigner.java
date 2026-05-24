package com.remotefalcon.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTCreator;
import com.auth0.jwt.algorithms.Algorithm;

import java.util.Date;

/**
 * Mints HS256-signed launch JWTs from {@link LaunchTokenPayload}. Consumed
 * by {@code apps/control-panel}'s {@code launchExternalEditor} GraphQL
 * mutation.
 *
 * <p>One signer instance per shared secret. Thread-safe — the underlying
 * {@link Algorithm} and {@link JWTCreator.Builder} chain produce an
 * independent token per {@link #sign(LaunchTokenPayload)} call.
 *
 * <p>HS256 over RS256/JWKS is deliberate: both apps are owned by the same
 * author, so the trust boundary is "two services I deploy" rather than
 * "an unknown third party." If/when a real third-party partner appears,
 * swap the {@link Algorithm} instance to {@code Algorithm.RSA256(...)} +
 * publish a JWKS endpoint — payload shape stays identical.
 */
public class LaunchTokenSigner {

    private final Algorithm algorithm;

    /**
     * @param sharedSecret the {@code RF_RFPB_LAUNCH_SECRET} value shared
     *                     between control-panel (mint side) and external-api
     *                     (verify side). Must be at least 32 bytes for
     *                     reasonable HS256 strength.
     */
    public LaunchTokenSigner(String sharedSecret) {
        if (sharedSecret == null || sharedSecret.length() < 32) {
            throw new IllegalArgumentException(
                    "Launch token shared secret must be non-null and at least 32 chars");
        }
        this.algorithm = Algorithm.HMAC256(sharedSecret);
    }

    /**
     * Mint a signed JWT for the given payload. Caller is responsible for
     * setting iat + exp + jti before calling — this method does not stamp
     * defaults so unit tests can pin time and assert exact output.
     */
    public String sign(LaunchTokenPayload payload) {
        if (payload == null) {
            throw new IllegalArgumentException("payload must not be null");
        }
        return JWT.create()
                .withIssuer(payload.getIss())
                .withAudience(payload.getAud())
                .withSubject(payload.getSub())
                .withClaim("showSubdomain", payload.getShowSubdomain())
                .withClaim("showToken", payload.getShowToken())
                .withClaim("pageId",
                        payload.getPageId() == null ? null : payload.getPageId().toString())
                .withClaim("etag", payload.getEtag())
                .withClaim("scopes", payload.getScopes())
                .withIssuedAt(payload.getIat() == null ? null : Date.from(payload.getIat()))
                .withExpiresAt(payload.getExp() == null ? null : Date.from(payload.getExp()))
                .withJWTId(payload.getJti())
                .sign(algorithm);
    }
}
