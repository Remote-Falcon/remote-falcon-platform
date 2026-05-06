package com.remotefalcon.testfixtures;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TestSecretsDriftTest {

    @Test
    void jwtKeyMeetsHmacSha256MinimumLength() {
        // HMAC-SHA256 requires at least 256 bits = 32 bytes of key material.
        assertTrue(TestSecrets.JWT_KEY.getBytes().length >= 32,
                "JWT_KEY must be at least 32 bytes for HMAC-SHA256");
    }

    @Test
    void jwtKeyIsNotEmpty() {
        assertNotNull(TestSecrets.JWT_KEY);
        assertFalse(TestSecrets.JWT_KEY.isBlank());
    }

    // TODO Sprint 2: extend to validate per-service application-test.yml fallbacks
    // match TestSecrets.JWT_KEY. Will load YAML from each service's
    // src/test/resources/ and compare the ${JWT_USER:...} default.
}
