package com.remotefalcon.external.api.testsupport;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;

/**
 * Mints tokens shaped for the external-api service's {@link
 * com.remotefalcon.external.api.util.AuthUtil}.
 *
 * <p>External-api tokens are simpler than the control-panel's user tokens: a
 * single {@code accessToken} claim holding the show's {@code
 * apiAccess.apiAccessToken}, signed HS256 with that show's {@code
 * apiAccess.apiAccessSecret}. There is no issuer check and no expiry on the
 * verification side — the only thing {@code AuthUtil} verifies is that the
 * token's signature matches the secret on the show looked up by
 * {@code accessToken}.
 *
 * <p>The shared {@link com.remotefalcon.testfixtures.JwtFactory} lives on the
 * io.jsonwebtoken stack and is keyed to a single global {@code TestSecrets.JWT_KEY};
 * external-api's per-show secret model doesn't fit it cleanly, so we keep this
 * helper local rather than expanding the shared module.
 */
public final class ExternalApiJwtFactory {

    private ExternalApiJwtFactory() {}

    /** Mints a valid token signed with {@code secret} carrying the given access token claim. */
    public static String issue(String accessToken, String secret) {
        Algorithm algorithm = Algorithm.HMAC256(secret);
        return JWT.create()
                .withClaim("accessToken", accessToken)
                .sign(algorithm);
    }

    /**
     * Mints a token with NO {@code accessToken} claim, signed with a placeholder
     * secret. Used to assert AuthUtil handles missing-claim gracefully.
     */
    public static String issueWithoutAccessTokenClaim(String secret) {
        Algorithm algorithm = Algorithm.HMAC256(secret);
        return JWT.create()
                .withClaim("someOtherClaim", "value")
                .sign(algorithm);
    }

    /** A non-JWT garbage string for negative-path tests. */
    public static String garbage() {
        return "not-a-jwt-at-all";
    }
}
