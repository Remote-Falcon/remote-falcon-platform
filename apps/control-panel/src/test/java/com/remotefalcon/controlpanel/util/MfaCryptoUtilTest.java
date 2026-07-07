package com.remotefalcon.controlpanel.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MfaCryptoUtilTest {

    private MfaCryptoUtil crypto;

    @BeforeEach
    void setUp() {
        crypto = new MfaCryptoUtil();
        ReflectionTestUtils.setField(crypto, "mfaSecretKey", "unit-test-mfa-encryption-key");
    }

    @Test
    void isConfigured_reflectsKeyPresence() {
        assertThat(crypto.isConfigured()).isTrue();

        MfaCryptoUtil unconfigured = new MfaCryptoUtil();
        ReflectionTestUtils.setField(unconfigured, "mfaSecretKey", "");
        assertThat(unconfigured.isConfigured()).isFalse();
    }

    @Test
    void encrypt_decrypt_roundTripsSecretBytes() {
        byte[] secret = "twenty-byte-totp-key".getBytes(StandardCharsets.UTF_8);
        String ciphertext = crypto.encrypt(secret);

        assertThat(ciphertext).isNotEqualTo(Base64.getEncoder().encodeToString(secret));
        assertThat(crypto.decrypt(ciphertext)).isEqualTo(secret);
    }

    @Test
    void encrypt_usesFreshIvPerCall_soCiphertextsDiffer() {
        byte[] secret = "twenty-byte-totp-key".getBytes(StandardCharsets.UTF_8);
        // GCM IV reuse under one key is catastrophic; distinct ciphertexts
        // for identical plaintext prove a fresh random IV each call.
        assertThat(crypto.encrypt(secret)).isNotEqualTo(crypto.encrypt(secret));
    }

    @Test
    void decrypt_rejectsTamperedCiphertext() {
        byte[] secret = "twenty-byte-totp-key".getBytes(StandardCharsets.UTF_8);
        byte[] combined = Base64.getDecoder().decode(crypto.encrypt(secret));
        combined[combined.length - 1] ^= 0x01;
        String tampered = Base64.getEncoder().encodeToString(combined);

        assertThatThrownBy(() -> crypto.decrypt(tampered))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void decrypt_rejectsCiphertextFromDifferentKey() {
        MfaCryptoUtil otherKey = new MfaCryptoUtil();
        ReflectionTestUtils.setField(otherKey, "mfaSecretKey", "a-completely-different-key");
        String ciphertext = otherKey.encrypt("secret-bytes".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> crypto.decrypt(ciphertext))
                .isInstanceOf(IllegalStateException.class);
    }
}
