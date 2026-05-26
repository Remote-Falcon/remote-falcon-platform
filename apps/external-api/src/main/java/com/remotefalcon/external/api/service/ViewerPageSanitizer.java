package com.remotefalcon.external.api.service;

import com.remotefalcon.library.models.ViewerPage;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Attribute;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * jsoup-backed HTML sanitization + 1 MB size cap for viewer-page writes
 * from external API clients. Mirrors control-panel's
 * {@link com.remotefalcon.library.models.ViewerPage} write path —
 * duplicated rather than extracted to libs/ for v1 (single point of
 * integration consumer); consolidate if a third writer appears.
 *
 * <p><b>Policy: denylist, not allowlist.</b> Show-owner HTML has always
 * been free-form — the publisher renders it with {@code html-to-react}
 * which only neutralizes {@code <script>} tags inserted programmatically
 * (HTML5 spec for DOM-inserted scripts). The runtime DOES execute
 * {@code on*} event handlers (html-to-react calls {@code Function(value)}
 * on them) and DOES follow {@code javascript:} URLs on click, so the
 * server-side scrubber's only job is to close those gaps. Anything else
 * — arbitrary tags, custom attributes, comments, RFPB's curly-brace
 * containers, inline {@code <svg>}, etc. — passes through unchanged.
 *
 * <p>What gets stripped:
 * <ul>
 *   <li>{@code <script>} except inert types ({@code application/json},
 *       {@code application/ld+json}, {@code text/plain}). The runtime
 *       blocks these too; this is defense-in-depth in case the renderer
 *       ever switches off html-to-react.
 *   <li>All {@code on*} event-handler attributes on every element.
 *   <li>{@code javascript:} and {@code vbscript:} URLs anywhere — href,
 *       src, formaction, animate's values=, you name it.
 *   <li>{@code data:} URLs except media types ({@code data:image/*},
 *       {@code data:audio/*}, {@code data:video/*}, {@code data:font/*}).
 *       {@code data:text/html} can navigate to an executable document.
 *   <li>{@code <foreignObject>} inside {@code <svg>} — jailbreaks SVG
 *       into arbitrary HTML and host child elements that bypass scrubbing.
 *   <li>{@code src} on inert-typed scripts (browsers fetch it even when
 *       the script body won't execute — tracking/exfil vector).
 * </ul>
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

    private static final String BASE_URI = "https://placeholder.invalid/";

    /**
     * Script {@code type} values whose content is inert (the browser never
     * executes them). RFPB embeds page metadata as
     * {@code <script type="application/json" id="rfpb-data">…</script>};
     * Next.js and JSON-LD use the same pattern.
     *
     * <p>Anything else — empty type, {@code text/javascript},
     * {@code module}, {@code importmap} — is treated as executable and
     * stripped. {@code <script>} without a {@code type} attribute is also
     * stripped (defaults to {@code text/javascript} per HTML5).
     */
    private static final Set<String> INERT_SCRIPT_TYPES = Set.of(
            "application/json", "application/ld+json", "text/plain"
    );

    /**
     * {@code data:} URL prefixes we allow on attribute values. Media types
     * only — image/audio/video/font are legitimate embed targets and don't
     * carry executable surfaces. {@code data:text/html},
     * {@code data:application/xhtml+xml}, etc. can be navigated to and
     * become a top-level document with full XSS reach, so they're stripped.
     */
    private static final List<String> SAFE_DATA_URL_PREFIXES = List.of(
            "data:image/", "data:audio/", "data:video/", "data:font/"
    );

    private static final Pattern HTML_OPEN_TAG_RE =
            Pattern.compile("<html\\b", Pattern.CASE_INSENSITIVE);

    public String sanitize(String html) {
        if (html == null || html.isEmpty()) {
            return "";
        }
        // Preserve the input's structural shape:
        //   - body fragment in → body fragment out (Holtz-style templates
        //     have no <html> wrapper; we must not introduce one or the
        //     ETag changes spuriously for every legacy page).
        //   - full document in → full document out (head/title/style/meta
        //     inside <head> survive; <doctype> survives).
        boolean isFullDoc = looksLikeFullDocument(html);
        Document doc = isFullDoc
                ? Jsoup.parse(html, BASE_URI)
                : Jsoup.parseBodyFragment(html, BASE_URI);
        doc.outputSettings().prettyPrint(false);

        stripExecutableScripts(doc);
        stripSvgForeignObject(doc);
        stripDangerousAttributes(doc);

        return isFullDoc ? doc.outerHtml() : doc.body().html();
    }

    /**
     * Remove {@code <script>} tags whose {@code type} isn't an inert MIME.
     * Surviving inert scripts get their {@code src} attribute stripped too
     * — browsers fetch it even when the script body won't execute, making
     * it usable as a tracking ping or exfil vector.
     */
    private static void stripExecutableScripts(Document doc) {
        for (Element script : new ArrayList<>(doc.select("script"))) {
            String type = script.attr("type").trim().toLowerCase(Locale.ROOT);
            if (!INERT_SCRIPT_TYPES.contains(type)) {
                script.remove();
            } else {
                script.removeAttr("src");
            }
        }
    }

    /**
     * Remove {@code <foreignObject>} children from any {@code <svg>}. They
     * carry arbitrary HTML (forms, iframes, etc.) into the SVG render tree
     * and complicate the on* / javascript: scrubbing rules below.
     */
    private static void stripSvgForeignObject(Document doc) {
        // jsoup's CSS selectors are case-insensitive — matches both
        // <foreignObject> and <foreignobject>.
        doc.select("svg foreignObject").remove();
    }

    /**
     * Walk every element and strip the two attribute classes that lead to
     * JavaScript execution at render time:
     * <ol>
     *   <li>{@code on*} event handlers — {@code html-to-react} converts
     *       these into {@code Function(value)} bindings, executing on the
     *       triggering event.
     *   <li>Attribute values starting with {@code javascript:}/{@code vbscript:},
     *       or {@code data:} non-media — the browser executes/navigates
     *       these on click or programmatic activation.
     * </ol>
     * The rule applies to ANY attribute name, not just URL-bearing ones —
     * this catches the SVG {@code animate values="javascript:…"} family
     * of attacks without needing an explicit allowlist of URL-attr names.
     */
    private static void stripDangerousAttributes(Document doc) {
        for (Element el : doc.getAllElements()) {
            List<String> toRemove = new ArrayList<>();
            for (Attribute a : el.attributes()) {
                String key = a.getKey();
                String lowerKey = key.toLowerCase(Locale.ROOT);
                if (lowerKey.startsWith("on")) {
                    toRemove.add(key);
                    continue;
                }
                if (isDangerousValue(a.getValue())) {
                    toRemove.add(key);
                }
            }
            for (String key : toRemove) {
                el.removeAttr(key);
            }
        }
    }

    private static boolean isDangerousValue(String raw) {
        if (raw == null) {
            return false;
        }
        String lower = raw.trim().toLowerCase(Locale.ROOT);
        if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) {
            return true;
        }
        if (lower.startsWith("data:")) {
            for (String safe : SAFE_DATA_URL_PREFIXES) {
                if (lower.startsWith(safe)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Heuristic: does the input look like a full HTML document the user
     * wants preserved end-to-end, vs a body-fragment template like the
     * Holtz template? Returns true if a {@code <html} tag is anywhere in
     * the source. Cheap; jsoup's actual parse handles the precise edge
     * cases (case folding, attribute syntax, etc.).
     */
    private static boolean looksLikeFullDocument(String html) {
        return HTML_OPEN_TAG_RE.matcher(html).find();
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
