package com.remotefalcon.external.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.external.api.request.RequestVoteRequest;
import com.remotefalcon.external.api.response.RequestVoteResponse;
import com.remotefalcon.external.api.response.ShowResponse;
import com.remotefalcon.external.api.util.AuthUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.Sequence;
import org.dozer.DozerBeanMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ExternalApiService}.
 *
 * <p>Covers all three service methods on both the {@code authUtil.getShowToken()
 * == null} path and the show-not-found path. Uses a real {@link
 * DozerBeanMapper} (cheap to construct) so the mapping side of {@code
 * showDetails()} runs end-to-end; the RestTemplate paths in
 * {@code addSequenceToQueue} / {@code voteForSequence} construct their own
 * {@code RestTemplate} internally with {@code new}, so we can't mock that
 * collaborator from a unit test. Those paths are currently uncovered: there is
 * no controller integration test for this service anywhere in the tree.
 */
@ExtendWith(MockitoExtension.class)
class ExternalApiServiceTest {

    private static final String SHOW_TOKEN = "show-token-xyz";
    private static final String IMAGE_URL =
            "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/example/600x600bb.jpg";

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
        when(authUtil.getShowToken()).thenReturn(null);
        ResponseEntity<ShowResponse> response = service.showDetails();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody()).isNull();
    }

    @Test
    void showDetails_returns400_whenShowNotFound() {
        when(authUtil.getShowToken()).thenReturn(SHOW_TOKEN);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());

        ResponseEntity<ShowResponse> response = service.showDetails();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNull();
    }

    @Test
    void showDetails_returns200_andMapsShow_whenFound() {
        when(authUtil.getShowToken()).thenReturn(SHOW_TOKEN);
        Show show = Show.builder()
                .showToken(SHOW_TOKEN)
                .showSubdomain("my-show")
                .preferences(Preference.builder()
                        .viewerControlEnabled(true)
                        .jukeboxDepth(5)
                        .build())
                .playingNow("Wizards in Winter")
                .sequences(List.of(
                        Sequence.builder()
                                .name("Wizards in Winter")
                                .artist("Trans-Siberian Orchestra")
                                .imageUrl(IMAGE_URL)
                                .build(),
                        Sequence.builder()
                                .name("Carol of the Bells")
                                .artist("Lindsey Stirling")
                                .build()))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        ResponseEntity<ShowResponse> response = service.showDetails();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getPlayingNow()).isEqualTo("Wizards in Winter");
        assertThat(response.getBody().getPreferences()).isNotNull();
        assertThat(response.getBody().getPreferences().getViewerControlEnabled()).isTrue();
        assertThat(response.getBody().getPreferences().getJukeboxDepth()).isEqualTo(5);

        assertThat(response.getBody().getSequences()).hasSize(2);
        ShowResponse.Sequence mapped = response.getBody().getSequences().get(0);
        assertThat(mapped.getName()).isEqualTo("Wizards in Winter");
        assertThat(mapped.getArtist()).isEqualTo("Trans-Siberian Orchestra");
        assertThat(mapped.getImageUrl()).isEqualTo(IMAGE_URL);
    }

    @Test
    void showDetails_mapsImageUrlAsNull_whenOwnerNeverSetOne() {
        when(authUtil.getShowToken()).thenReturn(SHOW_TOKEN);
        Show show = Show.builder()
                .showToken(SHOW_TOKEN)
                .sequences(List.of(Sequence.builder().name("Carol of the Bells").build()))
                .build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        ResponseEntity<ShowResponse> response = service.showDetails();
        assertThat(response.getBody()).isNotNull();
        // null, not "" — this is what the spec's `nullable: true` promises.
        assertThat(response.getBody().getSequences().get(0).getImageUrl()).isNull();
    }

    @Test
    void showResponse_serializesImageUrlKey_evenWhenNull() throws Exception {
        // The DTO carries no @JsonInclude, so nulls serialize explicitly and
        // every other nullable field behaves this way. Pinned so a future
        // NON_NULL cannot silently drop the key out of the documented contract.
        ShowResponse body = ShowResponse.builder()
                .sequences(List.of(ShowResponse.Sequence.builder()
                        .name("Carol of the Bells")
                        .build()))
                .build();

        JsonNode sequence = new ObjectMapper().valueToTree(body).get("sequences").get(0);
        assertThat(sequence.has("imageUrl")).isTrue();
        assertThat(sequence.get("imageUrl").isNull()).isTrue();
    }

    // ----- addSequenceToQueue -----

    @Test
    void addSequenceToQueue_returns401_whenShowTokenIsNull() {
        when(authUtil.getShowToken()).thenReturn(null);
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();
        ResponseEntity<RequestVoteResponse> response = service.addSequenceToQueue(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void addSequenceToQueue_returns500_whenShowNotFound() {
        when(authUtil.getShowToken()).thenReturn(SHOW_TOKEN);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();

        ResponseEntity<RequestVoteResponse> response = service.addSequenceToQueue(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // ----- voteForSequence -----

    @Test
    void voteForSequence_returns401_whenShowTokenIsNull() {
        when(authUtil.getShowToken()).thenReturn(null);
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();
        ResponseEntity<RequestVoteResponse> response = service.voteForSequence(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void voteForSequence_returns500_whenShowNotFound() {
        when(authUtil.getShowToken()).thenReturn(SHOW_TOKEN);
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        RequestVoteRequest req = RequestVoteRequest.builder().sequence("Carol").build();

        ResponseEntity<RequestVoteResponse> response = service.voteForSequence(req);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
