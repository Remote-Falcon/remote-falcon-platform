package com.remotefalcon.controlpanel.util;

/**
 * Minimal RFC 4648 Base32 encoder for TOTP secret display. The JDK ships
 * Base64 only, and adding commons-codec for one method isn't worth the
 * dependency. Encode-only: the raw secret bytes are what we persist
 * (AES-GCM encrypted) and verify against; base32 exists purely so
 * authenticator apps can ingest the secret (QR + manual entry).
 */
public final class Base32Util {
    private static final char[] ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();

    private Base32Util() {
    }

    public static String encode(byte[] data) {
        StringBuilder result = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = 0;
        int bitsInBuffer = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xFF);
            bitsInBuffer += 8;
            while (bitsInBuffer >= 5) {
                bitsInBuffer -= 5;
                result.append(ALPHABET[(buffer >> bitsInBuffer) & 0x1F]);
            }
        }
        if (bitsInBuffer > 0) {
            result.append(ALPHABET[(buffer << (5 - bitsInBuffer)) & 0x1F]);
        }
        // No '=' padding — authenticator apps neither need nor want it,
        // and a 20-byte secret encodes to exactly 32 chars anyway.
        return result.toString();
    }
}
