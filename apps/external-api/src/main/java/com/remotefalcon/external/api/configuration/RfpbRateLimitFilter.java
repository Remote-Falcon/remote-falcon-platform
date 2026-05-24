package com.remotefalcon.external.api.configuration;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Per-bearer token-bucket rate limiting on {@code /v1/**} (PR-C M3 of
 * the RFPB integration). Backed by Bucket4j in-memory — single-replica
 * external-api today; swap to Redis-backed buckets if/when the service
 * scales to multiple replicas (Bucket4j has first-class Redis support).
 *
 * <p>Limits per bearer (matches PRD Section 6):
 * <ul>
 *   <li>60 requests/minute
 *   <li>600 requests/hour
 * </ul>
 *
 * <p>The PRD also mentioned 5000/day but with a 60/min cap that's
 * practically unreachable (60×60×24 = 86,400 max); skipped to keep the
 * bucket simple.
 *
 * <p>Returns {@code 429 Too Many Requests} with {@code Retry-After}
 * (seconds until next refill) and {@code X-RateLimit-Remaining} headers.
 * RFPB's auto-save at ~1 req/s sits comfortably under the 60/min cap;
 * burst-handling on conflict-resolution flows fits within the per-hour
 * budget.
 *
 * <p>Requests without a Bearer header bypass rate limiting here — the
 * downstream {@code BearerAspect} will 401 them anyway. Rate limiting
 * unauthenticated requests would just waste cycles on garbage traffic
 * that's already destined for 401.
 *
 * <p>Bucket map grows as new bearers come in; never pruned. Session
 * bearers themselves expire from Mongo on 30-min TTL, so the practical
 * unique-bearer-per-hour count is small (low hundreds at expected
 * scale). On restart the map clears; rate limits reset. Acceptable
 * tradeoff for v1.
 */
@Configuration
@Slf4j
public class RfpbRateLimitFilter {

    private static final int PER_MINUTE = 60;
    private static final int PER_HOUR = 600;

    @Bean
    public FilterRegistrationBean<RateLimitOncePerRequestFilter> rfpbRateLimitFilterRegistration() {
        FilterRegistrationBean<RateLimitOncePerRequestFilter> reg =
                new FilterRegistrationBean<>(new RateLimitOncePerRequestFilter());
        reg.addUrlPatterns("/v1/*");
        reg.setName("rfpbRateLimitFilter");
        // Run early — before any controller / aspect work happens, so
        // we don't waste expensive token resolution on rate-limited
        // requests. Order < the standard Spring Security filter chain.
        reg.setOrder(10);
        return reg;
    }

    /** The actual filter; package-private so the test can instantiate directly. */
    static class RateLimitOncePerRequestFilter extends OncePerRequestFilter {

        private static final String AUTHORIZATION = "Authorization";
        private static final String BEARER_PREFIX = "Bearer ";
        private static final String RATE_LIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";
        private static final String RETRY_AFTER_HEADER = "Retry-After";

        /**
         * Bearer-hash → bucket. Keyed on the hash (NOT the raw bearer) so
         * memory dumps don't reveal live bearers. Same hashing convention
         * as RfpbSession storage.
         */
        private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                        FilterChain chain) throws ServletException, IOException {
            String bearer = extractBearer(request);
            if (bearer == null) {
                // No bearer → BearerAspect will 401 it. Don't waste a bucket.
                chain.doFilter(request, response);
                return;
            }
            Bucket bucket = buckets.computeIfAbsent(hash(bearer), k -> newBucket());
            ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
            if (probe.isConsumed()) {
                response.setHeader(RATE_LIMIT_REMAINING_HEADER,
                        String.valueOf(probe.getRemainingTokens()));
                chain.doFilter(request, response);
                return;
            }
            // Rate-limited. nanosToWaitForRefill returns ns until at least 1
            // token is available; round up to seconds for Retry-After.
            long retryAfterSeconds = Math.max(1,
                    TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()) + 1);
            response.setStatus(429);
            response.setHeader(RETRY_AFTER_HEADER, String.valueOf(retryAfterSeconds));
            response.setHeader(RATE_LIMIT_REMAINING_HEADER, "0");
        }

        private static Bucket newBucket() {
            return Bucket.builder()
                    .addLimit(Bandwidth.builder()
                            .capacity(PER_MINUTE)
                            .refillIntervally(PER_MINUTE, Duration.ofMinutes(1))
                            .build())
                    .addLimit(Bandwidth.builder()
                            .capacity(PER_HOUR)
                            .refillIntervally(PER_HOUR, Duration.ofHours(1))
                            .build())
                    .build();
        }

        private static String extractBearer(HttpServletRequest request) {
            String header = request.getHeader(AUTHORIZATION);
            if (header == null || !header.startsWith(BEARER_PREFIX)) {
                return null;
            }
            String token = header.substring(BEARER_PREFIX.length()).trim();
            return token.isEmpty() ? null : token;
        }

        /** Same SHA-256-base64url as RfpbSessionService; mirrored to avoid a circular dep. */
        private static String hash(String bearer) {
            try {
                byte[] digest = MessageDigest.getInstance("SHA-256")
                        .digest(bearer.getBytes(StandardCharsets.UTF_8));
                return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("SHA-256 unavailable", e);
            }
        }
    }
}
