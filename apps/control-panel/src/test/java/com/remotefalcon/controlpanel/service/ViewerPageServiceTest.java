package com.remotefalcon.controlpanel.service;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ViewerPage;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link ViewerPageService}.
 *
 * <p>Three concerns: HTML sanitization (the security part), size validation
 * (the DoS-cap part), and lazy backfill of {@code pageId} / {@code updatedAt}
 * (the migration part). Pure-logic class, no Spring context needed.
 */
class ViewerPageServiceTest {

    private final ViewerPageService service = new ViewerPageService();

    // -------- sanitize: attacks that MUST be stripped ----------

    @Test
    void sanitize_strips_scriptTags() {
        String dirty = "<p>hello</p><script>alert(1)</script>";
        assertThat(service.sanitize(dirty)).doesNotContain("<script>", "alert");
    }

    @Test
    void sanitize_strips_eventHandlerAttributes() {
        String dirty = "<button onclick=\"alert(1)\">click</button>";
        String clean = service.sanitize(dirty);
        assertThat(clean).doesNotContain("onclick", "alert");
    }

    @Test
    void sanitize_strips_javascriptUrls() {
        String dirty = "<a href=\"javascript:alert(1)\">x</a>";
        String clean = service.sanitize(dirty);
        assertThat(clean).doesNotContain("javascript:");
    }

    @Test
    void sanitize_strips_dataUrls_onAnchors() {
        // data: URLs on <a href> are a known phishing vector; only <img src>
        // gets data: URL allowance via the relaxed Safelist default.
        String dirty = "<a href=\"data:text/html,<script>alert(1)</script>\">x</a>";
        String clean = service.sanitize(dirty);
        assertThat(clean).doesNotContain("data:text/html");
    }

    @Test
    void sanitize_strips_inlineSvgScripts() {
        // SVG can carry script tags. The relaxed Safelist doesn't allow
        // <svg> at all, so the whole thing falls away.
        String dirty = "<svg><script>alert(1)</script></svg>";
        String clean = service.sanitize(dirty);
        assertThat(clean).doesNotContain("<script>", "alert");
    }

    // -------- sanitize: legitimate viewer-page markup MUST be preserved ----

    @Test
    void sanitize_preserves_basicFormattingTags() {
        String html = "<h1>Title</h1><p>Body with <strong>emphasis</strong></p>";
        String clean = service.sanitize(html);
        assertThat(clean).contains("<h1>", "<p>", "<strong>");
    }

    @Test
    void sanitize_preserves_styleTag() {
        // Show owners commonly include inline <style> blocks. The Safelist
        // explicitly adds <style> on top of relaxed (which excludes it).
        String html = "<style>body { background: black; }</style><p>x</p>";
        String clean = service.sanitize(html);
        assertThat(clean).contains("<style>");
    }

    @Test
    void sanitize_preserves_inlineStyleAttribute() {
        String html = "<p style=\"color: red;\">red text</p>";
        String clean = service.sanitize(html);
        assertThat(clean).contains("style=\"color: red;\"");
    }

    @Test
    void sanitize_preserves_classAndIdAttributes() {
        String html = "<div class=\"hero\" id=\"top\">content</div>";
        String clean = service.sanitize(html);
        assertThat(clean).contains("class=\"hero\"").contains("id=\"top\"");
    }

    @Test
    void sanitize_preserves_imageDataUrl() {
        // <img src="data:image/png;..."> is a legitimate inline-image pattern.
        String dataImg = "<img src=\"data:image/png;base64,iVBORw0KGgo=\" alt=\"x\">";
        String clean = service.sanitize(dataImg);
        assertThat(clean).contains("data:image/png");
    }

    @Test
    void sanitize_preserves_relativeUrls() {
        String html = "<a href=\"/playlist\">songs</a>";
        String clean = service.sanitize(html);
        assertThat(clean).contains("href=\"/playlist\"");
    }

    @Test
    void sanitize_preserves_externalHttpsLinks() {
        String html = "<a href=\"https://example.com\">x</a>";
        String clean = service.sanitize(html);
        assertThat(clean).contains("https://example.com");
    }

    // -------- sanitize: null / empty handling ----------

    @Test
    void sanitize_returnsEmptyString_forNullInput() {
        assertThat(service.sanitize(null)).isEmpty();
    }

    @Test
    void sanitize_returnsEmptyString_forEmptyInput() {
        assertThat(service.sanitize("")).isEmpty();
    }

    // -------- validateSize ----------

    @Test
    void validateSize_acceptsSmallHtml() {
        // Sanity: a normal-sized page passes.
        service.validateSize("<p>small</p>");
    }

