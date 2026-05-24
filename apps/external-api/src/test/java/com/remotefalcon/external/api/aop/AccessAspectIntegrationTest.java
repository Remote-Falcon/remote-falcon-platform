package com.remotefalcon.external.api.aop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.external.api.request.RequestVoteRequest;
import com.remotefalcon.external.api.response.RequestVoteResponse;
import com.remotefalcon.external.api.testsupport.ExternalApiJwtFactory;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.ApiAccess;
import com.remotefalcon.library.models.Preference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end test for the external-api auth + controller + service surface.
 *
 * <p>Wires four real components through a live Spring context:
 * <ul>
 *   <li>{@link com.remotefalcon.external.api.util.AuthUtil} — JWT parsing +
 *       HMAC-SHA256 signature verification against the show's
 *       {@code apiAccess.apiAccessSecret}, looked up by the
 *       {@code accessToken} claim.</li>
 *   <li>{@link AccessAspect} — AOP advice on {@code @RequiresAccess}: on
 *       valid JWT proceed, otherwise return 401.</li>
 *   <li>{@link com.remotefalcon.external.api.controller.ExternalApiController} —
 *       all three endpoints carry {@code @RequiresAccess}.</li>
 *   <li>{@link com.remotefalcon.external.api.service.ExternalApiService} — the
 *       downstream {@code RestTemplate} calls are pointed at a WireMock
 *       instance for the success/error paths.</li>
 * </ul>
 *
 * <p>{@link ShowRepository} is replaced with a {@code @MockBean} rather than
 * standing up a testcontainers Mongo: the assertions here are about the auth
 * chain and downstream-API integration, not Mongo behavior, and avoiding the
 * Docker-in-Docker dance keeps this test runnable in any CI environment that
 * doesn't already expose the Docker socket to the build container.
 *
 * <p>A failure anywhere in this chain breaks every authenticated request —
 * this is the regression net.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccessAspectIntegrationTest {

    private static final String ACCESS_TOKEN = "access-tok-test";
    private static final String SECRET = "test-secret-must-be-long-enough-1234567890";
    private static final String SHOW_TOKEN = "show-tok-test";

    private static WireMockServer viewerApi;

    @BeforeAll
    static void startWireMock() {
        viewerApi = new WireMockServer(wireMockConfig().dynamicPort());
        viewerApi.start();
    }

    @AfterAll
    static void stopWireMock() {
        if (viewerApi != null) viewerApi.stop();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry reg) {
        // Mongo is mocked out via @MockBean; supply a placeholder URI so the
        // Mongo auto-config bean factory bootstraps without a real connection.
        // (Connection is lazy — no actual TCP attempt is made because the
        // repository never hits a real query in these tests.)
        reg.add("spring.data.mongodb.uri", () -> "mongodb://placeholder:27017/test");
        reg.add("viewer.api.url", () -> "http://localhost:" + viewerApi.port());
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private ShowRepository showRepository;

    private final Show seededShow = Show.builder()
            .showToken(SHOW_TOKEN)
            .showSubdomain("test-show")
            .apiAccess(ApiAccess.builder()
                    .apiAccessActive(true)
                    .apiAccessToken(ACCESS_TOKEN)
                    .apiAccessSecret(SECRET)
                    .build())
            .preferences(Preference.builder()
                    .viewerControlEnabled(true)
                    .jukeboxDepth(5)
                    .build())
            .playingNow("Wizards in Winter")
            .build();

    @BeforeEach
    void resetState() {
        viewerApi.resetAll();
    }

    private void stubShowFound() {
        when(showRepository.findByApiAccessApiAccessToken(ACCESS_TOKEN))
                .thenReturn(Optional.of(seededShow));
        when(showRepository.findByShowToken(SHOW_TOKEN))
                .thenReturn(Optional.of(seededShow));
    }

    // ----- Positive auth paths -----

    @Test
    void showDetails_returns200_withValidToken() throws Exception {
        stubShowFound();
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);

        mockMvc.perform(get("/showDetails")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playingNow").value("Wizards in Winter"));
    }

    @Test
    void addSequenceToQueue_returns200_andPropagatesToViewerApi() throws Exception {
        stubShowFound();
        viewerApi.stubFor(WireMock.post(urlEqualTo("/addSequenceToQueue"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        // No message field → service maps to 200 OK.
                        .withBody("{}")));
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        RequestVoteRequest body = RequestVoteRequest.builder().sequence("Carol").build();

        mockMvc.perform(post("/addSequenceToQueue")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    @Test
    void addSequenceToQueue_returns202_whenViewerApiReplyHasMessage() throws Exception {
        // viewer-api signals a soft failure / informational state via a non-null
        // message field; service maps to HTTP 202.
        stubShowFound();
        viewerApi.stubFor(WireMock.post(urlEqualTo("/addSequenceToQueue"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody(objectMapper.writeValueAsString(
                                RequestVoteResponse.builder().message("ALREADY_IN_QUEUE").build()))));
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        RequestVoteRequest body = RequestVoteRequest.builder().sequence("Carol").build();

        mockMvc.perform(post("/addSequenceToQueue")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.message").value("ALREADY_IN_QUEUE"));
    }

    @Test
    void addSequenceToQueue_returns500_whenViewerApiReturns4xx() throws Exception {
        stubShowFound();
        viewerApi.stubFor(WireMock.post(urlEqualTo("/addSequenceToQueue"))
                .willReturn(aResponse().withStatus(400)));
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        RequestVoteRequest body = RequestVoteRequest.builder().sequence("Carol").build();

        mockMvc.perform(post("/addSequenceToQueue")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isInternalServerError());
    }

    @Test
    void voteForSequence_returns200_andPropagatesToViewerApi() throws Exception {
        stubShowFound();
        viewerApi.stubFor(WireMock.post(urlEqualTo("/voteForSequence"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{}")));
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        RequestVoteRequest body = RequestVoteRequest.builder().sequence("Carol").build();

        mockMvc.perform(post("/voteForSequence")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    @Test
    void voteForSequence_returns500_whenViewerApiReturns4xx() throws Exception {
        stubShowFound();
        viewerApi.stubFor(WireMock.post(urlEqualTo("/voteForSequence"))
                .willReturn(aResponse().withStatus(400)));
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, SECRET);
        RequestVoteRequest body = RequestVoteRequest.builder().sequence("Carol").build();

        mockMvc.perform(post("/voteForSequence")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isInternalServerError());
    }

    // ----- Negative auth paths (AccessAspect → 401) -----

    @Test
    void showDetails_returns401_withoutAuthorizationHeader() throws Exception {
        stubShowFound();
        mockMvc.perform(get("/showDetails"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void showDetails_returns401_withGarbageToken() throws Exception {
        stubShowFound();
        mockMvc.perform(get("/showDetails")
                        .header("Authorization", "Bearer not-a-real-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void showDetails_returns401_whenSignatureWrong() throws Exception {
        stubShowFound();
        String token = ExternalApiJwtFactory.issue(ACCESS_TOKEN, "totally-different-secret");
        mockMvc.perform(get("/showDetails")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void showDetails_returns401_whenAccessTokenNotInDb() throws Exception {
        // showRepository returns empty for an unknown access token → AuthUtil
        // bails before even verifying the signature.
        when(showRepository.findByApiAccessApiAccessToken("not-a-known-access-token"))
                .thenReturn(Optional.empty());
        String token = ExternalApiJwtFactory.issue("not-a-known-access-token", SECRET);
        mockMvc.perform(get("/showDetails")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void addSequenceToQueue_returns401_withoutAuthorizationHeader() throws Exception {
        RequestVoteRequest body = RequestVoteRequest.builder().sequence("Carol").build();
        mockMvc.perform(post("/addSequenceToQueue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void voteForSequence_returns401_withoutAuthorizationHeader() throws Exception {
        RequestVoteRequest body = RequestVoteRequest.builder().sequence("Carol").build();
        mockMvc.perform(post("/voteForSequence")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isUnauthorized());
    }
}
