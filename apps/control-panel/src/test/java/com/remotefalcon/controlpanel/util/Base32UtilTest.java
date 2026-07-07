package com.remotefalcon.controlpanel.util;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * RFC 4648 §10 test vectors (padding stripped — authenticator apps use
 * unpadded base32) plus the TOTP-specific 20-byte shape.
 */
class Base32UtilTest {

    private static String encode(String ascii) {
        return Base32Util.encode(ascii.getBytes(StandardCharsets.US_ASCII));
    }

    @Test
    void encode_matchesRfc4648TestVectors() {
        assertThat(encode("")).isEqualTo("");
        assertThat(encode("f")).isEqualTo("MY");
        assertThat(encode("fo")).isEqualTo("MZXQ");
        assertThat(encode("foo")).isEqualTo("MZXW6");
        assertThat(encode("foob")).isEqualTo("MZXW6YQ");
        assertThat(encode("fooba")).isEqualTo("MZXW6YTB");
        assertThat(encode("foobar")).isEqualTo("MZXW6YTBOI");
    }

    @Test
    void encode_twentyByteSecret_isThirtyTwoCharsNoPadding() {
        byte[] secret = new byte[20];
        for (int i = 0; i < secret.length; i++) {
            secret[i] = (byte) i;
        }
        String encoded = Base32Util.encode(secret);
        assertThat(encoded).hasSize(32);
        assertThat(encoded).matches("[A-Z2-7]+");
    }
}
