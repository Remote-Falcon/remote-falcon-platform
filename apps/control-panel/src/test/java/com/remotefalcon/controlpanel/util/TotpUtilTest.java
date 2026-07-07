package com.remotefalcon.controlpanel.util;

import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.crypto.spec.SecretKeySpec;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the parts WE wrote around java-otp: the ±1-step drift window, the
 * replay floor (a consumed time step never verifies again), input format
 * gating, secret generation shape, and the otpauth provisioning URI.
 */
class TotpUtilTest {

    private static final Duration STEP = Duration.ofSeconds(30);

    private TotpUtil totpUtil;
    private byte[] secret;

    @BeforeEach
    void setUp() {
        totpUtil = new TotpUtil();
        secret = totpUtil.generateSecret();
    }

    private static long currentStep() {
        return Instant.now().getEpochSecond() / STEP.getSeconds();
    }

    /** Generates the code an authenticator app would show at the given step offset. */
    private String codeAt(long stepOffset) throws Exception {
        TimeBasedOneTimePasswordGenerator generator = new TimeBasedOneTimePasswordGenerator(
                STEP, 6, TimeBasedOneTimePasswordGenerator.TOTP_ALGORITHM_HMAC_SHA1);
        long step = currentStep() + stepOffset;
        return generator.generateOneTimePasswordString(
                new SecretKeySpec(secret, "HmacSHA1"), Instant.ofEpochSecond(step * STEP.getSeconds()));
    }

    @Test
    void generateSecret_is160Bits() {
        assertThat(secret).hasSize(20);
        assertThat(secret).isNotEqualTo(totpUtil.generateSecret());
    }

    @Test
    void verifyCode_acceptsCurrentCode_andReturnsMatchedStep() throws Exception {
        long matched = totpUtil.verifyCode(secret, codeAt(0), null);
        assertThat(matched).isNotEqualTo(TotpUtil.NO_MATCH);
        // The matched step is within the ±1 window of "now".
        assertThat(Math.abs(matched - currentStep())).isLessThanOrEqualTo(1);
    }

    @Test
    void verifyCode_acceptsPreviousAndNextStep_forClockDrift() throws Exception {
        assertThat(totpUtil.verifyCode(secret, codeAt(-1), null)).isNotEqualTo(TotpUtil.NO_MATCH);
        assertThat(totpUtil.verifyCode(secret, codeAt(1), null)).isNotEqualTo(TotpUtil.NO_MATCH);
    }

    @Test
    void verifyCode_rejectsCodesOutsideDriftWindow() throws Exception {
        assertThat(totpUtil.verifyCode(secret, codeAt(-2), null)).isEqualTo(TotpUtil.NO_MATCH);
        assertThat(totpUtil.verifyCode(secret, codeAt(2), null)).isEqualTo(TotpUtil.NO_MATCH);
    }

    @Test
    void verifyCode_rejectsReplay_ofAlreadyConsumedStep() throws Exception {
        String code = codeAt(0);
        long matched = totpUtil.verifyCode(secret, code, null);
        assertThat(matched).isNotEqualTo(TotpUtil.NO_MATCH);

        // Same code again with the matched step recorded as consumed —
        // must fail even though it is still inside the time window.
        assertThat(totpUtil.verifyCode(secret, code, matched)).isEqualTo(TotpUtil.NO_MATCH);
    }

    @Test
    void verifyCode_rejectsMalformedInput() {
        assertThat(totpUtil.verifyCode(secret, null, null)).isEqualTo(TotpUtil.NO_MATCH);
        assertThat(totpUtil.verifyCode(secret, "", null)).isEqualTo(TotpUtil.NO_MATCH);
        assertThat(totpUtil.verifyCode(secret, "12345", null)).isEqualTo(TotpUtil.NO_MATCH);
        assertThat(totpUtil.verifyCode(secret, "1234567", null)).isEqualTo(TotpUtil.NO_MATCH);
        assertThat(totpUtil.verifyCode(secret, "abcdef", null)).isEqualTo(TotpUtil.NO_MATCH);
        assertThat(totpUtil.verifyCode(secret, "ABCDE-FGHIJ", null)).isEqualTo(TotpUtil.NO_MATCH);
    }

    @Test
    void isTotpCodeFormat_matchesSixDigitsOnly() {
        assertThat(totpUtil.isTotpCodeFormat("123456")).isTrue();
        assertThat(totpUtil.isTotpCodeFormat(" 123456 ")).isTrue();
        assertThat(totpUtil.isTotpCodeFormat("ABCDE-FGHIJ")).isFalse();
        assertThat(totpUtil.isTotpCodeFormat(null)).isFalse();
    }

    @Test
    void buildOtpauthUri_encodesIssuerAndAccount() {
        String uri = totpUtil.buildOtpauthUri("owner@example.com", "MZXW6YTBOI");
        assertThat(uri).startsWith("otpauth://totp/Remote%20Falcon:owner%40example.com");
        assertThat(uri).contains("secret=MZXW6YTBOI");
        assertThat(uri).contains("issuer=Remote%20Falcon");
        assertThat(uri).contains("algorithm=SHA1").contains("digits=6").contains("period=30");
    }
}
