package com.remotefalcon.controlpanel.service;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ViewerPage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Single home for viewer-page sanitization, size validation, and the lazy
 * backfill that ensures every page has a stable {@code pageId} + {@code
 * updatedAt} once it has been read or written through the control panel.
 *
 * <p>Added 2026-05-24 as the foundation for the RF Page Builder integration
 * (PRD External Viewer Page API, Phase 1 PR-A). The same write path served
 * by {@link #prepareForWrite} is intended to be reused by the external
 * {@code /v1/pages} CRUD endpoints in PR-B — sanitization must not diverge
 * between internal (Monaco/GraphQL) and external (RFPB) write paths or the
 * security guarantee evaporates.
 *
 * <p>Two pre-existing security holes close with this service:
 * <ol>
 *   <li>Viewer-page HTML previously accepted {@code <script>}, {@code on*}
 *       event handlers, and {@code javascript:} URLs unchanged. Public viewer
 *       rendered them raw. Today only the show owner can write; once external
 *       writes ship in PR-B this becomes XSS-as-a-service. Closed here at the
 *       service layer so it applies to both write paths.
 *   <li>No size limit on the {@code html} field meant a buggy client (or a
 *       malicious one with PAT scope) could grow the Show document toward
 *       Mongo's 16 MB document limit. Capped at 1 MB per page here.
 * </ol>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ViewerPageService {

    /**
     * 1 MB cap on sanitized viewer-page HTML. Mongo's per-document limit is
     * 16 MB; with up to 5 pages per show plus the rest of the Show document
     * (sequences, preferences, stats arrays, etc.) we have to be conservative.
     * Generous enough that even heavily-stylized pages with inline base64
     * images fit; tight enough that pathological inputs bounce.
     */
    public static final int MAX_HTML_BYTES = 1_000_000;

    /**
     * jsoup Safelist used by {@link #sanitize}. Starts from {@link
     * Safelist#relaxed()} (basic formatting + tables + images) and adds the
     * elements/attributes show owners commonly use in viewer pages:
     *
     * <ul>
     *   <li>{@code <style>} for inline CSS blocks
     *   <li>{@code <link>} for external stylesheets (rel/href/type)
     *   <li>{@code <meta>} for viewport/charset
     *   <li>{@code class}, {@code id}, {@code style}, {@code data-*} on
     *       every element (jsoup's {@code addAttributes(":all", ...)})
     *   <li>{@code <video>}, {@code <audio>}, {@code <source>}, {@code <iframe>}
     *       — embedded media is common in fan pages
     * </ul>
     *
     * Explicitly stripped (relaxed already does this, called out for
     * reviewer clarity):
     * <ul>
     *   <li>{@code <script>}, {@code <noscript>}
     *   <li>All {@code on*} event-handler attributes
     *   <li>{@code javascript:} URLs in href/src
     * </ul>
     *
     * Note: {@code data:} URLs are restricted by jsoup's URL-protocol
     * checking. We allow them on {@code <img src>} only (relaxed's default).
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
            // Allow inline base64 images on <img src> — common pattern in
            // viewer pages for small logos/icons that don't warrant a CDN.
            // jsoup's relaxed() does NOT include data: by default.
            .addProtocols("img", "src", "data")
            // Viewer pages reference hosted assets via relative URLs
            // (/playlist, /now-playing). Without this jsoup strips them
            // because there's no base URI to resolve them against.
            .preserveRelativeLinks(true);

    /**
     * Strip dangerous markup from a viewer-page HTML body. See {@link
     * #SAFELIST} for the explicit allowlist. Always returns a non-null
     * string; treats {@code null} input as empty.
     *
     * <p>This is destructive — disallowed elements/attributes are dropped.
     * Callers needing pre-sanitization HTML for diff/preview purposes should
     * hold their own copy before invoking this.
     */
    public String sanitize(String html) {
        if (html == null || html.isEmpty()) {
            return "";
        }
        // jsoup's protocol check needs a base URI to resolve relative URLs
        // against before deciding whether to keep them. With an empty base,
        // a relative URL like "/playlist" has no protocol and gets stripped
        // even though preserveRelativeLinks=true is set on the Safelist.
        // Pass a sentinel base so the protocol check resolves to https
        // (whitelisted); preserveRelativeLinks then keeps the original
        // relative form in the output rather than the absolute version.
        return Jsoup.clean(html, "https://placeholder.invalid/", SAFELIST,
                new org.jsoup.nodes.Document.OutputSettings().prettyPrint(false));
    }

    /**
     * Throw {@link IllegalArgumentException} if {@code html} exceeds {@link
     * #MAX_HTML_BYTES} when encoded as UTF-8. Size is checked AFTER
     * sanitization in {@link #prepareForWrite} — pathological input that
     * shrinks under sanitization passes; pathological output that grows
     * (rare with sanitization, common with bad input) fails.
     */
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
     * Prepare a viewer page for persistence: sanitize the HTML, validate
     * size on the sanitized output, stamp {@code updatedAt}, and mint a
     * {@code pageId} if missing. Mutates the input {@link ViewerPage} in
     * place — callers wholesale-replacing a {@code List<ViewerPage>} should
     * invoke this on each element before saving.
     *
     * <p>{@code pageId} is preserved if the caller supplied one (the normal
     * case when the client read pages, edited locally, and is writing back).
     * Net-new pages with no {@code pageId} get a fresh {@link
     * UUID#randomUUID()} — these are pages being created for the first time
     * by the current request.
     */
    public void prepareForWrite(ViewerPage page) {
        if (page == null) {
            return;
        }
        String sanitized = this.sanitize(page.getHtml());
        this.validateSize(sanitized);
        page.setHtml(sanitized);
        page.setUpdatedAt(Instant.now());
        if (page.getPageId() == null) {
            page.setPageId(UUID.randomUUID());
        }
    }

    /**
     * Lazy backfill: ensure every page on {@code show} has a {@code pageId}
     * and {@code updatedAt}. Mints deterministically for backfill (so two
     * concurrent reads of the same legacy page converge to the same UUID
     * rather than racing each other into producing two different IDs); sets
     * missing {@code updatedAt} to {@link Instant#EPOCH} as the "before
     * versioning existed" sentinel.
     *
     * <p>Returns {@code true} if any page was modified — callers should
     * persist only on {@code true} to avoid unnecessary writes on every
     * read of an already-backfilled show.
     *
     * <p>Deterministic backfill UUIDs are computed as {@code
     * UUID.nameUUIDFromBytes(show.id + "/" + name + "/" + index)} so that
     * even pages with duplicate names (legacy data allows this) get
     * distinct IDs based on their list position.
     */
    public boolean normalizeAndBackfill(Show show) {
        if (show == null || show.getPages() == null || show.getPages().isEmpty()) {
            return false;
        }
        boolean modified = false;
        List<ViewerPage> pages = show.getPages();
        for (int i = 0; i < pages.size(); i++) {
            ViewerPage page = pages.get(i);
            if (page == null) {
                continue;
            }
            if (page.getPageId() == null) {
                page.setPageId(deterministicBackfillId(show.getId(), page.getName(), i));
                modified = true;
            }
            if (page.getUpdatedAt() == null) {
                page.setUpdatedAt(Instant.EPOCH);
                modified = true;
            }
        }
        return modified;
    }

    private static UUID deterministicBackfillId(String showId, String pageName, int index) {
        String seed = (showId == null ? "" : showId) + "/"
                + (pageName == null ? "" : pageName) + "/" + index;
        return UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8));
    }
}
