package com.remotefalcon.controlpanel.util;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM encryption for TOTP secrets at rest (2FA PRD SR-1). Keyed by
 * MFA_SECRET_KEY, deliberately distinct from the JWT signing key so a leaked
 * signing key can't decrypt second factors (and vice versa).
 *
 * The key may legitimately be ABSENT: 2FA is opt-in per deployment as well
 * as per account (self-host installs that never set MFA_SECRET_KEY just
 * can't enroll). The presence check happens at CALL time inside methods —
 * never via @Conditional bean gating — because runtime-only env vars are
 * invisible to the GraalVM native-image build and conditional beans get
 * stripped (issue #160 / control-panel-native-image-conditional-beans).
 */
@Service
public class MfaCryptoUtil {
    private static final int IV_LENGTH_BYTES = 12;
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Value("${mfa.secret-key:}")
    String mfaSecretKey;

    public boolean isConfigured() {
        return StringUtils.isNotBlank(mfaSecretKey);
    }

    public String encrypt(byte[] plaintext) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            SECURE_RANDOM.nextBytes(iv);
            // Constant algorithm literal — GraalVM's JCA reachability
            // analysis needs it to register the SunJCE cipher in the
            // native image.
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, deriveKey(), new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext);
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("MFA secret encryption failed", e);
        }
    }

    public byte[] decrypt(String encoded) {
        try {
            byte[] combined = Base64.getDecoder().decode(encoded);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, combined, 0, IV_LENGTH_BYTES);
            cipher.init(Cipher.DECRYPT_MODE, deriveKey(), spec);
            return cipher.doFinal(combined, IV_LENGTH_BYTES, combined.length - IV_LENGTH_BYTES);
        } catch (Exception e) {
            throw new IllegalStateException("MFA secret decryption failed", e);
        }
    }

    private SecretKeySpec deriveKey() throws Exception {
        // SHA-256 of the configured value → exactly 32 key bytes. Lets
        // operators set any sufficiently-random string (openssl rand
        // -base64 32) without base64/length footguns.
        byte[] keyBytes = MessageDigest.getInstance("SHA-256")
                .digest(mfaSecretKey.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(keyBytes, "AES");
    }
}
