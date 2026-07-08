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
    void encrypt_prefixesCiphertextWithKeyIdFingerprint() {
        String ciphertext = crypto.encrypt("twenty-byte-totp-key".getBytes(StandardCharsets.UTF_8));
        // <8 lowercase-hex chars>:<base64 payload> — the keyId is a stable,
        // non-secret fingerprint of the key so decrypt can pick it from the
        // keyring and rotation can tell current blobs from stale ones.
        assertThat(ciphertext).matches("^[0-9a-f]{8}:.+$");
        assertThat(crypto.isEncryptedWithPrimary(ciphertext)).isTrue();
    }

    @Test
    void decrypt_readsRetiredKeyBlob_afterKeyRotation() {
        // A secret encrypted under the OLD key...
        MfaCryptoUtil oldCrypto = new MfaCryptoUtil();
        ReflectionTestUtils.setField(oldCrypto, "mfaSecretKey", "old-primary-key");
        byte[] secret = "twenty-byte-totp-key".getBytes(StandardCharsets.UTF_8);
        String oldCiphertext = oldCrypto.encrypt(secret);

        // ...still decrypts after rotation, when the old key is retained as a
        // retired key alongside the new primary.
        MfaCryptoUtil rotated = new MfaCryptoUtil();
        ReflectionTestUtils.setField(rotated, "mfaSecretKey", "new-primary-key");
        ReflectionTestUtils.setField(rotated, "mfaSecretKeyRetired", "old-primary-key");

        assertThat(rotated.decrypt(oldCiphertext)).isEqualTo(secret);
        // But it is NOT yet on the primary key — rotation still needs to move it.
        assertThat(rotated.isEncryptedWithPrimary(oldCiphertext)).isFalse();
        assertThat(rotated.isEncryptedWithPrimary(rotated.encrypt(secret))).isTrue();
    }

    @Test
    void decrypt_supportsMultipleCommaSeparatedRetiredKeys() {
        MfaCryptoUtil keyA = new MfaCryptoUtil();
        ReflectionTestUtils.setField(keyA, "mfaSecretKey", "key-a");
        byte[] secret = "twenty-byte-totp-key".getBytes(StandardCharsets.UTF_8);
        String blobA = keyA.encrypt(secret);

        MfaCryptoUtil current = new MfaCryptoUtil();
        ReflectionTestUtils.setField(current, "mfaSecretKey", "key-c");
        ReflectionTestUtils.setField(current, "mfaSecretKeyRetired", "key-a,key-b");

        assertThat(current.decrypt(blobA)).isEqualTo(secret);
    }

    @Test
    void isEncryptedWithPrimary_falseForLegacyUnprefixedBlob() {
        // A pre-versioning blob is raw base64 with no keyId prefix; it reads
        // as "not on the primary key" so rotation re-encrypts it.
        String legacy = Base64.getEncoder().encodeToString(new byte[]{1, 2, 3, 4});
        assertThat(crypto.isEncryptedWithPrimary(legacy)).isFalse();
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
        String ciphertext = crypto.encrypt(secret);
        int sep = ciphertext.indexOf(':');
        String keyId = ciphertext.substring(0, sep);
        byte[] combined = Base64.getDecoder().decode(ciphertext.substring(sep + 1));
        combined[combined.length - 1] ^= 0x01;
        String tampered = keyId + ":" + Base64.getEncoder().encodeToString(combined);

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
