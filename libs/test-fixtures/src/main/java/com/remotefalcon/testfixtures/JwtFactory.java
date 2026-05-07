package com.remotefalcon.testfixtures;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

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
     * Issues a token shaped for the control-panel service's {@code AuthUtil}:
     * issuer {@code remotefalcon}, a single {@code user-data} claim holding a
     * map of {@code showToken/email/showSubdomain/showRole}, signed with
     * HS256 against {@link TestSecrets#JWT_KEY}.
     *
     * <p>Production tokens are minted by {@code AuthUtil#signJwt(Show)} with the
     * exact same shape; tests use this method to produce a token that the
     * production filter accepts end-to-end.
     */
    public static String issueControlPanel(String showToken, String email,
                                           String showSubdomain, String showRole) {
        return issueControlPanel(showToken, email, showSubdomain, showRole,
                TestSecrets.DEFAULT_TOKEN_TTL);
    }

    /** Variant of {@link #issueControlPanel(String, String, String, String)} with a custom TTL. */
    public static String issueControlPanel(String showToken, String email,
                                           String showSubdomain, String showRole,
                                           Duration ttl) {
        Map<String, Object> userData = new HashMap<>();
        userData.put("showToken", showToken);
        userData.put("email", email);
        userData.put("showSubdomain", showSubdomain);
        userData.put("showRole", showRole);
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer("remotefalcon")
                .claim("user-data", userData)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(KEY, Jwts.SIG.HS256)
                .compact();
    }

    /** Already-expired control-panel-shaped token (exp = now - 1 minute). */
    public static String expiredControlPanel(String showToken, String email,
                                              String showSubdomain, String showRole) {
        Map<String, Object> userData = new HashMap<>();
        userData.put("showToken", showToken);
        userData.put("email", email);
        userData.put("showSubdomain", showSubdomain);
        userData.put("showRole", showRole);
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer("remotefalcon")
                .claim("user-data", userData)
                .issuedAt(Date.from(now.minusSeconds(120)))
                .expiration(Date.from(now.minusSeconds(60)))
                .signWith(KEY, Jwts.SIG.HS256)
                .compact();
    }

    /** Control-panel-shaped token with the wrong issuer, for negative-path tests. */
    public static String wrongIssuerControlPanel(String showToken, String email,
                                                  String showSubdomain, String showRole) {
        Map<String, Object> userData = new HashMap<>();
        userData.put("showToken", showToken);
        userData.put("email", email);
        userData.put("showSubdomain", showSubdomain);
        userData.put("showRole", showRole);
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer("not-remotefalcon")
                .claim("user-data", userData)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(TestSecrets.DEFAULT_TOKEN_TTL)))
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
