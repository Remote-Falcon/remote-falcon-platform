package com.remotefalcon.controlpanel.util;

import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;

/**
 * RFC 6238 TOTP operations (2FA PRD §9). Parameters are the
 * authenticator-app ecosystem defaults: HMAC-SHA1 / 6 digits / 30s step,
 * verification window ±1 step for clock drift.
 */
@Slf4j
@Service
public class TotpUtil {
    public static final long NO_MATCH = -1L;

    private static final int SECRET_LENGTH_BYTES = 20; // 160-bit, RFC 4226 §4 recommended for SHA1
    private static final Duration TIME_STEP = Duration.ofSeconds(30);
    private static final String ISSUER = "Remote Falcon";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final TimeBasedOneTimePasswordGenerator generator =
            new TimeBasedOneTimePasswordGenerator(TIME_STEP, 6,
                    TimeBasedOneTimePasswordGenerator.TOTP_ALGORITHM_HMAC_SHA1);

    public byte[] generateSecret() {
        byte[] secret = new byte[SECRET_LENGTH_BYTES];
        SECURE_RANDOM.nextBytes(secret);
        return secret;
    }

    public String buildOtpauthUri(String email, String base32Secret) {
        String issuer = URLEncoder.encode(ISSUER, StandardCharsets.UTF_8).replace("+", "%20");
        String account = URLEncoder.encode(email, StandardCharsets.UTF_8);
        return "otpauth://totp/" + issuer + ":" + account
                + "?secret=" + base32Secret
                + "&issuer=" + issuer
                + "&algorithm=SHA1&digits=6&period=30";
    }

    public boolean isTotpCodeFormat(String code) {
        return code != null && code.trim().matches("\\d{6}");
    }

    /**
     * Verifies a 6-digit code against the ±1-step window. Returns the
     * matched time-step counter, or {@link #NO_MATCH}. Steps at or below
     * {@code lastUsedTimeStep} are skipped so an intercepted code can't be
     * replayed inside its validity window (a step the account already
     * consumed never verifies again).
     */
    public long verifyCode(byte[] secret, String code, Long lastUsedTimeStep) {
        if (!isTotpCodeFormat(code)) {
            return NO_MATCH;
        }
        String submitted = code.trim();
        long floor = lastUsedTimeStep == null ? Long.MIN_VALUE : lastUsedTimeStep;
        long currentStep = Instant.now().getEpochSecond() / TIME_STEP.getSeconds();
        SecretKeySpec key = new SecretKeySpec(secret, "HmacSHA1");
        for (long offset = -1; offset <= 1; offset++) {
            long step = currentStep + offset;
            if (step <= floor) {
                continue;
            }
            try {
                String expected = generator.generateOneTimePasswordString(
                        key, Instant.ofEpochSecond(step * TIME_STEP.getSeconds()));
                if (MessageDigest.isEqual(
                        expected.getBytes(StandardCharsets.UTF_8),
                        submitted.getBytes(StandardCharsets.UTF_8))) {
                    return step;
                }
            } catch (InvalidKeyException e) {
                log.error("TOTP verification failed on invalid key material", e);
                return NO_MATCH;
            }
        }
        return NO_MATCH;
    }
}
