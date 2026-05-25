package com.remotefalcon.external.api.controller;

import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import com.remotefalcon.external.api.request.PageWriteRequest;
import com.remotefalcon.external.api.response.PageResponse;
import com.remotefalcon.external.api.service.PageApiService;
import com.remotefalcon.external.api.service.PageApiService.EtagMismatchException;
import com.remotefalcon.external.api.service.PageApiService.PageNotFoundException;
import com.remotefalcon.external.api.service.RfpbAuditLogger;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link PagesController}. Exercises HTTP-level translation
 * (exceptions → status codes, ETag header formatting, If-Match quoting).
 * Service layer is mocked; aspect resolution + scope enforcement live in
 * {@code BearerAspectTest}.
 */
@ExtendWith(MockitoExtension.class)
class PagesControllerTest {

    private static final UUID PAGE_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    @Mock private PageApiService pageApiService;
    @Mock private RfpbAuditLogger auditLogger;
    @InjectMocks private PagesController controller;

    /** updatePage takes a HttpServletRequest now (for audit log). */
    private static HttpServletRequest mockRequest() {
        return new MockHttpServletRequest("PUT", "/v1/pages/abc");
    }

    @AfterEach
    void clearContext() {
        SessionContextHolder.clear();
    }

    private static PageResponse stubPage(String html, String etag) {
        return PageResponse.builder()
                .pageId(PAGE_ID.toString())
                .name("home")
                .active(true)
                .html(html)
                .updatedAt(Instant.parse("2026-05-24T12:00:00Z"))
                .etag(etag)
                .build();
    }

    // ----- listPages -----

