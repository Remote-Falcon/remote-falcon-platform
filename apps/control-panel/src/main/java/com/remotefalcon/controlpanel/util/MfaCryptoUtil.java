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
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

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
 *
 * <h2>Key rotation</h2>
 * Ciphertext is stored as {@code <keyId>:<base64(iv‖ciphertext‖tag)>}, where
 * {@code keyId} is a short non-secret fingerprint of the encrypting key (the
 * first {@value #KEY_ID_HEX_CHARS} hex chars of SHA-256(rawKey)). New writes
 * always use the primary key (MFA_SECRET_KEY). Decryption is driven by a
 * keyring built from the primary key plus any comma-separated retired keys
 * (MFA_SECRET_KEY_RETIRED): the {@code keyId} prefix selects the key, and if
 * it doesn't match a keyring entry (or is absent, i.e. a pre-versioning blob)
 * every key is tried in turn. That try-all fallback is safe because the GCM
 * auth tag makes decryption under the wrong key fail rather than silently
 * return garbage. To rotate: set the new key as MFA_SECRET_KEY, move the old
 * one to MFA_SECRET_KEY_RETIRED, run {@code adminRotateMfaKeys}, then drop the
 * retired key.
 */
@Service
public class MfaCryptoUtil {
    private static final int IV_LENGTH_BYTES = 12;
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int KEY_ID_HEX_CHARS = 8;
    private static final char KEY_ID_SEPARATOR = ':';
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Value("${mfa.secret-key:}")
    String mfaSecretKey;

    // Zero or more previous MFA_SECRET_KEY values, comma-separated, retained
    // ONLY so their ciphertext still decrypts during/after a rotation. Never
    // used to encrypt.
    @Value("${mfa.secret-key-retired:}")
    String mfaSecretKeyRetired;

    public boolean isConfigured() {
        return StringUtils.isNotBlank(mfaSecretKey);
    }

    /** Non-secret fingerprint of the current primary key (for audit/logging). */
    public String primaryKeyId() {
        return keyIdOf(mfaSecretKey);
    }

    public String encrypt(byte[] plaintext) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            SECURE_RANDOM.nextBytes(iv);
            // Constant algorithm literal — GraalVM's JCA reachability
            // analysis needs it to register the SunJCE cipher in the
            // native image.
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, deriveKey(mfaSecretKey), new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext);
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return keyIdOf(mfaSecretKey) + KEY_ID_SEPARATOR + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("MFA secret encryption failed", e);
        }
    }

    public byte[] decrypt(String encoded) {
        String keyId = keyIdPrefix(encoded);
        String payload = keyId == null ? encoded : encoded.substring(keyId.length() + 1);
        byte[] combined;
        try {
            combined = Base64.getDecoder().decode(payload);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("MFA secret decryption failed", e);
        }
        Map<String, SecretKeySpec> keyring = keyring();
        // Fast path: the keyId prefix names the exact key. Fall back to
        // trying every keyring key (the GCM tag rejects wrong keys) so a
        // blob whose keyId isn't in the ring — or a pre-versioning blob with
        // no prefix at all — still decrypts if ANY held key can open it.
        SecretKeySpec named = keyId == null ? null : keyring.get(keyId);
        if (named != null) {
            byte[] result = tryDecrypt(named, combined);
            if (result != null) {
                return result;
            }
        }
        for (SecretKeySpec key : keyring.values()) {
            if (key == named) {
                continue;
            }
            byte[] result = tryDecrypt(key, combined);
            if (result != null) {
                return result;
            }
        }
        throw new IllegalStateException("MFA secret decryption failed: no configured key could decrypt it");
    }

    /**
     * True when {@code encoded} was encrypted under the current primary key.
     * A pre-versioning blob (no keyId prefix) or one under a retired key
     * returns false — i.e. it still needs rotating onto the primary key.
     */
    public boolean isEncryptedWithPrimary(String encoded) {
        String keyId = keyIdPrefix(encoded);
        return keyId != null && keyId.equals(keyIdOf(mfaSecretKey));
    }

    private byte[] tryDecrypt(SecretKeySpec key, byte[] combined) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, combined, 0, IV_LENGTH_BYTES);
            cipher.init(Cipher.DECRYPT_MODE, key, spec);
            return cipher.doFinal(combined, IV_LENGTH_BYTES, combined.length - IV_LENGTH_BYTES);
        } catch (Exception e) {
            // Wrong key (GCM tag mismatch) or malformed input — let the
            // caller try the next key.
            return null;
        }
    }

    // Ordered primary-first so encryption's own key is preferred on decrypt.
    private Map<String, SecretKeySpec> keyring() {
        Map<String, SecretKeySpec> keyring = new LinkedHashMap<>();
        addKey(keyring, mfaSecretKey);
        if (StringUtils.isNotBlank(mfaSecretKeyRetired)) {
            Arrays.stream(mfaSecretKeyRetired.split(",")).forEach(raw -> addKey(keyring, raw));
        }
        return keyring;
    }

    private void addKey(Map<String, SecretKeySpec> keyring, String raw) {
        if (StringUtils.isBlank(raw)) {
            return;
        }
        keyring.putIfAbsent(keyIdOf(raw), deriveKey(raw));
    }

    private String keyIdPrefix(String encoded) {
        if (encoded == null) {
            return null;
        }
        int sep = encoded.indexOf(KEY_ID_SEPARATOR);
        // A keyId is exactly KEY_ID_HEX_CHARS hex chars; anything else is a
        // pre-versioning (unprefixed) blob whose payload is raw base64.
        if (sep != KEY_ID_HEX_CHARS) {
            return null;
        }
        String candidate = encoded.substring(0, sep);
        return candidate.chars().allMatch(c -> Character.digit(c, 16) >= 0) ? candidate : null;
    }

    private SecretKeySpec deriveKey(String raw) {
        // SHA-256 of the configured value → exactly 32 key bytes. Lets
        // operators set any sufficiently-random string (openssl rand
        // -base64 32) without base64/length footguns.
        return new SecretKeySpec(sha256(raw), "AES");
    }

    private String keyIdOf(String raw) {
        byte[] digest = sha256(raw);
        StringBuilder hex = new StringBuilder(KEY_ID_HEX_CHARS);
        for (int i = 0; hex.length() < KEY_ID_HEX_CHARS; i++) {
            hex.append(String.format("%02x", digest[i]));
        }
        return hex.substring(0, KEY_ID_HEX_CHARS);
    }

    private byte[] sha256(String raw) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
