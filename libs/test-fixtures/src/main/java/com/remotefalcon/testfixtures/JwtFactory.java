package com.remotefalcon.testfixtures;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * Mints test JWTs signed with {@link TestSecrets#JWT_KEY}.
 *
 * <p>All issued tokens carry a {@code showToken} claim and are signed with
 * HS256 using the shared test key, matching the production token shape just
 * closely enough for downstream services to validate them in tests.
 */
public final class JwtFactory {

    private static final SecretKey KEY =
            Keys.hmacShaKeyFor(TestSecrets.JWT_KEY.getBytes(StandardCharsets.UTF_8));

    private JwtFactory() {}

    /** Issues a 1-hour-valid token carrying {@code showToken} as a claim. */
    public static String issue(String showToken) {
        return issue(showToken, TestSecrets.DEFAULT_TOKEN_TTL);
    }

    /** Issues a token with a custom TTL. */
    public static String issue(String showToken, Duration ttl) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(showToken)
                .claim("showToken", showToken)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(KEY, Jwts.SIG.HS256)
                .compact();
    }

    /** Returns a structurally-valid but already-expired token (exp = now - 1 minute). */
    public static String expired(String showToken) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(showToken)
                .claim("showToken", showToken)
                .issuedAt(Date.from(now.minusSeconds(120)))
                .expiration(Date.from(now.minusSeconds(60)))
                .signWith(KEY, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * Returns a string that looks like a JWT (three dot-separated base64 segments)
     * but has a truncated signature, for negative-path tests.
     */
    public static String malformed() {
        String real = issue("malformed-test");
        int lastDot = real.lastIndexOf('.');
        // Keep header + payload + a stub of the signature so it parses as a JWS shape
        // but fails signature verification.
        return real.substring(0, lastDot + 1) + "AAAA";
    }
}
