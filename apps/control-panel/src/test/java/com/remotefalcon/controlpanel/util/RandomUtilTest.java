package com.remotefalcon.controlpanel.util;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link RandomUtil#generateToken(int)} — the alnum token
 * generator used for showToken, passwordResetLink, and API
 * accessToken/secret. Pins the contract: returned string has the
 * requested length and contains only [A-Za-z0-9].
 */
class RandomUtilTest {

    @Test
    void generatesTokenOfRequestedLength() {
        for (int len : new int[] {1, 5, 20, 25, 50}) {
            String token = RandomUtil.generateToken(len);
            assertThat(token).as("token of length %d", len).hasSize(len);
        }
    }

    @Test
    void containsOnlyAlphanumericCharacters() {
        String token = RandomUtil.generateToken(100);
        assertThat(token).matches("^[A-Za-z0-9]+$");
    }

    @Test
    void successiveCallsProduceDifferentTokens() {
        // Astronomically unlikely to collide even at length 20 with a
        // 62-symbol alphabet — this fails only if the generator is broken.
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 20; i++) {
            seen.add(RandomUtil.generateToken(20));
        }
        assertThat(seen).hasSize(20);
    }

    @Test
    void zeroLengthReturnsEmpty() {
        assertThat(RandomUtil.generateToken(0)).isEmpty();
    }
}