    @Test
    void validateSize_acceptsHtmlAtTheLimit() {
        // Exactly at the 1 MB limit — must pass (the gate is "exceeds").
        String html = "x".repeat(ViewerPageService.MAX_HTML_BYTES);
        service.validateSize(html);
    }

    @Test
    void validateSize_rejectsHtmlOverLimit() {
        String html = "x".repeat(ViewerPageService.MAX_HTML_BYTES + 1);
        assertThatThrownBy(() -> service.validateSize(html))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exceeds");
    }

    @Test
    void validateSize_isNoOp_forNullInput() {
        // No exception. Empty input is the caller's responsibility to
        // validate at the semantic level; this method only checks size.
        service.validateSize(null);
    }

    // -------- prepareForWrite ----------

    @Test
    void prepareForWrite_sanitizesAndStampsAndMintsPageId_whenAllAbsent() {
        ViewerPage page = ViewerPage.builder()
                .name("home")
                .active(true)
                .html("<p>hi</p><script>bad()</script>")
                .build();

        Instant before = Instant.now();
        service.prepareForWrite(page);
        Instant after = Instant.now();

        assertThat(page.getHtml()).doesNotContain("<script>");
        assertThat(page.getPageId()).isNotNull();
        assertThat(page.getUpdatedAt()).isBetween(before, after);
    }

    @Test
    void prepareForWrite_preservesCallerSuppliedPageId() {
        UUID supplied = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        ViewerPage page = ViewerPage.builder()
                .name("home")
                .active(true)
                .html("<p>hi</p>")
                .pageId(supplied)
                .build();

        service.prepareForWrite(page);

        assertThat(page.getPageId()).isEqualTo(supplied);
    }

    @Test
    void prepareForWrite_alwaysOverwrites_updatedAt() {
        ViewerPage page = ViewerPage.builder()
                .name("home")
                .active(true)
                .html("<p>hi</p>")
                .updatedAt(Instant.EPOCH)
                .build();

        service.prepareForWrite(page);

        assertThat(page.getUpdatedAt()).isAfter(Instant.EPOCH);
    }

