package com.remotefalcon.controlpanel.service;

import com.remotefalcon.auth.LaunchTokenPayload;
import com.remotefalcon.auth.LaunchTokenSigner;
import com.remotefalcon.auth.LaunchTokenVerifier;
import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.ViewerPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link LaunchExternalEditorService}. Covers happy path,
 * the cross-show pageId injection defense, and graceful handling of
 * unknown / malformed input.
 *
 * <p>Uses a real {@link LaunchTokenSigner} (cheap, deterministic) so the
 * returned URL's token claim can be verified end-to-end. Repository +
 * AuthUtil are mocked.
 */
@ExtendWith(MockitoExtension.class)
class LaunchExternalEditorServiceTest {

    private static final String SECRET = "test-launch-secret-32-chars-or-more!"; // 36 chars
    private static final String SHOW_TOKEN = "show-token-abc";
    private static final String SHOW_ID = "show-id-1";
    private static final String SHOW_SUBDOMAIN = "myxmas";
    private static final UUID PAGE_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    @Mock private ShowRepository showRepository;
    @Mock private AuthUtil authUtil;

    @InjectMocks private LaunchExternalEditorService service;

    private final LaunchTokenSigner realSigner = new LaunchTokenSigner(SECRET);
    private final LaunchTokenVerifier verifier = new LaunchTokenVerifier(SECRET);

    @BeforeEach
    void wireRealSigner() {
        // @InjectMocks fills the constructor with mocks; we want a real
        // signer (not a Mockito stub) so the returned URL's token is
        // actually verifiable end-to-end.
        ReflectionTestUtils.setField(service, "launchTokenSigner", realSigner);
        ReflectionTestUtils.setField(service, "ttlSeconds", 300L);
        ReflectionTestUtils.setField(service, "pageBuilderUrl", "https://rfpagebuilder.com");
    }

    private Show showWithPages(List<ViewerPage> pages) {
        return Show.builder()
                .id(SHOW_ID)
                .showToken(SHOW_TOKEN)
                .showSubdomain(SHOW_SUBDOMAIN)
                .pages(new ArrayList<>(pages))
                .build();
    }

    private ViewerPage page(UUID id, String name, String html) {
        return ViewerPage.builder()
                .pageId(id)
                .name(name)
                .active(true)
                .html(html)
                .updatedAt(Instant.parse("2026-05-24T12:00:00Z"))
                .build();
    }

    private void stubAuth() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
    }

    // -------- happy path ----------

    @Test
    void mintLaunchUrl_returnsValidUrl_withVerifiableToken() {
        stubAuth();
        ViewerPage onlyPage = page(PAGE_ID, "home", "<p>hello</p>");
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(onlyPage))));

        String url = service.mintLaunchUrl(PAGE_ID.toString());

        assertThat(url).startsWith("https://rfpagebuilder.com/launch?token=");

        // Extract the token query param and round-trip through the verifier
        String token = URI.create(url).getQuery().substring("token=".length());
        LaunchTokenPayload decoded = verifier.verify(token);

        assertThat(decoded.getIss()).isEqualTo("remotefalcon");
        assertThat(decoded.getAud()).isEqualTo("rfpagebuilder");
        assertThat(decoded.getSub()).isEqualTo(SHOW_ID);
        assertThat(decoded.getShowSubdomain()).isEqualTo(SHOW_SUBDOMAIN);
        assertThat(decoded.getShowToken()).isEqualTo(SHOW_TOKEN);
        assertThat(decoded.getPageId()).isEqualTo(PAGE_ID);
        assertThat(decoded.getScopes()).containsExactlyInAnyOrder(
                "viewer_page:read", "viewer_page:write");
        assertThat(decoded.getEtag()).isNotBlank();
        assertThat(decoded.getJti()).isNotBlank();
        // exp is 300s after iat by default
        assertThat(decoded.getExp().getEpochSecond() - decoded.getIat().getEpochSecond())
                .isEqualTo(300L);
    }

    @Test
    void mintLaunchUrl_etagMatchesViewerPageServiceComputation() {
        stubAuth();
        ViewerPage onlyPage = page(PAGE_ID, "home", "<p>hello</p>");
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(onlyPage))));

        String url = service.mintLaunchUrl(PAGE_ID.toString());
        String token = URI.create(url).getQuery().substring("token=".length());
        String tokenEtag = verifier.verify(token).getEtag();

        // Whoever has the same page should compute the same ETag.
        assertThat(tokenEtag).isEqualTo(ViewerPageService.computeEtag(onlyPage));
    }

    @Test
    void mintLaunchUrl_consecutiveCallsProduceDistinctJtis() {
        stubAuth();
        ViewerPage onlyPage = page(PAGE_ID, "home", "<p>hello</p>");
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(onlyPage))));

        String url1 = service.mintLaunchUrl(PAGE_ID.toString());
        String url2 = service.mintLaunchUrl(PAGE_ID.toString());
        String token1 = URI.create(url1).getQuery().substring("token=".length());
        String token2 = URI.create(url2).getQuery().substring("token=".length());

        assertThat(verifier.verify(token1).getJti())
                .isNotEqualTo(verifier.verify(token2).getJti());
    }

    // -------- failure modes (security + UX) ----------

    @Test
    void mintLaunchUrl_throwsShowNotFound_whenRepoEmpty() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.mintLaunchUrl(PAGE_ID.toString()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void mintLaunchUrl_throwsPageNotFound_whenPageIdDoesNotMatchAnyPage() {
        // Cross-show injection defense: the caller's auth resolves to a show
        // that doesn't own this pageId. Must refuse — minting would let the
        // caller edit somebody else's page.
        stubAuth();
        UUID otherShowsPageId = UUID.fromString("99999999-9999-9999-9999-999999999999");
        ViewerPage onlyMine = page(PAGE_ID, "home", "<p>x</p>");
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(onlyMine))));

        assertThatThrownBy(() -> service.mintLaunchUrl(otherShowsPageId.toString()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.PAGE_NOT_FOUND.name());
    }

    @Test
    void mintLaunchUrl_throwsPageNotFound_whenShowHasNoPages() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of())));

        assertThatThrownBy(() -> service.mintLaunchUrl(PAGE_ID.toString()))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.PAGE_NOT_FOUND.name());
    }

    @Test
    void mintLaunchUrl_throwsPageNotFound_whenPageIdIsMalformedUuid() {
        // No DB lookup attempted — malformed input is caller error,
        // surface as PAGE_NOT_FOUND not 500.
        assertThatThrownBy(() -> service.mintLaunchUrl("not-a-uuid"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.PAGE_NOT_FOUND.name());
    }

    @Test
    void mintLaunchUrl_pickCorrectPage_whenShowHasMultiplePages() {
        stubAuth();
        UUID otherId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        ViewerPage pageOne = page(PAGE_ID, "home", "<p>home</p>");
        ViewerPage pageTwo = page(otherId, "about", "<p>about</p>");
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(showWithPages(List.of(pageOne, pageTwo))));

        String url = service.mintLaunchUrl(otherId.toString());
        String token = URI.create(url).getQuery().substring("token=".length());
        LaunchTokenPayload decoded = verifier.verify(token);

        assertThat(decoded.getPageId()).isEqualTo(otherId);
        // ETag must be from the SECOND page, not the first
        assertThat(decoded.getEtag()).isEqualTo(ViewerPageService.computeEtag(pageTwo));
    }
}
