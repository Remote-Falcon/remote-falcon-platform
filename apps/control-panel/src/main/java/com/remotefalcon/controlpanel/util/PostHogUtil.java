package com.remotefalcon.controlpanel.util;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Minimal server-side PostHog capture client (PRD-013). Exists so consent
 * enforcement is owned by the same layer that owns the consent record:
 * the browser's own capture calls are best-effort and can be lost.
 *
 * Configuration is read from the environment AT CALL TIME, never via
 * bean-registration conditions: this service ships as a GraalVM native
 * image, and beans gated on runtime-only env vars get stripped at build
 * time (issue #160). When POSTHOG_API_KEY is absent (self-host builds),
 * every call is a silent no-op.
 *
 * POSTHOG_API_KEY is the project's PUBLIC ingest key (the same value the
 * UI bakes in as VITE_PUBLIC_POSTHOG_KEY) — capture with $set/$unset
 * needs no private key. POSTHOG_HOST defaults to the US ingest endpoint.
 */
@Component
@Slf4j
public class PostHogUtil {
    private static final String DEFAULT_HOST = "https://us.i.posthog.com";
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    protected String getApiKey() {
        return System.getenv("POSTHOG_API_KEY");
    }

    protected String getHost() {
        String host = System.getenv("POSTHOG_HOST");
        return StringUtils.isNotBlank(host) ? host : DEFAULT_HOST;
    }

    /**
     * Enforce an email-consent opt-out on the PostHog person: unset the
     * synced email and pin marketingOptIn=false. Fire-and-forget; a
     * failure is logged but never fails the caller's mutation.
     */
    public void scrubEmailConsent(String showSubdomain) {
        String apiKey = getApiKey();
        if (StringUtils.isBlank(apiKey) || StringUtils.isBlank(showSubdomain)) {
            return;
        }
        String body = "{\"api_key\":\"" + jsonEscape(apiKey) + "\","
                + "\"event\":\"email_consent_enforced\","
                + "\"distinct_id\":\"" + jsonEscape(showSubdomain) + "\","
                + "\"properties\":{\"$set\":{\"marketingOptIn\":false},\"$unset\":[\"email\"],\"source\":\"control-panel\"}}";
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(getHost() + "/capture/"))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HTTP_CLIENT.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .whenComplete((response, throwable) -> {
                    if (throwable != null) {
                        log.warn("PostHog email-consent scrub failed for {}: {}", showSubdomain, throwable.getMessage());
                    } else if (response.statusCode() >= 400) {
                        log.warn("PostHog email-consent scrub for {} returned {}", showSubdomain, response.statusCode());
                    }
                });
    }

    private String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
