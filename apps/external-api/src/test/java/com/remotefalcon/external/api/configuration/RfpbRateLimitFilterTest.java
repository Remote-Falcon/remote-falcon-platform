package com.remotefalcon.external.api.configuration;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for the rate-limit filter (PR-C M3). Exercises:
 * <ul>
 *   <li>No-bearer requests pass through (BearerAspect 401s them)
 *   <li>Bearer requests consume tokens; X-RateLimit-Remaining is set
 *   <li>Per-minute cap (60) triggers 429 + Retry-After once exceeded
 *   <li>Independent buckets per bearer
 * </ul>
 *
 * <p>Per-hour cap (600) and refill behavior aren't unit-tested — Bucket4j
 * is well-tested upstream; the filter's contract with Bucket4j is the
 * load-bearing surface here.
 */
class RfpbRateLimitFilterTest {

    private final RfpbRateLimitFilter.RateLimitOncePerRequestFilter filter =
            new RfpbRateLimitFilter.RateLimitOncePerRequestFilter();

    private static MockHttpServletRequest req(String bearer) {
        MockHttpServletRequest r = new MockHttpServletRequest("GET", "/v1/pages");
        if (bearer != null) {
            r.addHeader("Authorization", "Bearer " + bearer);
        }
        return r;
    }

    @Test
    void allowsRequest_andDoesNotConsume_whenNoBearerHeader() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(req(null), response, chain);

        verify(chain, times(1)).doFilter(any(), any());
        // No bearer = no bucket touched = no rate-limit headers
        assertThat(response.getHeader("X-RateLimit-Remaining")).isNull();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void allowsRequest_andSetsRemainingHeader_whenBearerProvided() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(req("bearer-one"), response, chain);

        verify(chain, times(1)).doFilter(any(), any());
        // 60/min bucket; first call leaves 59 remaining
        assertThat(response.getHeader("X-RateLimit-Remaining")).isEqualTo("59");
    }

    @Test
    void countdownsRemaining_acrossRepeatedRequestsForSameBearer() throws Exception {
        MockHttpServletResponse last = null;
        for (int i = 0; i < 5; i++) {
            FilterChain chain = mock(FilterChain.class);
            last = new MockHttpServletResponse();
            filter.doFilter(req("same-bearer"), last, chain);
            verify(chain, times(1)).doFilter(any(), any());
        }
        // After 5 consumes, 55 remaining
        assertThat(last.getHeader("X-RateLimit-Remaining")).isEqualTo("55");
    }

    @Test
    void returns429_andRetryAfter_whenPerMinuteCapExceeded() throws Exception {
        // Drain the 60-token bucket
        for (int i = 0; i < 60; i++) {
            FilterChain chain = mock(FilterChain.class);
            filter.doFilter(req("greedy"), new MockHttpServletResponse(), chain);
        }
        // 61st should 429
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(req("greedy"), response, chain);

        verify(chain, never()).doFilter(any(), any()); // request was NOT proxied downstream
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Retry-After")).isNotNull();
        assertThat(Integer.parseInt(response.getHeader("Retry-After"))).isPositive();
        assertThat(response.getHeader("X-RateLimit-Remaining")).isEqualTo("0");
    }

    @Test
    void bearersHaveIndependentBuckets() throws Exception {
        // Drain bearer-A
        for (int i = 0; i < 60; i++) {
            filter.doFilter(req("bearer-A"), new MockHttpServletResponse(), mock(FilterChain.class));
        }
        // bearer-A's next call is 429
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(req("bearer-A"), blocked, mock(FilterChain.class));
        assertThat(blocked.getStatus()).isEqualTo(429);

        // But bearer-B is independent — first call has full 59 remaining
        FilterChain bChain = mock(FilterChain.class);
        MockHttpServletResponse bResp = new MockHttpServletResponse();
        filter.doFilter(req("bearer-B"), bResp, bChain);

        verify(bChain, times(1)).doFilter(any(), any());
        assertThat(bResp.getHeader("X-RateLimit-Remaining")).isEqualTo("59");
    }

    // helper for ArgumentMatchers without import bloat at top
    private static <T> T any() {
        return org.mockito.ArgumentMatchers.any();
    }
}
