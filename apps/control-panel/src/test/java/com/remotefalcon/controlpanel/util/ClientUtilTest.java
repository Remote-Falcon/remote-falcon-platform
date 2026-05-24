package com.remotefalcon.controlpanel.util;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ClientUtil#getClientIp(HttpServletRequest)} — IP
 * extraction. Production reads the configured {@code client.header}
 * (typically {@code X-Forwarded-For} behind the ingress) and falls back
 * to {@link HttpServletRequest#getRemoteAddr()} only when the header is
 * absent or blank.
 */
@ExtendWith(MockitoExtension.class)
class ClientUtilTest {

    private static final String HEADER = "X-Forwarded-For";

    @Mock private HttpServletRequest request;

    private ClientUtil clientUtil;

    @BeforeEach
    void setUp() {
        clientUtil = new ClientUtil();
        ReflectionTestUtils.setField(clientUtil, "clientHeader", HEADER);
    }

    @Test
    void returnsHeaderValue_whenHeaderPresent() {
        when(request.getHeader(HEADER)).thenReturn("203.0.113.4");

        assertThat(clientUtil.getClientIp(request)).isEqualTo("203.0.113.4");
    }

    @Test
    void fallsBackToRemoteAddr_whenHeaderMissing() {
        when(request.getHeader(HEADER)).thenReturn(null);
        when(request.getRemoteAddr()).thenReturn("10.0.0.1");

        assertThat(clientUtil.getClientIp(request)).isEqualTo("10.0.0.1");
    }

    @Test
    void fallsBackToRemoteAddr_whenHeaderEmptyString() {
        when(request.getHeader(HEADER)).thenReturn("");
        when(request.getRemoteAddr()).thenReturn("10.0.0.2");

        assertThat(clientUtil.getClientIp(request)).isEqualTo("10.0.0.2");
    }

    @Test
    void returnsEmptyString_whenRequestIsNull() {
        // The guard against a null request keeps the resolver safe to call
        // outside a Spring request scope (e.g. from a future scheduled task).
        assertThat(clientUtil.getClientIp(null)).isEmpty();
    }
}