    @Test
    void prepareForWrite_rejectsOversizedHtml() {
        ViewerPage page = ViewerPage.builder()
                .name("home")
                .active(true)
                .html("x".repeat(ViewerPageService.MAX_HTML_BYTES + 1))
                .build();

        assertThatThrownBy(() -> service.prepareForWrite(page))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void prepareForWrite_isNoOp_forNullPage() {
        // Defensive — caller iterating a list might encounter nulls.
        service.prepareForWrite(null);
    }

    // -------- normalizeAndBackfill ----------

    @Test
    void normalizeAndBackfill_returnsFalse_forNullShow() {
        assertThat(service.normalizeAndBackfill(null)).isFalse();
    }

    @Test
    void normalizeAndBackfill_returnsFalse_forNullPages() {
        Show show = Show.builder().id("show-id").build();
        assertThat(service.normalizeAndBackfill(show)).isFalse();
    }

    @Test
    void normalizeAndBackfill_returnsFalse_forEmptyPages() {
        Show show = Show.builder().id("show-id").pages(new ArrayList<>()).build();
        assertThat(service.normalizeAndBackfill(show)).isFalse();
    }

    @Test
    void normalizeAndBackfill_mintsPageIdAndEpochUpdatedAt_forLegacyPage() {
        ViewerPage legacy = ViewerPage.builder()
                .name("home")
                .active(true)
                .html("<p>x</p>")
                .build();
        Show show = Show.builder().id("show-1").pages(new ArrayList<>(List.of(legacy))).build();

        boolean modified = service.normalizeAndBackfill(show);

        assertThat(modified).isTrue();
        assertThat(legacy.getPageId()).isNotNull();
        assertThat(legacy.getUpdatedAt()).isEqualTo(Instant.EPOCH);
    }

    @Test
    void normalizeAndBackfill_isIdempotent_onAlreadyBackfilledShow() {
        ViewerPage page = ViewerPage.builder()
                .name("home")
                .active(true)
                .html("<p>x</p>")
                .pageId(UUID.randomUUID())
                .updatedAt(Instant.EPOCH)
                .build();
        Show show = Show.builder().id("show-1").pages(new ArrayList<>(List.of(page))).build();

        UUID idBefore = page.getPageId();
        Instant updatedBefore = page.getUpdatedAt();

        boolean modified = service.normalizeAndBackfill(show);

        // Idempotent: no changes, no save needed.
        assertThat(modified).isFalse();
        assertThat(page.getPageId()).isEqualTo(idBefore);
        assertThat(page.getUpdatedAt()).isEqualTo(updatedBefore);
    }

    @Test
    void normalizeAndBackfill_isDeterministic_acrossCalls() {
        // Same show.id + page.name + index must produce the same UUID on
        // every call. Protects against concurrent reads of a legacy page
        // racing to mint two different IDs.
        Show first = Show.builder()
                .id("show-1")
                .pages(new ArrayList<>(List.of(
                        ViewerPage.builder().name("home").active(true).html("<p>x</p>").build())))
                .build();
        Show second = Show.builder()
                .id("show-1")
                .pages(new ArrayList<>(List.of(
                        ViewerPage.builder().name("home").active(true).html("<p>x</p>").build())))
                .build();

        service.normalizeAndBackfill(first);
        service.normalizeAndBackfill(second);

        assertThat(first.getPages().get(0).getPageId())
                .isEqualTo(second.getPages().get(0).getPageId());
    }

    @Test
    void normalizeAndBackfill_distinguishesDuplicateNamesByIndex() {
        // Legacy data may include duplicate page names (the existing schema
        // doesn't prevent it). Each duplicate must get a distinct pageId
        // anchored to its list index.
        Show show = Show.builder()
                .id("show-1")
                .pages(new ArrayList<>(Arrays.asList(
                        ViewerPage.builder().name("home").active(true).html("<p>1</p>").build(),
                        ViewerPage.builder().name("home").active(false).html("<p>2</p>").build())))
                .build();

        service.normalizeAndBackfill(show);

        UUID firstId = show.getPages().get(0).getPageId();
        UUID secondId = show.getPages().get(1).getPageId();
        assertThat(firstId).isNotNull();
        assertThat(secondId).isNotNull();
        assertThat(firstId).isNotEqualTo(secondId);
    }

    @Test
    void normalizeAndBackfill_skipsNullPages_inList() {
        // Defensive — Mongo deserialization can theoretically produce nulls
        // in a List field if a doc was corrupted. Don't crash.
        Show show = Show.builder()
                .id("show-1")
                .pages(new ArrayList<>(Arrays.asList(
                        (ViewerPage) null,
                        ViewerPage.builder().name("home").active(true).html("<p>x</p>").build())))
                .build();

        boolean modified = service.normalizeAndBackfill(show);

        assertThat(modified).isTrue();
        assertThat(show.getPages().get(1).getPageId()).isNotNull();
    }

    // -------- computeEtag ----------

    @Test
    void computeEtag_isDeterministic_forSameInput() {
        ViewerPage page = ViewerPage.builder()
                .html("<p>x</p>")
                .updatedAt(Instant.parse("2026-05-24T12:00:00Z"))
                .build();

        assertThat(ViewerPageService.computeEtag(page))
                .isEqualTo(ViewerPageService.computeEtag(page));
    }

    @Test
    void computeEtag_differs_whenHtmlDiffers() {
        ViewerPage one = ViewerPage.builder()
                .html("<p>one</p>")
                .updatedAt(Instant.parse("2026-05-24T12:00:00Z"))
                .build();
        ViewerPage two = ViewerPage.builder()
                .html("<p>two</p>")
                .updatedAt(Instant.parse("2026-05-24T12:00:00Z"))
                .build();

        assertThat(ViewerPageService.computeEtag(one))
                .isNotEqualTo(ViewerPageService.computeEtag(two));
    }

    @Test
    void computeEtag_differs_whenUpdatedAtDiffers() {
        ViewerPage earlier = ViewerPage.builder()
                .html("<p>same html</p>")
                .updatedAt(Instant.parse("2026-05-24T12:00:00Z"))
                .build();
        ViewerPage later = ViewerPage.builder()
                .html("<p>same html</p>")
                .updatedAt(Instant.parse("2026-05-24T13:00:00Z"))
                .build();

        assertThat(ViewerPageService.computeEtag(earlier))
                .isNotEqualTo(ViewerPageService.computeEtag(later));
    }

    @Test
    void computeEtag_returnsLowercaseHex_ofExpectedLength() {
        ViewerPage page = ViewerPage.builder()
                .html("<p>x</p>")
                .updatedAt(Instant.parse("2026-05-24T12:00:00Z"))
                .build();

        String etag = ViewerPageService.computeEtag(page);

        // SHA-256 hex = 64 chars, all [0-9a-f]
        assertThat(etag).hasSize(64).matches("[0-9a-f]+");
    }

    @Test
    void computeEtag_handlesNullHtml_andNullUpdatedAt() {
        // Legacy / mid-backfill pages may have nulls. ETag is still
        // computable so backfill + ETag-header round-trip works on the
        // very first read.
        ViewerPage allNulls = ViewerPage.builder().build();

        String etag = ViewerPageService.computeEtag(allNulls);

        assertThat(etag).hasSize(64);
    }

    @Test
    void computeEtag_rejectsNullPage() {
        assertThatThrownBy(() -> ViewerPageService.computeEtag(null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
