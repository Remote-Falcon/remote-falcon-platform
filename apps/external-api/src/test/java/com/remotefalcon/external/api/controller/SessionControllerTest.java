package com.remotefalcon.external.api.controller;

import com.remotefalcon.auth.LaunchTokenVerificationException;
import com.remotefalcon.external.api.request.SessionExchangeRequest;
import com.remotefalcon.external.api.response.SessionResponse;
import com.remotefalcon.external.api.service.RfpbSessionService;
import com.remotefalcon.external.api.service.RfpbSessionService.ReplayedLaunchTokenException;
import com.remotefalcon.external.api.service.RfpbSessionService.SessionNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link SessionController}. Verifies error translation
 * (exceptions → status codes) and the bearer-header extraction branches
 * that the BearerAspect skips for the no-auth /exchange endpoint.
 *
 * <p>Doesn't exercise the {@link com.remotefalcon.external.api.aop.BearerAspect}
 * itself — that's covered in {@code BearerAspectTest}. Here we call the
 * controller methods directly with stubbed service responses.
 */
@ExtendWith(MockitoExtension.class)
class SessionControllerTest {

    @Mock private RfpbSessionService sessionService;

    @InjectMocks private SessionController controller;

    /** Empty request — no Authorization header — for body-path tests. */
    private static HttpServletRequest emptyReq() {
        return new MockHttpServletRequest("POST", "/v1/sessions/exchange");
    }

    /** Request carrying a launch token in the Authorization header (RFPB's preferred shape). */
    private static HttpServletRequest reqWithBearer(String token) {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/v1/sessions/exchange");
        req.addHeader("Authorization", "Bearer " + token);
        return req;
    }

    // ----- exchange -----

    @Test
    void exchange_returns200_andSessionResponse_onHappyPath_bodyShape() {
        SessionResponse stub = SessionResponse.builder()
                .token("bearer-value")
                .expiresAt(Instant.now().plusSeconds(1800))
                .showSubdomain("myxmas")
                .pageId("page-id")
                .build();
        when(sessionService.exchangeLaunchToken("valid-jwt")).thenReturn(stub);

        ResponseEntity<SessionResponse> response = controller.exchange(
                emptyReq(),
                SessionExchangeRequest.builder().launchToken("valid-jwt").build());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(stub);
    }

    @Test
    void exchange_returns200_onHappyPath_authorizationHeaderShape() {
        // RFPB sends the launch token in the Authorization header with no body.
        SessionResponse stub = SessionResponse.builder()
                .token("bearer-value")
                .expiresAt(Instant.now().plusSeconds(1800))
                .showSubdomain("myxmas")
                .pageId("page-id")
                .build();
        when(sessionService.exchangeLaunchToken("hdr-jwt")).thenReturn(stub);

        ResponseEntity<SessionResponse> response = controller.exchange(reqWithBearer("hdr-jwt"), null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(stub);
    }

    @Test
    void exchange_authorizationHeaderWinsWhenBothPresent() {
        when(sessionService.exchangeLaunchToken("from-header")).thenReturn(
                SessionResponse.builder().token("x").expiresAt(Instant.now()).build());

        controller.exchange(
                reqWithBearer("from-header"),
                SessionExchangeRequest.builder().launchToken("from-body").build());

        verify(sessionService).exchangeLaunchToken("from-header");
        verify(sessionService, never()).exchangeLaunchToken("from-body");
    }

    @Test
    void exchange_returns401_whenBodyIsNullAndNoHeader() {
        ResponseEntity<SessionResponse> response = controller.exchange(emptyReq(), null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(sessionService, never()).exchangeLaunchToken(any());
    }

    @Test
    void exchange_returns401_whenLaunchTokenIsNull() {
        ResponseEntity<SessionResponse> response = controller.exchange(
                emptyReq(),
                SessionExchangeRequest.builder().launchToken(null).build());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(sessionService, never()).exchangeLaunchToken(any());
    }

    @Test
    void exchange_returns401_whenLaunchTokenIsBlank() {
        ResponseEntity<SessionResponse> response = controller.exchange(
                emptyReq(),
                SessionExchangeRequest.builder().launchToken("   ").build());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(sessionService, never()).exchangeLaunchToken(any());
    }

    @Test
    void exchange_returns401_whenVerificationFails() {
        when(sessionService.exchangeLaunchToken("bad-jwt"))
                .thenThrow(new LaunchTokenVerificationException("bad signature"));

        ResponseEntity<SessionResponse> response = controller.exchange(
                emptyReq(),
                SessionExchangeRequest.builder().launchToken("bad-jwt").build());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void exchange_returns401_onReplay() {
        when(sessionService.exchangeLaunchToken("replayed-jwt"))
                .thenThrow(new ReplayedLaunchTokenException("jti consumed"));

        ResponseEntity<SessionResponse> response = controller.exchange(
                emptyReq(),
                SessionExchangeRequest.builder().launchToken("replayed-jwt").build());

        // Same 401 — caller doesn't get to distinguish replay from invalid
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ----- refresh -----

    @Test
    void refresh_returns200_andSlidesExpiry() {
        SessionResponse stub = SessionResponse.builder()
                .token("the-bearer")
                .expiresAt(Instant.now().plusSeconds(1800))
                .showSubdomain("myxmas")
                .pageId("page-id")
                .build();
        when(sessionService.refresh("the-bearer")).thenReturn(stub);

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer the-bearer");

        ResponseEntity<SessionResponse> response = controller.refresh(req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(stub);
    }

    @Test
    void refresh_returns401_whenServiceCannotFindSession() {
        when(sessionService.refresh("expired"))
                .thenThrow(new SessionNotFoundException("expired"));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer expired");

        ResponseEntity<SessionResponse> response = controller.refresh(req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void refresh_returns401_whenAuthorizationHeaderMissing() {
        // Defensive belt-and-suspenders — the aspect should have already
        // 401'd, but the controller defends in case of routing weirdness.
        MockHttpServletRequest req = new MockHttpServletRequest();

        ResponseEntity<SessionResponse> response = controller.refresh(req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(sessionService, never()).refresh(any());
    }

    @Test
    void refresh_returns401_whenAuthorizationHeaderHasNoBearerPrefix() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Basic abc");

        ResponseEntity<SessionResponse> response = controller.refresh(req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(sessionService, never()).refresh(any());
    }

    @Test
    void refresh_returns401_whenBearerIsEmpty() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer ");

        ResponseEntity<SessionResponse> response = controller.refresh(req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(sessionService, never()).refresh(any());
    }

    // ----- revoke -----

    @Test
    void revoke_returns204_andCallsService_whenBearerPresent() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer some-bearer");

        ResponseEntity<Void> response = controller.revokeCurrent(req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(sessionService, times(1)).revoke("some-bearer");
    }

    @Test
    void revoke_returns204_evenWhenBearerMissing() {
        // Always 204 — never leaks whether the bearer was real
        MockHttpServletRequest req = new MockHttpServletRequest();

        ResponseEntity<Void> response = controller.revokeCurrent(req);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(sessionService, never()).revoke(any());
    }
}
