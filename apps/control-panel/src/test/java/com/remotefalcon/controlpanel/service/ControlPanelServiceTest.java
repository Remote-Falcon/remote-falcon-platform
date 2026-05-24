package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.model.GitHubLabel;
import com.remotefalcon.controlpanel.model.S3Image;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.GitHubIssueResponse;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.S3Util;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ControlPanelService}. Covers:
 *  - {@code gitHubIssues}: rewrites the per-issue {@code type} based on the
 *    presence of a "bug" label;
 *  - {@code getJwt}: REST sibling of the GraphQL signIn — same bcrypt /
 *    email-verified contract, returns a 200 with the JWT;
 *  - {@code uploadImage} / {@code downloadImage} / {@code deleteImage} /
 *    {@code getImages}: delegate to {@link S3Util} after looking up the show.
 */
@ExtendWith(MockitoExtension.class)
class ControlPanelServiceTest {

    private static final String SHOW_TOKEN = "tok-cp";
    private static final String SHOW_SUBDOMAIN = "subdomain";

    @Mock private RestTemplate gitHubRestTemplate;
    @Mock private AuthUtil authUtil;
    @Mock private ShowRepository showRepository;
    @Mock private S3Util s3Util;

    @InjectMocks private ControlPanelService service;

    private void stubAuth() {
        when(authUtil.getTokenDTO()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
    }

    private static Show showWithSubdomain() {
        return Show.builder().showToken(SHOW_TOKEN).showSubdomain(SHOW_SUBDOMAIN).build();
    }

    // ---- gitHubIssues ----

    @Test
    void gitHubIssues_setsTypeBug_whenLabelsIncludeBug() {
        GitHubIssueResponse issue = GitHubIssueResponse.builder()
                .labels(new ArrayList<>(List.of(
                        GitHubLabel.builder().name("Bug").build(),
                        GitHubLabel.builder().name("backend").build())))
                .build();
        when(gitHubRestTemplate.exchange(anyString(), eq(HttpMethod.GET), any(),
                any(ParameterizedTypeReference.class)))
                .thenReturn(ResponseEntity.ok(List.of(issue)));

        ResponseEntity<List<GitHubIssueResponse>> r = service.gitHubIssues();
        assertThat(r.getBody()).hasSize(1);
        assertThat(r.getBody().get(0).getType()).isEqualTo("bug");
    }

    @Test
    void gitHubIssues_setsTypeEnhancement_whenNoBugLabel() {
        GitHubIssueResponse issue = GitHubIssueResponse.builder()
                .labels(new ArrayList<>(List.of(GitHubLabel.builder().name("feature").build())))
                .build();
        when(gitHubRestTemplate.exchange(anyString(), eq(HttpMethod.GET), any(),
                any(ParameterizedTypeReference.class)))
                .thenReturn(ResponseEntity.ok(List.of(issue)));

        ResponseEntity<List<GitHubIssueResponse>> r = service.gitHubIssues();
        assertThat(r.getBody().get(0).getType()).isEqualTo("enhancement");
    }

    @Test
    void gitHubIssues_returnsOkWithNullBody_whenUpstreamReturnsNoBody() {
        when(gitHubRestTemplate.exchange(anyString(), eq(HttpMethod.GET), any(),
                any(ParameterizedTypeReference.class)))
                .thenReturn(ResponseEntity.ok(null));

        ResponseEntity<List<GitHubIssueResponse>> r = service.gitHubIssues();
        assertThat(r.getStatusCodeValue()).isEqualTo(200);
        assertThat(r.getBody()).isNull();
    }

    // ---- getJwt ----

    private static String basicHeader(String email, String pw) {
        return "Basic " + Base64.getEncoder().encodeToString((email + ":" + pw).getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void getJwt_returnsToken_onCorrectPasswordAndVerifiedEmail() {
        String hashed = new BCryptPasswordEncoder().encode("pw");
        Show show = Show.builder().showToken(SHOW_TOKEN).password(hashed)
                .emailVerified(true).email("u@x.com").build();

        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"u@x.com", "pw"});
        when(showRepository.findByEmailCollation("u@x.com")).thenReturn(Optional.of(show));
        when(authUtil.signJwt(show)).thenReturn("fake-jwt");

        ResponseEntity<String> r = service.getJwt();
        assertThat(r.getStatusCodeValue()).isEqualTo(200);
        assertThat(r.getBody()).isEqualTo("fake-jwt");
    }

    @Test
    void getJwt_throwsEmailNotVerified_whenPasswordOkButNotVerified() {
        String hashed = new BCryptPasswordEncoder().encode("pw");
        Show show = Show.builder().showToken(SHOW_TOKEN).password(hashed).emailVerified(false).build();
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"u@x.com", "pw"});
        when(showRepository.findByEmailCollation("u@x.com")).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.getJwt())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.EMAIL_NOT_VERIFIED.name());
    }

    @Test
    void getJwt_throwsShowNotFound_whenEmailMissing() {
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"x@x.com", "pw"});
        when(showRepository.findByEmailCollation("x@x.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getJwt())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void getJwt_throwsUnauthorized_whenPasswordMismatch() {
        String hashed = new BCryptPasswordEncoder().encode("real");
        Show show = Show.builder().showToken(SHOW_TOKEN).password(hashed).emailVerified(true).build();
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(new String[]{"u@x.com", "wrong"});
        when(showRepository.findByEmailCollation("u@x.com")).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.getJwt())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    @Test
    void getJwt_throwsUnauthorized_whenNoBasicAuth() {
        HttpServletRequest req = org.mockito.Mockito.mock(HttpServletRequest.class);
        when(authUtil.getCurrentRequest()).thenReturn(req);
        when(authUtil.getBasicAuthCredentials(req)).thenReturn(null);
        assertThatThrownBy(() -> service.getJwt())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.UNAUTHORIZED.name());
    }

    // ---- uploadImage ----

    @Test
    void uploadImage_delegatesToS3Util_onValidImage() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(showWithSubdomain()));
        MultipartFile file = new MockMultipartFile("file", "hero.png", "image/png", new byte[]{1});
        when(s3Util.uploadFile(file, SHOW_SUBDOMAIN)).thenReturn(ResponseEntity.ok("hero.png"));

        ResponseEntity<String> r = service.uploadImage(file);
        assertThat(r.getStatusCodeValue()).isEqualTo(200);
        assertThat(r.getBody()).isEqualTo("hero.png");
    }

    @Test
    void uploadImage_returns400_whenFileIsNotAnImage() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(showWithSubdomain()));
        MultipartFile file = new MockMultipartFile("file", "doc.pdf", "application/pdf", new byte[]{1});

        ResponseEntity<String> r = service.uploadImage(file);
        assertThat(r.getStatusCodeValue()).isEqualTo(400);
        assertThat(r.getBody()).isEqualTo("File must be an image");
        verify(s3Util, never()).uploadFile(any(MultipartFile.class), anyString());
    }

    @Test
    void uploadImage_throwsShowNotFound_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        MultipartFile file = new MockMultipartFile("file", "x.png", "image/png", new byte[]{1});

        assertThatThrownBy(() -> service.uploadImage(file))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- downloadImage / deleteImage / getImages ----

    @Test
    void downloadImage_delegatesToS3Util() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(showWithSubdomain()));
        when(s3Util.downloadFile("hero.png", SHOW_SUBDOMAIN)).thenReturn(true);

        ResponseEntity<Boolean> r = service.downloadImage("hero.png");
        assertThat(r.getStatusCodeValue()).isEqualTo(200);
        assertThat(r.getBody()).isTrue();
    }

    @Test
    void downloadImage_throwsShowNotFound_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.downloadImage("x.png"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void deleteImage_delegatesToS3Util_andEchoesImage() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(showWithSubdomain()));
        ResponseEntity<String> r = service.deleteImage("hero.png");
        verify(s3Util).deleteFile("hero.png", SHOW_SUBDOMAIN);
        assertThat(r.getBody()).isEqualTo("hero.png");
    }

    @Test
    void deleteImage_throwsShowNotFound_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.deleteImage("x.png"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    @Test
    void getImages_delegatesToS3Util() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(showWithSubdomain()));
        List<S3Image> images = List.of(S3Image.builder().name("a.png").path("p").build());
        when(s3Util.getImages(SHOW_SUBDOMAIN)).thenReturn(images);

        ResponseEntity<List<S3Image>> r = service.getImages();
        assertThat(r.getBody()).isEqualTo(images);
    }

    @Test
    void getImages_throwsShowNotFound_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getImages())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }
}
