package com.remotefalcon.external.api.service;

import com.mongodb.client.result.UpdateResult;
import com.remotefalcon.external.api.dto.SessionContext;
import com.remotefalcon.external.api.dto.SessionContextHolder;
import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.external.api.response.PageResponse;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ViewerPage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * RFPB-facing read/write surface over {@link
 * com.remotefalcon.library.models.ViewerPage}. Backs the {@code /v1/pages*}
 * endpoints (PR-B M4).
 *
 * <p>The current session's bound show is read from {@link
 * SessionContextHolder} on every call — set by {@link
 * com.remotefalcon.external.api.aop.BearerAspect}, cleared in its finally
 * block. Calls outside an AOP-advised request path will throw NPE; that's
 * expected (this service is private to /v1/pages routes).
 *
 * <p>Cross-show pageId injection defense: every operation that takes a
 * {@code pageId} verifies the page actually belongs to the bearer's show.
 * A caller can't read or write a page they don't own. Mirrors the
 * launch-side validation in {@code LaunchExternalEditorService} (PR-B M2)
 * and the AuthUtil fix from issue-tracker#149.
 *
 * <p>Writes use Mongo's positional {@code arrayFilters} (Decision 5 in
 * the PRD's Phase 1 implementation notes) for atomic per-page updates
 * with DB-level If-Match enforcement. A {@code modifiedCount == 0}
 * result means either the page doesn't exist or the supplied ETag is
 * stale — distinguished by a follow-up read.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PageApiService {

    private final ShowRepository showRepository;
    private final MongoTemplate mongoTemplate;
    private final ViewerPageSanitizer sanitizer;

    /** List all pages on the current session's show. */
    public List<PageResponse> listPages() {
        Show show = currentShow();
        List<ViewerPage> pages = show.getPages() == null ? List.of() : show.getPages();
        return pages.stream()
                .filter(p -> p != null)
                .map(PageApiService::toResponse)
                .collect(Collectors.toList());
    }

    /**
     * Read one page by id. Throws {@link PageNotFoundException} if the
     * page isn't on the current session's show — same exception whether
     * the page truly doesn't exist or it exists on a different show,
     * because the caller never needs to distinguish.
     */
    public PageResponse getPage(UUID pageId) {
        return toResponse(requirePageOnCurrentShow(currentShow(), pageId));
    }

    /**
     * Update html / name / active on a page using atomic positional
     * arrayFilters with the supplied {@code ifMatchEtag} enforced at the
     * DB level.
     *
     * <ul>
     *   <li>Returns the updated {@link PageResponse} on success.
     *   <li>Throws {@link EtagMismatchException} if the page exists but
     *       its current ETag doesn't match {@code ifMatchEtag} — caller
     *       maps to HTTP 412 and includes the current page state in the
     *       response body so the client can present a conflict modal.
     *   <li>Throws {@link PageNotFoundException} if the page doesn't
     *       exist (or was deleted between the launch and this PUT).
     * </ul>
     *
     * <p>Sanitization (jsoup) and size validation (1 MB cap) run before
     * the Mongo write so a rejected page never touches disk.
     */
    public PageResponse updatePage(UUID pageId, String newName, Boolean newActive,
                                   String newHtml, String ifMatchEtag) {
        Show show = currentShow();
        ViewerPage existing = requirePageOnCurrentShow(show, pageId);

        // ETag check has to happen against the page we just read, not just
        // via the arrayFilter on updatedAt — the page might have been
        // overwritten between the read and the update, but the arrayFilter
        // on updatedAt-from-ifMatch already covers that case in the DB
        // write. The pre-check here gives us the 412 with a useful body
        // even before we touch Mongo.
        String currentEtag = ViewerPageEtag.compute(existing);
        if (!currentEtag.equals(ifMatchEtag)) {
            throw new EtagMismatchException(toResponse(existing));
        }

        // Stage the write on a transient ViewerPage so sanitization +
        // updatedAt-stamping happens in one place.
        ViewerPage staged = ViewerPage.builder()
                .pageId(pageId)
                .name(newName != null ? newName : existing.getName())
                .active(newActive != null ? newActive : existing.getActive())
                .html(newHtml != null ? newHtml : existing.getHtml())
                .build();
        sanitizer.prepareForWrite(staged); // sanitize + validate + stamp updatedAt

        // Atomic positional update keyed on (pageId, updatedAt-from-ETag-time).
        // The arrayFilter on updatedAt is the DB-level If-Match — if Monaco
        // saved this page between our read above and this write, the
        // arrayFilter won't match and modifiedCount will be 0.
        Query showQuery = Query.query(Criteria.where("showToken").is(show.getShowToken()));
        Update update = new Update()
                .set("pages.$[elem].name", staged.getName())
                .set("pages.$[elem].active", staged.getActive())
                .set("pages.$[elem].html", staged.getHtml())
                .set("pages.$[elem].updatedAt", staged.getUpdatedAt());
        // Single arrayFilter combining both conditions. Mongo requires each
        // arrayFilter's top-level identifier ("elem") to appear exactly once
        // across the filters list — splitting into two filterArray calls
        // each named "elem" trips MongoWriteException code 9 ("Found
        // multiple array filters with the same top-level field name elem").
        // Pass the UUID directly (NOT pageId.toString()) — Spring Data Mongo
        // serializes UUID fields as BSON Binary subtype 3 (UUID legacy), so a
        // String filter never matches the stored value and modifiedCount comes
        // back 0 → spurious 412 PRECONDITION_FAILED on every publish.
        update.filterArray(Criteria.where("elem.pageId").is(pageId)
                .and("elem.updatedAt").is(existing.getUpdatedAt()));

        UpdateResult result = mongoTemplate.updateFirst(showQuery, update, Show.class);

        if (result.getModifiedCount() == 0) {
            // Either the page was deleted, or the updatedAt arrayFilter
            // didn't match (concurrent write since our pre-check above).
            // Re-read to figure out which and throw the right exception.
            Show fresh = currentShow();
            Optional<ViewerPage> nowOnShow = fresh.getPages() == null
                    ? Optional.empty()
                    : fresh.getPages().stream()
                            .filter(p -> p != null && pageId.equals(p.getPageId()))
                            .findFirst();
            if (nowOnShow.isEmpty()) {
                throw new PageNotFoundException();
            }
            // Page exists but updatedAt changed since our pre-check ETag
            // matched — surface as conflict with the latest state.
            throw new EtagMismatchException(toResponse(nowOnShow.get()));
        }

        // Build the response from the staged page (now equal to what's in
        // Mongo). Re-read isn't necessary — the staged copy IS the new
        // server state, and avoiding the round-trip keeps the PUT fast.
        return toResponse(staged);
    }

    // ----- helpers -----

    private Show currentShow() {
        SessionContext ctx = SessionContextHolder.get();
        if (ctx == null || ctx.getShowToken() == null) {
            throw new IllegalStateException(
                    "No session context bound to current thread — called outside @RequiresBearer?");
        }
        return showRepository.findByShowToken(ctx.getShowToken())
                .orElseThrow(PageNotFoundException::new);
    }

    private static ViewerPage requirePageOnCurrentShow(Show show, UUID pageId) {
        if (show.getPages() == null) {
            throw new PageNotFoundException();
        }
        return show.getPages().stream()
                .filter(p -> p != null && pageId.equals(p.getPageId()))
                .findFirst()
                .orElseThrow(PageNotFoundException::new);
    }

    private static PageResponse toResponse(ViewerPage page) {
        return PageResponse.builder()
                .pageId(page.getPageId() == null ? null : page.getPageId().toString())
                .name(page.getName())
                .active(page.getActive())
                .html(page.getHtml())
                .updatedAt(page.getUpdatedAt() == null ? Instant.EPOCH : page.getUpdatedAt())
                .etag(ViewerPageEtag.compute(page))
                .build();
    }

    /** 404. Page doesn't exist on the bearer's show. */
    public static class PageNotFoundException extends RuntimeException {
    }

    /**
     * 412 Precondition Failed. The supplied If-Match ETag doesn't match
     * the current server state. Carries the current PageResponse so the
     * caller can present a conflict modal (overwrite / discard / diff).
     */
    public static class EtagMismatchException extends RuntimeException {
        private final PageResponse currentServerState;

        public EtagMismatchException(PageResponse currentServerState) {
            this.currentServerState = currentServerState;
        }

        public PageResponse getCurrentServerState() {
            return currentServerState;
        }
    }
}
