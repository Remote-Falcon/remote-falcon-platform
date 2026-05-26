package com.remotefalcon.external.api.service;

import com.mongodb.client.result.UpdateResult;
import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.external.api.response.PageResponse;
import com.remotefalcon.external.api.service.PageApiService.EtagMismatchException;
import com.remotefalcon.external.api.service.PageApiService.PageNotFoundException;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ViewerPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link PageApiService}. Real {@link ViewerPageSanitizer}
 * + real {@link ViewerPageEtag} (cheap, deterministic); MongoTemplate +
 * ShowRepository mocked.
 *
 * <p>Coverage focus:
 * <ul>
 *   <li>listPages / getPage filter by current session's show (cross-show
 *       injection defense — caller's pageId must belong to bearer's show)
 *   <li>updatePage: happy path, 412 on stale ETag (pre-check), 412 on
 *       race (post-DB-check), 404 on page deleted mid-flight,
 *       sanitization fires before persistence
 *   <li>ViewerPageEtag matches control-panel's computation (drift check)
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class PageApiServiceTest {

    private static final String SHOW_TOKEN = "show-token-abc";
    private static final UUID PAGE_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");
    private static final UUID OTHER_PAGE_ID = UUID.fromString("99999999-9999-9999-9999-999999999999");
    private static final Instant T0 = Instant.parse("2026-05-24T12:00:00Z");

    @Mock private ShowRepository showRepository;
    @Mock private MongoTemplate mongoTemplate;

    private final ViewerPageSanitizer sanitizer = new ViewerPageSanitizer();

    private PageApiService service;

    @BeforeEach
    void setUp() {
        service = new PageApiService(showRepository, mongoTemplate, sanitizer);
        SessionContextHolder.set(SessionContext.builder()
                .showSubdomain("myxmas")
                .showToken(SHOW_TOKEN)
                .pageId(PAGE_ID.toString())
                .scopes(List.of("viewer_page:read", "viewer_page:write"))
                .build());
    }

    @AfterEach
    void clearSession() {
        SessionContextHolder.clear();
    }

    private ViewerPage page(UUID id, String name, String html, Instant updatedAt) {
        return ViewerPage.builder()
                .pageId(id)
                .name(name)
                .active(true)
                .html(html)
                .updatedAt(updatedAt)
                .build();
    }

    private Show showWithPages(List<ViewerPage> pages) {
        return Show.builder()
                .showToken(SHOW_TOKEN)
                .pages(new ArrayList<>(pages))
                .build();
    }

    // ----- listPages -----

    @Test
    void listPages_returnsAllPagesOnCurrentShow() {
        ViewerPage p1 = page(PAGE_ID, "home", "<p>1</p>", T0);
        ViewerPage p2 = page(OTHER_PAGE_ID, "about", "<p>2</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(p1, p2))));

        List<PageResponse> result = service.listPages();

        assertThat(result).hasSize(2);
        assertThat(result.get(0).getPageId()).isEqualTo(PAGE_ID.toString());
        assertThat(result.get(1).getPageId()).isEqualTo(OTHER_PAGE_ID.toString());
        // ETag inlined on every list entry
        assertThat(result.get(0).getEtag()).isNotBlank();
    }

    @Test
    void listPages_returnsEmpty_whenShowHasNoPages() {
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of())));

        assertThat(service.listPages()).isEmpty();
    }

    @Test
    void listPages_throwsPageNotFound_whenShowMissing() {
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(service::listPages).isInstanceOf(PageNotFoundException.class);
    }

    // ----- getPage -----

    @Test
    void getPage_returnsResponse_whenPageOnCurrentShow() {
        ViewerPage p = page(PAGE_ID, "home", "<p>x</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(p))));

        PageResponse result = service.getPage(PAGE_ID);

        assertThat(result.getPageId()).isEqualTo(PAGE_ID.toString());
        assertThat(result.getHtml()).isEqualTo("<p>x</p>");
        assertThat(result.getEtag()).isEqualTo(ViewerPageEtag.compute(p));
    }

    @Test
    void getPage_throwsPageNotFound_whenIdNotOnCurrentShow() {
        ViewerPage p = page(PAGE_ID, "home", "<p>x</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(p))));

        // Caller asks for a different show's pageId
        assertThatThrownBy(() -> service.getPage(OTHER_PAGE_ID))
                .isInstanceOf(PageNotFoundException.class);
    }

    // ----- updatePage -----

    @Test
    void updatePage_writesAndReturnsUpdated_onHappyPath() {
        ViewerPage existing = page(PAGE_ID, "home", "<p>old</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(existing))));
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 1L, null));
        String correctEtag = ViewerPageEtag.compute(existing);

        PageResponse result = service.updatePage(PAGE_ID, "newname", true, "<p>new</p>", correctEtag, false);

        assertThat(result.getPageId()).isEqualTo(PAGE_ID.toString());
        assertThat(result.getName()).isEqualTo("newname");
        assertThat(result.getHtml()).isEqualTo("<p>new</p>");
        // ETag changed because html + updatedAt changed
        assertThat(result.getEtag()).isNotEqualTo(correctEtag);
        verify(mongoTemplate, times(1))
                .updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void updatePage_throws412_whenPreCheckEtagMismatches() {
        ViewerPage existing = page(PAGE_ID, "home", "<p>old</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(existing))));

        assertThatThrownBy(() ->
                service.updatePage(PAGE_ID, null, null, "<p>new</p>", "stale-etag", false))
                .isInstanceOf(EtagMismatchException.class)
                .satisfies(ex -> {
                    EtagMismatchException ee = (EtagMismatchException) ex;
                    assertThat(ee.getCurrentServerState().getEtag())
                            .isEqualTo(ViewerPageEtag.compute(existing));
                });

        // No write attempted
        verify(mongoTemplate, never()).updateFirst(any(), any(), eq(Show.class));
    }

    @Test
    void updatePage_throws412_whenConcurrentWriteOccursAfterPreCheck() {
        // Pre-check ETag matches, but the Mongo write returns modifiedCount=0
        // because a concurrent Monaco save bumped updatedAt. The follow-up
        // re-read finds the page still exists with a different state → 412.
        ViewerPage atReadTime = page(PAGE_ID, "home", "<p>old</p>", T0);
        Instant T1 = T0.plusSeconds(60);
        ViewerPage afterConcurrentSave = page(PAGE_ID, "home", "<p>monaco-edit</p>", T1);

        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(atReadTime))),
                            Optional.of(showWithPages(List.of(afterConcurrentSave))));
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 0L, null));

        String preCheckEtag = ViewerPageEtag.compute(atReadTime);

        assertThatThrownBy(() ->
                service.updatePage(PAGE_ID, null, null, "<p>my-edit</p>", preCheckEtag, false))
                .isInstanceOf(EtagMismatchException.class)
                .satisfies(ex -> {
                    PageResponse server = ((EtagMismatchException) ex).getCurrentServerState();
                    // The 412 body carries the WINNING (post-concurrent-save) state
                    assertThat(server.getHtml()).isEqualTo("<p>monaco-edit</p>");
                });
    }

    @Test
    void updatePage_throws404_whenPageDeletedMidFlight() {
        ViewerPage atReadTime = page(PAGE_ID, "home", "<p>x</p>", T0);

        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(atReadTime))),
                            Optional.of(showWithPages(List.of()))); // deleted between pre-check and write
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 0L, null));

        String etag = ViewerPageEtag.compute(atReadTime);

        assertThatThrownBy(() ->
                service.updatePage(PAGE_ID, null, null, "<p>edit</p>", etag, false))
                .isInstanceOf(PageNotFoundException.class);
    }

    @Test
    void updatePage_sanitizesHtmlBeforeWrite() {
        ViewerPage existing = page(PAGE_ID, "home", "<p>old</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(existing))));
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 1L, null));

        PageResponse result = service.updatePage(PAGE_ID, null, null,
                "<p>hi</p><script>bad()</script>", ViewerPageEtag.compute(existing), false);

        assertThat(result.getHtml()).doesNotContain("<script>");
    }

    @Test
    void updatePage_throws400_whenSanitizedHtmlExceedsSizeCap() {
        ViewerPage existing = page(PAGE_ID, "home", "<p>x</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(existing))));
        // 1.1 MB of innocuous content — pass sanitization but fail size cap
        String huge = "<p>" + "x".repeat(1_100_000) + "</p>";

        assertThatThrownBy(() ->
                service.updatePage(PAGE_ID, null, null, huge, ViewerPageEtag.compute(existing), false))
                .isInstanceOf(IllegalArgumentException.class);

        verify(mongoTemplate, never()).updateFirst(any(), any(), eq(Show.class));
    }

    // ----- updatePage: force=true (overwrite-anyway path) -----

    @Test
    void updatePage_force_succeeds_whenIfMatchStale() {
        // Pre-check ETag would mismatch, but force=true bypasses it.
        ViewerPage existing = page(PAGE_ID, "home", "<p>old</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(existing))));
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 1L, null));

        PageResponse result = service.updatePage(PAGE_ID, null, null,
                "<p>forced</p>", "completely-wrong-etag", true);

        assertThat(result.getHtml()).isEqualTo("<p>forced</p>");
        verify(mongoTemplate, times(1))
                .updateFirst(any(Query.class), any(Update.class), eq(Show.class));
    }

    @Test
    void updatePage_force_succeeds_whenIfMatchNull() {
        // The actual RFPB conflict-modal path: client sends force=true with
        // NO If-Match header (which arrives as null at this layer).
        ViewerPage existing = page(PAGE_ID, "home", "<p>old</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(existing))));
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 1L, null));

        PageResponse result = service.updatePage(PAGE_ID, null, null,
                "<p>forced</p>", null, true);

        assertThat(result.getHtml()).isEqualTo("<p>forced</p>");
    }

    @Test
    void updatePage_force_throws404_whenPageDeletedMidFlight() {
        // Even on force=true the page has to exist. The pre-check read
        // finds it, but it's deleted before the write fires — modifiedCount
        // 0 + re-read finds no page → 404, not 412 (no ETag to mismatch
        // against under force semantics).
        ViewerPage atReadTime = page(PAGE_ID, "home", "<p>x</p>", T0);

        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(atReadTime))),
                            Optional.of(showWithPages(List.of()))); // deleted mid-flight
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 0L, null));

        assertThatThrownBy(() ->
                service.updatePage(PAGE_ID, null, null, "<p>edit</p>", null, true))
                .isInstanceOf(PageNotFoundException.class);
    }

    @Test
    void updatePage_force_stillSanitizes_andEnforcesSizeCap() {
        // Force bypasses the conditional-request check, NOT the security
        // floor. Scripts still get stripped; oversized pages still 400.
        ViewerPage existing = page(PAGE_ID, "home", "<p>x</p>", T0);
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(existing))));
        when(mongoTemplate.updateFirst(any(Query.class), any(Update.class), eq(Show.class)))
                .thenReturn(UpdateResult.acknowledged(1, 1L, null));

        PageResponse result = service.updatePage(PAGE_ID, null, null,
                "<p>hi</p><script>bad()</script>", null, true);
        assertThat(result.getHtml()).doesNotContain("<script>");

        // Reset mock + try oversized input
        String huge = "<p>" + "x".repeat(1_100_000) + "</p>";
        assertThatThrownBy(() ->
                service.updatePage(PAGE_ID, null, null, huge, null, true))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
