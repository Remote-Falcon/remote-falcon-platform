package com.remotefalcon.external.api.configuration;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Tests for the security-headers filter (audit finding L4 + companion
 * defense-in-depth). All three headers must be set on every /v1/**
 * response regardless of status or downstream behavior.
 */
class V1SecurityHeadersFilterTest {

    private final V1SecurityHeadersFilter.HeadersFilter filter =
            new V1SecurityHeadersFilter.HeadersFilter();

    @Test
    void setsAllThreeHeaders_andProceedsThroughChain() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/v1/pages");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(req, resp, chain);

        assertThat(resp.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(resp.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(resp.getHeader("X-Frame-Options")).isEqualTo("DENY");
        verify(chain).doFilter(any(), any());
    }

    @Test
    void headersSetBeforeChain_soPresentEvenIfChainThrows() throws Exception {
        // Headers are written before chain.doFilter; even if a downstream
        // filter or controller throws, the headers are already on the
        // response object.
        MockHttpServletRequest req = new MockHttpServletRequest("PUT", "/v1/pages/abc");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        FilterChain chain = (request, response) -> {
            throw new RuntimeException("simulated downstream failure");
        };

        try {
            filter.doFilter(req, resp, chain);
        } catch (RuntimeException ignored) {
            // expected
        }

        assertThat(resp.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(resp.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(resp.getHeader("X-Frame-Options")).isEqualTo("DENY");
    }
}
