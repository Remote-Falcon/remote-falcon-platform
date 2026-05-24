package com.remotefalcon.external.api.service;

import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.external.api.request.RequestVoteRequest;
import com.remotefalcon.external.api.response.RequestVoteResponse;
import com.remotefalcon.external.api.response.ShowResponse;
import com.remotefalcon.external.api.util.AuthUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.Preference;
import org.dozer.DozerBeanMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ExternalApiService}.
 *
 * <p>Covers all three service methods on both the {@code authUtil.showToken
 * == null} path and the show-not-found path. Uses a real {@link
 * DozerBeanMapper} (cheap to construct) so the mapping side of {@code
 * showDetails()} runs end-to-end; the RestTemplate paths in
 * {@code addSequenceToQueue} / {@code voteForSequence} construct their own
 * {@code RestTemplate} internally with {@code new}, so we can't mock that
 * collaborator from a unit test — those paths are covered indirectly by the
 * controller integration tests in {@link
 * com.remotefalcon.external.api.controller.ExternalApiControllerTest}.
 */
@ExtendWith(MockitoExtension.class)
class ExternalApiServiceTest {

    private static final String SHOW_TOKEN = "show-token-xyz";

    @Mock private ShowRepository showRepository;
    @Mock private AuthUtil authUtil;

    private ExternalApiService service;

    @BeforeEach
    void setUp() {
        service = new ExternalApiService(showRepository, authUtil, new DozerBeanMapper());
        ReflectionTestUtils.setField(service, "viewerApiUrl", "http://viewer.test.local");
    }

    // ----- showDetails -----

    @Test
    void showDetails_returns401_whenShowTokenIsNull() {
        authUtil.showToken = null;
        ResponseEntity<ShowResponse> response = service.showDetails();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody()).isNull();
    }

    @Test
    void showDetails_returns400_whenShowNotFound() {
        authUtil.showToken = SHOW_TOKEN;
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());

        ResponseEntity<ShowResponse> response = service.showDetails();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNull();
    }

    @Test
    void showDetails_returns200_andMapsShow_whenFound() {
        authUtil.showToken = SHOW_TOKEN;
        Show show = Show.builder()
                .showToken(SHOW_TOKEN)
                .showSubdomain("my-show")
                .preferences(Preference.builder()
                        .viewerControlEnabled(true)
                        .jukeboxDepth(5)
                        .build())
                .playingNow("Wizards in Winter")
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        ResponseEntity<ShowResponse> response = service.showDetails();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getPlayingNow()).isEqualTo("Wizards in Winter");
        assertThat(response.getBody().getPreferences()).isNotNull();
        assertThat(response.getBody().getPreferences().getViewerControlEnabled()).isTrue();
        assertThat(response.getBody().getPreferences().getJukeboxDepth()).isEqualTo(5);
    }

    // ----- addSequenceToQueue -----

    @Test
    void addSequenceToQueue_returns401_whenShowTokenIsNull() {
        authUtil.showToken = null;
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();
        ResponseEntity<RequestVoteResponse> response = service.addSequenceToQueue(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void addSequenceToQueue_returns500_whenShowNotFound() {
        authUtil.showToken = SHOW_TOKEN;
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();

        ResponseEntity<RequestVoteResponse> response = service.addSequenceToQueue(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // ----- voteForSequence -----

    @Test
    void voteForSequence_returns401_whenShowTokenIsNull() {
        authUtil.showToken = null;
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();
        ResponseEntity<RequestVoteResponse> response = service.voteForSequence(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void voteForSequence_returns500_whenShowNotFound() {
        authUtil.showToken = SHOW_TOKEN;
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();

        ResponseEntity<RequestVoteResponse> response = service.voteForSequence(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
