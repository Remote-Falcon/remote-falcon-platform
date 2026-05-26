package com.remotefalcon.external.api.service;

import com.remotefalcon.library.models.ViewerPage;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Attribute;
import org.jsoup.nodes.DataNode;
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
     * {@code data:} URL prefixes we allow on attribute values. Raster image
     * + media + font types only — these can't carry executable surfaces
     * when navigated to.
     *
     * <p>Explicitly NOT in this list: {@code data:image/svg+xml}. SVG
     * documents can carry inline {@code <script>}; navigating to a
     * {@code data:image/svg+xml} URL renders it as a top-level document
     * where those scripts execute. {@code <img src="data:image/svg+xml">}
     * doesn't execute scripts (browser image-render path is sandboxed),
     * but we apply the same denylist on every attribute (not just
     * {@code <img src>}) so we can't safely allow svg+xml here.
     */
    private static final List<String> SAFE_DATA_URL_PREFIXES = List.of(
            "data:image/png", "data:image/jpeg", "data:image/jpg",
            "data:image/gif", "data:image/webp", "data:image/avif",
            "data:image/bmp", "data:image/x-icon", "data:image/vnd.microsoft.icon",
            "data:audio/", "data:video/", "data:font/"
    );

    /**
     * Pre-decoded URL schemes the browser will execute. Matched against a
     * canonicalized form of every attribute value: ALL whitespace and ASCII
     * control characters stripped + lowercase + leading {@code unicode}
     * U+00A0 NBSP normalized.
     *
     * <p>Why canonicalize: per the WHATWG URL spec, browsers strip leading
     * whitespace and ASCII C0 controls from URLs before scheme detection.
     * {@code href="java\tscript:alert(1)"} (with a literal tab or HTML
     * entity {@code &#9;} that jsoup decodes) becomes {@code javascript:}
     * to the browser. A naive {@code .trim().toLowerCase().startsWith()}
     * misses this because {@link String#trim} only strips {@code <= U+0020}
     * at the boundary, not mid-string.
     */
    private static final List<String> DANGEROUS_URL_SCHEMES = List.of(
            "javascript:", "vbscript:", "livescript:", "mocha:"
    );

    /**
     * CSS exec patterns we strip from {@code <style>} text content and
     * {@code style=""} attribute values. Modern browsers ignore the legacy
     * ones, but defense-in-depth: we cap the surface RFPB users can stand
     * up against legacy / non-mainstream clients (FPP-embedded webviews,
     * older iOS Safari on locked-down show controllers, etc.).
     *
     * <ul>
     *   <li>{@code expression(...)} — legacy IE CSS function that evaluated
     *       JS. Dead in Chrome/Firefox/modern Edge.
     *   <li>{@code -moz-binding} — old Firefox XBL binding; can load
     *       executable JS from a CSS-declared XBL file.
     *   <li>{@code behavior:} — IE HTC files (executable script).
     *   <li>{@code url("javascript:...")} / {@code url(vbscript:...)} —
     *       caught in CSS url() functions in style attrs and blocks.
     *   <li>{@code @import url("javascript:...")} — same.
     * </ul>
     */
    private static final Pattern CSS_DANGEROUS = Pattern.compile(
            "(?i)" + // case-insensitive
            "expression\\s*\\(" +
            "|-moz-binding\\s*:" +
            "|behavior\\s*:" +
            "|url\\s*\\(\\s*[\"']?\\s*(?:javascript|vbscript|livescript|mocha)\\s*:" +
            "|@import\\s+(?:url\\s*\\(\\s*)?[\"']?\\s*(?:javascript|vbscript|livescript|mocha)\\s*:"
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
        stripIframeSrcdoc(doc);
        scrubStyleBlocks(doc);
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
     * Strip {@code srcdoc} attribute from every {@code <iframe>}. The
     * attribute ships a literal HTML document for the iframe to render in
     * a fresh browsing context; whatever's inside (including {@code <script>})
     * is parsed and executed natively by the browser. html-to-react's
     * "DOM-inserted scripts don't run" protection does NOT apply to a
     * native browser-parsed iframe document, so any {@code <script>} in
     * the srcdoc payload would execute.
     *
     * <p>RFPB / Holtz / template-repo viewer pages have no legitimate need
     * for {@code srcdoc}. Strip it wholesale rather than try to recursively
     * sanitize an opaque HTML string carried as an attribute value.
     */
    private static void stripIframeSrcdoc(Document doc) {
        for (Element iframe : doc.select("iframe[srcdoc]")) {
            iframe.removeAttr("srcdoc");
        }
    }

    /**
     * Scrub {@code <style>} block text content for the CSS exec patterns
     * matched by {@link #CSS_DANGEROUS}. Each match is replaced with a
     * comment marker so the rest of the stylesheet remains intact and
     * inspectable. {@code style=""} attribute values are handled in
     * {@link #stripDangerousAttributes}.
     */
    private static void scrubStyleBlocks(Document doc) {
        for (Element style : doc.select("style")) {
            for (DataNode node : new ArrayList<>(style.dataNodes())) {
                String css = node.getWholeData();
                String scrubbed = CSS_DANGEROUS.matcher(css).replaceAll("/* scrubbed */");
                if (!scrubbed.equals(css)) {
                    node.setWholeData(scrubbed);
                }
            }
        }
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
                    continue;
                }
                if (lowerKey.equals("style") && a.getValue() != null
                        && CSS_DANGEROUS.matcher(a.getValue()).find()) {
                    // Scrub CSS exec patterns out of the style attr value
                    // rather than dropping the whole attribute -- legitimate
                    // styling on the element should survive.
                    String scrubbed = CSS_DANGEROUS.matcher(a.getValue())
                            .replaceAll("/* scrubbed */");
                    el.attr(key, scrubbed);
                }
            }
            for (String key : toRemove) {
                el.removeAttr(key);
            }
        }
    }

    /**
     * Does this attribute value resolve to a browser-executed scheme?
     *
     * <p>Browsers strip leading whitespace + ASCII C0 controls (U+0000-
     * U+001F except space at U+0020) from URLs before scheme detection
     * per the WHATWG URL spec, and they tolerate the same characters
     * INSIDE the scheme name (so {@code java\tscript:} reads as
     * {@code javascript:}). We canonicalize the value the same way before
     * matching against the dangerous-scheme list.
     */
    private static boolean isDangerousValue(String raw) {
        if (raw == null) {
            return false;
        }
        String canonical = canonicalizeForSchemeCheck(raw);
        for (String scheme : DANGEROUS_URL_SCHEMES) {
            if (canonical.startsWith(scheme)) {
                return true;
            }
        }
        if (canonical.startsWith("data:")) {
            for (String safe : SAFE_DATA_URL_PREFIXES) {
                if (canonical.startsWith(safe)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Build the canonical form of a URL value used by {@link #isDangerousValue}.
     * Strips ALL ASCII whitespace + C0 control characters + U+00A0 NBSP
     * from anywhere in the value, then lowercases.
     *
     * <p>We strip from the entire value (not just the leading run) because
     * browsers tolerate control chars interleaved with the scheme letters.
     * The cost: a legitimate URL like {@code "https://example.com/path"}
     * has whitespace stripped (none to strip), and the value is preserved
     * unchanged in the attribute. We only call this for the comparison;
     * the original value still lands in the output if non-dangerous.
     */
    private static String canonicalizeForSchemeCheck(String raw) {
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == ' ' || c <= ' ') continue;
            sb.append(c);
        }
        return sb.toString().toLowerCase(Locale.ROOT);
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
