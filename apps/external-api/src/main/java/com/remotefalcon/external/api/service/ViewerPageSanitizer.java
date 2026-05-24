package com.remotefalcon.external.api.service;

import com.remotefalcon.library.models.ViewerPage;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

/**
 * jsoup-backed HTML sanitization + 1 MB size cap for viewer-page writes
 * from external API clients (PR-B M4). Mirrors control-panel's
 * {@code ViewerPageService} sanitize/validate surface — duplicated rather
 * than extracted to libs/ for v1 (single point of integration consumer);
 * consolidate if a third writer appears.
 *
 * <p>Drift risk: the {@link #SAFELIST} here must match control-panel's
 * configuration byte-for-byte, or pages written via the external API
 * will look different from pages written via Monaco. Round-trip tests
 * in both services cover the same input/output pairs to catch drift.
 *
 * <p>Doesn't include the {@code normalizeAndBackfill} method — external-
 * api never reads pages outside of a CRUD operation that already has a
 * specific {@code pageId} to operate on, so the lazy backfill is solely
 * control-panel's job (runs on getShow there).
 */
@Service
@Slf4j
public class ViewerPageSanitizer {

    public static final int MAX_HTML_BYTES = 1_000_000;

    /**
     * MUST match control-panel's {@code ViewerPageService.SAFELIST}
     * configuration. See that file for the rationale per attribute.
     */
    private static final Safelist SAFELIST = Safelist.relaxed()
            .addTags("style", "link", "meta", "video", "audio", "source", "iframe")
            .addAttributes(":all", "class", "id", "style")
            .addAttributes("style", "type")
            .addAttributes("link", "rel", "href", "type", "media")
            .addAttributes("meta", "name", "content", "charset", "http-equiv")
            .addAttributes("video", "src", "controls", "autoplay", "loop", "muted",
                    "poster", "width", "height", "preload", "playsinline")
            .addAttributes("audio", "src", "controls", "autoplay", "loop", "muted",
                    "preload")
            .addAttributes("source", "src", "type", "srcset", "media")
            .addAttributes("iframe", "src", "width", "height", "frameborder",
                    "allow", "allowfullscreen", "loading")
            .addProtocols("link", "href", "http", "https")
            .addProtocols("iframe", "src", "http", "https")
            .addProtocols("video", "src", "http", "https")
            .addProtocols("audio", "src", "http", "https")
            .addProtocols("source", "src", "http", "https")
            .addProtocols("img", "src", "data")
            .preserveRelativeLinks(true);

    public String sanitize(String html) {
        if (html == null || html.isEmpty()) {
            return "";
        }
        return Jsoup.clean(html, "https://placeholder.invalid/", SAFELIST,
                new org.jsoup.nodes.Document.OutputSettings().prettyPrint(false));
    }

    public void validateSize(String html) {
        if (html == null) {
            return;
        }
        int byteLength = html.getBytes(StandardCharsets.UTF_8).length;
        if (byteLength > MAX_HTML_BYTES) {
            throw new IllegalArgumentException(
                    "Viewer page HTML is " + byteLength + " bytes, exceeds the "
                            + MAX_HTML_BYTES + "-byte limit per page.");
        }
    }

    /**
     * Sanitize html, validate size, stamp updatedAt to now. Mutates the
     * input ViewerPage in place. Used by external CRUD endpoints before
     * persisting; doesn't touch {@code pageId} (caller's responsibility
     * to ensure that's set or null appropriately for create vs update).
     */
    public void prepareForWrite(ViewerPage page) {
        if (page == null) {
            return;
        }
        String sanitized = this.sanitize(page.getHtml());
        this.validateSize(sanitized);
        page.setHtml(sanitized);
        page.setUpdatedAt(Instant.now());
    }
}
