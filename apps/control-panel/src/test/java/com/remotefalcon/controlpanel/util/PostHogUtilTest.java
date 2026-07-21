package com.remotefalcon.controlpanel.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * PostHogUtil reads its configuration from the environment at call time
 * (never via bean-registration conditions — the native image strips
 * those). These tests pin the unconfigured/no-op contract: without
 * POSTHOG_API_KEY every call must silently do nothing, because self-host
 * deployments run this exact code path on every consent opt-out.
 */
class PostHogUtilTest {

    // Subclass override instead of env mutation: System.getenv is
    // read-only in-process, and these tests must not depend on the
    // machine's environment.
    private static class UnconfiguredPostHogUtil extends PostHogUtil {
        @Override
        protected String getApiKey() {
            return null;
        }
    }

    private static class ConfiguredPostHogUtil extends PostHogUtil {
        @Override
        protected String getApiKey() {
            return "phc_test";
        }

        @Override
        protected String getHost() {
            // Unroutable per RFC 5737 TEST-NET; the async fire-and-forget
            // send must swallow the failure without throwing.
            return "http://192.0.2.1:9";
        }
    }

    @Test
    void scrubIsSilentNoOp_whenApiKeyAbsent() {
        assertThatCode(() -> new UnconfiguredPostHogUtil().scrubEmailConsent("myshow")).doesNotThrowAnyException();
    }

    @Test
    void scrubIsSilentNoOp_whenSubdomainBlank() {
        assertThatCode(() -> new ConfiguredPostHogUtil().scrubEmailConsent("")).doesNotThrowAnyException();
        assertThatCode(() -> new ConfiguredPostHogUtil().scrubEmailConsent(null)).doesNotThrowAnyException();
    }

    @Test
    void scrubNeverThrows_whenIngestUnreachable() {
        assertThatCode(() -> new ConfiguredPostHogUtil().scrubEmailConsent("myshow")).doesNotThrowAnyException();
    }
}
