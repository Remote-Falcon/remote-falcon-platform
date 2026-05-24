package com.remotefalcon.controlpanel.service;

import com.remotefalcon.auth.LaunchTokenPayload;
import com.remotefalcon.auth.LaunchTokenSigner;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.ViewerPage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Mints launch URLs that hand a Remote Falcon show owner off to the RF
 * Page Builder visual editor for a specific viewer page.
 *
 * <p>Called by {@link GraphQLMutationService#launchExternalEditor(String)};
 * the UI's "Edit in RF Page Builder ↗" button consumes the returned URL
 * via {@code window.location.assign}. The destination URL embeds a
 * short-lived ({@code rfpb.launch.ttl-seconds}, default 300) HS256 launch
 * JWT in a {@code ?token=...} query parameter; RFPB's {@code /launch}
 * route validates and immediately back-channel-exchanges it for a session
 * bearer via external-api's {@code POST /v1/sessions/exchange} (PR-B M3).
 *
 * <p>Security:
 * <ul>
 *   <li>Caller is authenticated already (the GraphQL mutation is gated by
 *       {@code @RequiresAccess}). This service trusts the {@link AuthUtil}
 *       to have resolved the current show.
 *   <li>{@code pageId} is validated against the current show's page list —
 *       a caller can't mint a token for a page they don't own. This is the
 *       cross-show injection defense that mirrors the AuthUtil work in
 *       remote-falcon-issue-tracker#149.
 *   <li>The token's {@code etag} claim pins the editor session to the
 *       current page version. Mid-session Monaco saves surface as a 412
 *       Precondition Failed on RFPB's first PUT.
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class LaunchExternalEditorService {

    private static final List<String> DEFAULT_SCOPES =
            List.of("viewer_page:read", "viewer_page:write");

    private final ShowRepository showRepository;
    private final AuthUtil authUtil;
    private final LaunchTokenSigner launchTokenSigner;

    @Value("${rfpb.launch.ttl-seconds:300}")
    private long ttlSeconds;

    @Value("${rfpb.page-builder-url:https://rfpagebuilder.com}")
    private String pageBuilderUrl;

    /**
     * Mint a launch URL for the given page on the current authenticated
     * show. Returns a full {@code https://<page-builder-url>/launch?token=
     * <jwt>} string suitable for {@code window.location.assign}.
     *
     * <p>Throws {@link RuntimeException} with the matching
     * {@link StatusResponse} name on:
     * <ul>
     *   <li>{@link StatusResponse#SHOW_NOT_FOUND} — the resolved showToken
     *       has no Show in Mongo (shouldn't happen if auth passed, but
     *       defensive).
     *   <li>{@link StatusResponse#PAGE_NOT_FOUND} — the supplied pageId
     *       doesn't match any page on the current show.
     * </ul>
     */
    public String mintLaunchUrl(String pageIdString) {
        UUID pageId;
        try {
            pageId = UUID.fromString(pageIdString);
        } catch (IllegalArgumentException e) {
            // Malformed UUID — same surface as a not-found pageId from
            // the caller's perspective. Don't 500.
            throw new RuntimeException(StatusResponse.PAGE_NOT_FOUND.name());
        }

        String showToken = authUtil.getTokenDTO().getShowToken();
        Optional<Show> maybeShow = this.showRepository.findByShowToken(showToken);
        if (maybeShow.isEmpty()) {
            throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
        }
        Show show = maybeShow.get();

        List<ViewerPage> pages = show.getPages();
        ViewerPage page = pages == null
                ? null
                : pages.stream()
                        .filter(Objects::nonNull)
                        .filter(p -> pageId.equals(p.getPageId()))
                        .findFirst()
                        .orElse(null);
        if (page == null) {
            throw new RuntimeException(StatusResponse.PAGE_NOT_FOUND.name());
        }

        Instant now = Instant.now();
        LaunchTokenPayload payload = LaunchTokenPayload.builder()
                .iss("remotefalcon")
                .aud("rfpagebuilder")
                .sub(show.getId())
                .showSubdomain(show.getShowSubdomain())
                .showToken(show.getShowToken())
                .pageId(pageId)
                .etag(ViewerPageService.computeEtag(page))
                .scopes(DEFAULT_SCOPES)
                .iat(now)
                .exp(now.plusSeconds(ttlSeconds))
                .jti(UUID.randomUUID().toString())
                .build();

        String jwt = launchTokenSigner.sign(payload);

        return UriComponentsBuilder.fromHttpUrl(pageBuilderUrl)
                .path("/launch")
                .queryParam("token", jwt)
                .build()
                .toUriString();
    }
}
