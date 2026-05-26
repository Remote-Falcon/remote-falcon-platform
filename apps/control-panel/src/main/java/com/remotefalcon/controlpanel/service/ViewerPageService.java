package com.remotefalcon.controlpanel.service;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ViewerPage;
import lombok.RequiredArgsConstructor;
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
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Single home for viewer-page sanitization, size validation, and the lazy
 * backfill that ensures every page has a stable {@code pageId} + {@code
 * updatedAt} once it has been read or written through the control panel.
 *
 * <p><b>Sanitize policy: denylist, not allowlist.</b> Show-owner HTML has
 * always been free-form — the publisher renders it with
 * {@code html-to-react} which only neutralizes {@code <script>} tags
 * inserted programmatically (HTML5 spec for DOM-inserted scripts). The
 * runtime DOES execute {@code on*} event handlers (html-to-react calls
 * {@code Function(value)} on them) and DOES follow {@code javascript:}
 * URLs on click, so the server-side scrubber's only job is to close
 * those gaps. Anything else — arbitrary tags, custom attributes, comments,
 * RFPB's curly-brace containers, inline {@code <svg>}, etc. — passes
 * through unchanged. See {@link #sanitize} for the full denylist.
 *
 * <p>External-api's {@link com.remotefalcon.library.models.ViewerPage}
 * write path mirrors this implementation byte-for-byte; both must produce
 * identical output for identical input or the ETag round-trip between
 * services breaks. The cross-service drift check lives in external-api's
 * {@code ViewerPageSanitizerAndEtagTest}.
 *
 * <p>1 MB size cap on the {@code html} field (Mongo doc limit is 16 MB;
 * with up to 5 pages plus the rest of the Show document we need headroom).
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
     * control characters stripped + lowercase.
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

    /**
     * Sanitize viewer-page HTML for storage. Strips:
     * <ul>
     *   <li>{@code <script>} except inert types ({@code application/json},
     *       {@code application/ld+json}, {@code text/plain}). The runtime
     *       blocks these too; this is defense-in-depth in case the
     *       renderer ever switches off html-to-react.
     *   <li>All {@code on*} event-handler attributes on every element.
     *   <li>{@code javascript:} and {@code vbscript:} URLs anywhere — href,
     *       src, formaction, animate's values=, you name it.
     *   <li>{@code data:} URLs except media types ({@code data:image/*},
     *       {@code data:audio/*}, {@code data:video/*}, {@code data:font/*}).
     *   <li>{@code <foreignObject>} inside {@code <svg>}.
     *   <li>{@code src} on inert-typed scripts.
     * </ul>
     * Returns a non-null string; treats {@code null} or empty input as empty.
     * Preserves structural shape: body fragment in → body fragment out;
     * full document in → full document out.
     */
    public String sanitize(String html) {
        if (html == null || html.isEmpty()) {
            return "";
        }
        // Body fragment in → body fragment out (Holtz-style templates have
        // no <html> wrapper — don't introduce one or the ETag changes
        // spuriously for every legacy page). Full document in → full
        // document out (head/title/style/meta survive; <doctype> survives).
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
     * Strips ALL ASCII whitespace + C0 control characters from anywhere
     * in the value, then lowercases.
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
            if (c == ' ' || c <= ' ') continue;
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

    /**
     * Compute the ETag for a viewer page: lowercase hex SHA-256 over
     * {@code html || "|" || updatedAt}. Used by:
     * <ul>
     *   <li>The launch JWT minted by {@code launchExternalEditor} — pins the
     *       editor session to a specific page version at launch time.
     *   <li>External-api's {@code GET /v1/pages/:id} ETag header (PR-B M4)
     *       and the {@code If-Match} check on {@code PUT /v1/pages/:id}
     *       (412 on mismatch).
     * </ul>
     *
     * <p>Null {@code html} treated as empty; null {@code updatedAt} treated
     * as {@link Instant#EPOCH} — matches the lazy-backfill defaults so an
     * ETag is computable even on legacy pages before they've been touched.
     *
     * <p>Caller is responsible for wrapping the returned hex in standard
     * ETag quoting (e.g. {@code "\"<hex>\""}) when shipping over HTTP.
     *
     * <p>Static + deterministic. Same input always produces same output —
     * that's the whole point of an ETag.
     */
    public static String computeEtag(ViewerPage page) {
        if (page == null) {
            throw new IllegalArgumentException("page must not be null");
        }
        String html = page.getHtml() == null ? "" : page.getHtml();
        Instant updatedAt = page.getUpdatedAt() == null ? Instant.EPOCH : page.getUpdatedAt();
        String input = html + "|" + updatedAt;
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException e) {
            // SHA-256 is a JDK standard algorithm; unreachable on any
            // conformant JVM. Wrap as runtime so callers don't carry a
            // pointless checked-exception declaration.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
