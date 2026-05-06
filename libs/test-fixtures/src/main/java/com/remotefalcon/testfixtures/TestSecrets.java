package com.remotefalcon.testfixtures;

import java.time.Duration;

/**
 * Single source of truth for keys/values used in tests across services.
 * Per-service application-test.yml files use the same values as fallbacks
 * (e.g., ${JWT_USER:test-jwt-must-be-256-bits-long-padding-padding-padding-padding}).
 *
 * Drift between this constant and any service's YAML fallback is caught by
 * TestSecretsDriftTest in this module.
 */
public final class TestSecrets {

    /** HMAC-SHA256 key for test JWTs. Must be at least 256 bits = 32 bytes. */
    public static final String JWT_KEY =
            "test-jwt-must-be-256-bits-long-padding-padding-padding-padding";

    /** Default TTL for tokens minted by JwtFactory.issue(showToken). */
    public static final Duration DEFAULT_TOKEN_TTL = Duration.ofHours(1);

    /** Test database name to use in testcontainers Mongo. */
    public static final String MONGO_TEST_DB = "remote-falcon-test";

    private TestSecrets() {}
}
