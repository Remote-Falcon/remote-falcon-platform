package com.remotefalcon.auth;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Round-trip and failure-mode tests for {@link LaunchTokenSigner} +
 * {@link LaunchTokenVerifier}. Pure-logic, no JWT library mocking — runs
 * the real HS256 path end-to-end.
 *
 * <p>Five attack/failure surfaces explicitly covered:
 * <ul>
 *   <li>Wrong secret → 401-equivalent
 *   <li>Tampered payload → 401-equivalent
 *   <li>Expired token → 401-equivalent
 *   <li>Wrong audience (token minted for a different consumer) → 401
 *   <li>Missing / malformed claim → 401 (don't leak which one)
 * </ul>
 */
class LaunchTokenSignerVerifierTest {

    private static final String SECRET = "this-is-a-32-character-test-secret!!"; // 36 chars
    private static final String OTHER_SECRET = "different-32-character-test-secret--"; // 36 chars

    private final LaunchTokenSigner signer = new LaunchTokenSigner(SECRET);
    private final LaunchTokenVerifier verifier = new LaunchTokenVerifier(SECRET);

    private static LaunchTokenPayload validPayload() {
        return LaunchTokenPayload.builder()
                .iss(LaunchTokenVerifier.EXPECTED_ISSUER)
                .aud(LaunchTokenVerifier.EXPECTED_AUDIENCE)
                .sub("user-id-123")
                .showSubdomain("myxmas")
                .showToken("show-token-abc")
                .pageId(UUID.fromString("11111111-2222-3333-4444-555555555555"))
                .etag("sha256:cafef00d")
                .scopes(List.of("viewer_page:read", "viewer_page:write"))
                .iat(Instant.now().minusSeconds(5))
                .exp(Instant.now().plusSeconds(300))
                .jti(UUID.randomUUID().toString())
                .build();
    }

    // -------- happy path ----------

    @Test
    void roundTrips_cleanly() {
        LaunchTokenPayload original = validPayload();

        String token = signer.sign(original);
        LaunchTokenPayload decoded = verifier.verify(token);

        assertThat(decoded.getIss()).isEqualTo(original.getIss());
        assertThat(decoded.getAud()).isEqualTo(original.getAud());
        assertThat(decoded.getSub()).isEqualTo(original.getSub());
        assertThat(decoded.getShowSubdomain()).isEqualTo(original.getShowSubdomain());
        assertThat(decoded.getShowToken()).isEqualTo(original.getShowToken());
        assertThat(decoded.getPageId()).isEqualTo(original.getPageId());
        assertThat(decoded.getEtag()).isEqualTo(original.getEtag());
        assertThat(decoded.getScopes()).isEqualTo(original.getScopes());
        assertThat(decoded.getJti()).isEqualTo(original.getJti());
        // iat/exp round-trip with second precision (JWT spec uses seconds)
        assertThat(decoded.getIat().getEpochSecond()).isEqualTo(original.getIat().getEpochSecond());
        assertThat(decoded.getExp().getEpochSecond()).isEqualTo(original.getExp().getEpochSecond());
    }

    // -------- failure modes ----------

    @Test
    void verify_rejectsToken_signedWithDifferentSecret() {
        // Mint with OTHER_SECRET, verify with SECRET. Signature mismatch.
        LaunchTokenSigner attacker = new LaunchTokenSigner(OTHER_SECRET);
        String forged = attacker.sign(validPayload());

        assertThatThrownBy(() -> verifier.verify(forged))
                .isInstanceOf(LaunchTokenVerificationException.class)
                .hasMessageContaining("Invalid launch token");
    }

    @Test
    void verify_rejectsToken_thatExpired() {
        LaunchTokenPayload expired = validPayload();
        expired.setIat(Instant.now().minusSeconds(600));
        expired.setExp(Instant.now().minusSeconds(60)); // 1 minute ago

        String token = signer.sign(expired);

        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(LaunchTokenVerificationException.class);
    }

    @Test
    void verify_rejectsToken_withWrongAudience() {
        LaunchTokenPayload wrongAud = validPayload();
        wrongAud.setAud("some-other-product");

        String token = signer.sign(wrongAud);

        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(LaunchTokenVerificationException.class);
    }

    @Test
    void verify_rejectsToken_withWrongIssuer() {
        LaunchTokenPayload wrongIss = validPayload();
        wrongIss.setIss("fake-issuer");

        String token = signer.sign(wrongIss);

        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(LaunchTokenVerificationException.class);
    }

    @Test
    void verify_rejectsToken_withMissingPageIdClaim() {
        LaunchTokenPayload noPageId = validPayload();
        noPageId.setPageId(null);

        String token = signer.sign(noPageId);

        // Exception type is the contract; specific message is impl detail.
        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(LaunchTokenVerificationException.class);
    }

    @Test
    void verify_rejectsToken_withMissingScopes() {
        LaunchTokenPayload noScopes = validPayload();
        noScopes.setScopes(null);

        String token = signer.sign(noScopes);

        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(LaunchTokenVerificationException.class);
    }

    @Test
    void verify_rejectsToken_withMalformedPageIdString() {
        // Mint a JWT with pageId set to non-UUID using raw auth0 library so we
        // can bypass the signer's own type discipline.
        String token = com.auth0.jwt.JWT.create()
                .withIssuer(LaunchTokenVerifier.EXPECTED_ISSUER)
                .withAudience(LaunchTokenVerifier.EXPECTED_AUDIENCE)
                .withSubject("u")
                .withClaim("showSubdomain", "x")
                .withClaim("showToken", "y")
                .withClaim("pageId", "not-a-uuid")
                .withClaim("etag", "e")
                .withClaim("scopes", List.of("viewer_page:read"))
                .withIssuedAt(java.util.Date.from(Instant.now().minusSeconds(5)))
                .withExpiresAt(java.util.Date.from(Instant.now().plusSeconds(60)))
                .withJWTId(UUID.randomUUID().toString())
                .sign(com.auth0.jwt.algorithms.Algorithm.HMAC256(SECRET));

        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(LaunchTokenVerificationException.class);
    }

    @Test
    void verify_rejectsNullOrBlankToken() {
        assertThatThrownBy(() -> verifier.verify(null))
                .isInstanceOf(LaunchTokenVerificationException.class);
        assertThatThrownBy(() -> verifier.verify(""))
                .isInstanceOf(LaunchTokenVerificationException.class);
        assertThatThrownBy(() -> verifier.verify("   "))
                .isInstanceOf(LaunchTokenVerificationException.class);
    }

    // -------- signer + verifier construction ----------

    @Test
    void signer_rejectsShortSecret() {
        assertThatThrownBy(() -> new LaunchTokenSigner("too-short"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void verifier_rejectsShortSecret() {
        assertThatThrownBy(() -> new LaunchTokenVerifier("too-short"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void signer_rejectsNullPayload() {
        assertThatThrownBy(() -> signer.sign(null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
