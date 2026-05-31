package com.remotefalcon.external.api.configuration;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Defensive HTTP response headers on the RFPB-facing {@code /v1/**}
 * surface (PR-F of the RFPB integration, audit finding L4 + companion
 * hardening).
 *
 * <p>Four headers, all set unconditionally on /v1/** responses:
 *
 * <ul>
 *   <li>{@code Referrer-Policy: no-referrer} — the bearer token never
 *       appears in URLs, but defense in depth: if a future endpoint
 *       reflects any URL with sensitive query state, no Referer leaks
 *       it to third-party origins clicked from within RFPB. Also
 *       protects against accidental leaks if an integrator embeds RF
 *       responses in cross-origin frames.
 *   <li>{@code X-Content-Type-Options: nosniff} — instructs the browser
 *       not to MIME-sniff response bodies. JSON responses stay JSON;
 *       no chance of a content-type confusion attack escalating into
 *       script execution.
 *   <li>{@code X-Frame-Options: DENY} — the /v1 API is JSON; no reason
 *       for any page to frame it. Defends against clickjacking-style
 *       chains that would frame an authenticated API surface (e.g. to
 *       trick a user into triggering a request via a hidden iframe).
 *   <li>{@code Cache-Control: no-store} — set as a default for the
 *       entire /v1 surface so credential-returning endpoints (notably
 *       {@code POST /v1/sessions/exchange}, which returns the session
 *       bearer in the response body) can never be cached by an
 *       intermediate proxy. {@link
 *       com.remotefalcon.external.api.controller.PagesController}'s
 *       GETs additionally set {@code private} via
 *       {@code ResponseEntity.cacheControl()}, which writes after the
 *       filter and is strictly more restrictive — that override stays
 *       intact.
 * </ul>
 *
 * <p>Ordered after the rate-limit filter (PR-C) so a 429 still carries
 * these headers (an attacker should see consistent headers regardless
 * of which path their request takes). Spring picks the order from the
 * {@code FilterRegistrationBean}; lower number = earlier in the chain.
 *
 * <p>Prod ingress (nginx-ingress) may set additional headers at the
 * cluster level; this filter ensures the headers are present even if
 * the cluster config drifts. Same posture as Spring Security's default
 * header filter, just narrower scope (RF doesn't use Spring Security
 * here — see WebSecurityConfig for the CORS-only configuration).
 */
@Configuration
public class V1SecurityHeadersFilter {

    @Bean
    public FilterRegistrationBean<HeadersFilter> v1SecurityHeadersFilterRegistration() {
        FilterRegistrationBean<HeadersFilter> reg =
                new FilterRegistrationBean<>(new HeadersFilter());
        reg.addUrlPatterns("/v1/*");
        reg.setName("v1SecurityHeadersFilter");
        // After the rate-limit filter (order 10) but before AOP-resolved
        // controller invocation. Header writes work even on 429 paths.
        reg.setOrder(20);
        return reg;
    }

    static class HeadersFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                        FilterChain chain) throws ServletException, IOException {
            // Set early so they're present even if downstream code throws.
            response.setHeader("Referrer-Policy", "no-referrer");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("X-Frame-Options", "DENY");
            response.setHeader("Cache-Control", "no-store");
            chain.doFilter(request, response);
        }
    }
}