    @Test
    void listPages_returns200_withList() {
        when(pageApiService.listPages()).thenReturn(List.of(stubPage("<p>x</p>", "abc")));

        ResponseEntity<List<PageResponse>> resp = controller.listPages();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).hasSize(1);
    }

    @Test
    void listPages_emitsNoStoreCacheControl() {
        // Audit finding L1 — bearer-authenticated GETs must explicitly opt
        // out of intermediate caching.
        when(pageApiService.listPages()).thenReturn(List.of(stubPage("<p>x</p>", "abc")));

        ResponseEntity<List<PageResponse>> resp = controller.listPages();

        assertThat(resp.getHeaders().getCacheControl()).contains("no-store");
        assertThat(resp.getHeaders().getCacheControl()).contains("private");
    }

    @Test
    void getPage_emitsNoStoreCacheControl_alongsideEtag() {
        when(pageApiService.getPage(PAGE_ID)).thenReturn(stubPage("<p>x</p>", "abc"));

        ResponseEntity<PageResponse> resp = controller.getPage(PAGE_ID.toString());

        assertThat(resp.getHeaders().getCacheControl()).contains("no-store");
        // ETag still set — Cache-Control: no-store does NOT prevent ETag use
        // for optimistic-concurrency, it only suppresses cache-storage.
        assertThat(resp.getHeaders().getETag()).isEqualTo("\"abc\"");
    }

    // ----- getPage -----

    @Test
    void getPage_returns200_andEtagHeader_onHappyPath() {
        when(pageApiService.getPage(PAGE_ID)).thenReturn(stubPage("<p>x</p>", "abc"));

        ResponseEntity<PageResponse> resp = controller.getPage(PAGE_ID.toString());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getHeaders().getETag()).isEqualTo("\"abc\"");
        assertThat(resp.getBody().getEtag()).isEqualTo("abc");
    }

    @Test
    void getPage_returns404_onMalformedUuid() {
        ResponseEntity<PageResponse> resp = controller.getPage("not-a-uuid");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(pageApiService, never()).getPage(any());
    }

    @Test
    void getPage_returns404_onPageNotFound() {
        when(pageApiService.getPage(PAGE_ID)).thenThrow(new PageNotFoundException());

        ResponseEntity<PageResponse> resp = controller.getPage(PAGE_ID.toString());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    // ----- updatePage -----

    @Test
    void updatePage_returns200_andEtagHeader_onHappyPath() {
        when(pageApiService.updatePage(eq(PAGE_ID), any(), any(), any(), eq("abc")))
                .thenReturn(stubPage("<p>new</p>", "def"));

        ResponseEntity<?> resp = controller.updatePage(PAGE_ID.toString(), "\"abc\"",
                PageWriteRequest.builder().html("<p>new</p>").build(), mockRequest());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getHeaders().getETag()).isEqualTo("\"def\"");
    }

    @Test
    void updatePage_stripsQuotesFromIfMatchHeader() {
        // Both "\"abc\"" and "abc" should reach the service as just "abc"
        when(pageApiService.updatePage(eq(PAGE_ID), any(), any(), any(), eq("abc")))
                .thenReturn(stubPage("<p>n</p>", "x"));

        controller.updatePage(PAGE_ID.toString(), "\"abc\"",
                PageWriteRequest.builder().html("<p>n</p>").build(), mockRequest());
        controller.updatePage(PAGE_ID.toString(), "abc",
                PageWriteRequest.builder().html("<p>n</p>").build(), mockRequest());

        // Both calls reached the service with the same stripped string —
        // verified by the matcher in the stub above (eq("abc")).
    }

    @Test
    void updatePage_returns412_andCurrentStateBody_onEtagMismatch() {
        PageResponse current = stubPage("<p>monaco</p>", "current-etag");
        when(pageApiService.updatePage(eq(PAGE_ID), any(), any(), any(), any()))
                .thenThrow(new EtagMismatchException(current));

        ResponseEntity<?> resp = controller.updatePage(PAGE_ID.toString(), "\"stale\"",
                PageWriteRequest.builder().html("<p>mine</p>").build(), mockRequest());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.PRECONDITION_FAILED);
        assertThat(resp.getHeaders().getETag()).isEqualTo("\"current-etag\"");
        assertThat(resp.getBody()).isEqualTo(current);
    }

    @Test
    void updatePage_returns404_onPageNotFound() {
        when(pageApiService.updatePage(eq(PAGE_ID), any(), any(), any(), any()))
                .thenThrow(new PageNotFoundException());

        ResponseEntity<?> resp = controller.updatePage(PAGE_ID.toString(), "\"abc\"",
                PageWriteRequest.builder().html("<p>n</p>").build(), mockRequest());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void updatePage_returns400_onSanitizerRejection() {
        when(pageApiService.updatePage(eq(PAGE_ID), any(), any(), any(), any()))
                .thenThrow(new IllegalArgumentException("too big"));

        ResponseEntity<?> resp = controller.updatePage(PAGE_ID.toString(), "\"abc\"",
                PageWriteRequest.builder().html("huge").build(), mockRequest());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void updatePage_returns400_onNullBody() {
        ResponseEntity<?> resp = controller.updatePage(PAGE_ID.toString(), "\"abc\"", null, mockRequest());
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void updatePage_returns404_onMalformedUuid() {
        ResponseEntity<?> resp = controller.updatePage("not-a-uuid", "\"abc\"",
                PageWriteRequest.builder().html("<p>x</p>").build(), mockRequest());
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    // ----- me -----

    @Test
    void me_emitsNoStoreCacheControl() {
        SessionContextHolder.set(SessionContext.builder()
                .showSubdomain("myxmas")
                .pageId(PAGE_ID.toString())
                .scopes(List.of("viewer_page:read"))
                .build());

        ResponseEntity<Map<String, Object>> resp = controller.me();

        assertThat(resp.getHeaders().getCacheControl()).contains("no-store");
    }

    @Test
    void me_returnsContextFields_whenSessionPresent() {
        SessionContextHolder.set(SessionContext.builder()
                .showSubdomain("myxmas")
                .pageId(PAGE_ID.toString())
                .scopes(List.of("viewer_page:read", "viewer_page:write"))
                .build());

        ResponseEntity<Map<String, Object>> resp = controller.me();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("showSubdomain", "myxmas")
                .containsEntry("pageId", PAGE_ID.toString())
                .containsEntry("scopes", List.of("viewer_page:read", "viewer_page:write"));
    }

    @Test
    void me_returns401_whenContextSomehowMissing() {
        // Defensive — aspect should have set it, but if not...
        SessionContextHolder.clear();

        ResponseEntity<Map<String, Object>> resp = controller.me();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
