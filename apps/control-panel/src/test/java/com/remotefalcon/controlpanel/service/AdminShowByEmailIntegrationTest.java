package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.testfixtures.JwtFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration test for the admin support lookup {@code getShowByEmail(email)}.
 *
 * <p>Pattern mirrors {@code NotificationAdminMutationsIntegrationTest}: full
 * {@code @SpringBootTest} + {@code @AutoConfigureMockMvc} so the AOP
 * {@code @RequiresAdminAccess} gate is exercised end-to-end through a real
 * GraphQL POST, against a real testcontainers Mongo.
 *
 * <p>Two things here can only be verified at this level, not in
 * {@code GraphQLQueryServiceTest} (which mocks the repository):
 *
 * <ul>
 *   <li><b>Case-insensitive matching.</b> The collation lives in the
 *       {@code @Query} annotation on {@code findByEmailCollation}, so only a
 *       real Mongo proves that a stored {@code Rcamp572@gmail.com} is found by
 *       a typed {@code rcamp572@gmail.com}. This is not hypothetical -- that
 *       exact capitalisation exists in production, and a naive
 *       {@code findByEmail} would silently return "no such account".</li>
 *   <li><b>The admin gate.</b> {@code getShowByEmail} returns the full Show
 *       document (email, tokens, IPs, API keys). The service method itself does
 *       no authorisation -- it is entirely dependent on the annotation being
 *       present. If someone drops {@code @RequiresAdminAccess} in a refactor,
 *       every logged-in user could enumerate account details by email. Only a
 *       request-level test catches that.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class AdminShowByEmailIntegrationTest {

    private static final String GRAPHQL_ENDPOINT = "/graphql";

    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ShowRepository showRepository;

    @BeforeEach
    void cleanCollections() {
        showRepository.deleteAll();
    }

    // ---------- helpers ----------

    private static String adminToken() {
        return JwtFactory.issueControlPanel(
                "admin-show-token", "admin@example.com", "admin-show", "ADMIN");
    }

    private static String userToken() {
        return JwtFactory.issueControlPanel(
                "user-show-token", "user@example.com", "user-show", "USER");
    }

    private Show seedShow(String email, String showName) {
        LocalDateTime now = LocalDateTime.now();
        return showRepository.save(Show.builder()
                .showToken(UUID.randomUUID().toString())
                .email(email)
                .password("$2a$10$test.bcrypt.hash.placeholder.value.AAAAAAAAAAAAAAAAAAAAAA")
                .showName(showName)
                .showSubdomain(showName.toLowerCase().replace(" ", ""))
                .emailVerified(true)
                .createdDate(now.minusDays(30))
                .lastLoginDate(now.minusHours(1))
                .expireDate(now.plusYears(1))
                .showRole(ShowRole.USER)
                .build());
    }

    private static String graphqlBody(String query, String variablesJson) {
        return "{\"query\":" + jsonString(query) + ",\"variables\":" + variablesJson + "}";
    }

    private static String jsonString(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    private static final String QUERY =
            "query($email: String!) { getShowByEmail(email: $email) "
                    + "{ email showName showSubdomain } }";

    private static String vars(String email) {
        return "{\"email\":" + jsonString(email) + "}";
    }

    // ====================================================================

    @Test
    void getShowByEmail_returnsShow_forExactMatch() throws Exception {
        seedShow("operator@example.com", "Operator Lights");

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(QUERY, vars("operator@example.com"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.getShowByEmail.showName").value("Operator Lights"))
                .andExpect(jsonPath("$.data.getShowByEmail.email").value("operator@example.com"));
    }

    /**
     * The production-shaped case: stored with a capital leading letter,
     * searched all-lowercase. Guards the collation on findByEmailCollation.
     */
    @Test
    void getShowByEmail_matchesRegardlessOfCase() throws Exception {
        seedShow("Rcamp572@gmail.com", "Papaws Christmas Lights");

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(QUERY, vars("rcamp572@gmail.com"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.getShowByEmail.showName")
                        .value("Papaws Christmas Lights"))
                .andExpect(jsonPath("$.data.getShowByEmail.email").value("Rcamp572@gmail.com"));
    }

    /** Pasted-from-a-ticket input carries whitespace; the service trims it. */
    @Test
    void getShowByEmail_tolerantOfSurroundingWhitespace() throws Exception {
        seedShow("padded@example.com", "Padded Show");

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(QUERY, vars("  padded@example.com  "))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.getShowByEmail.showName").value("Padded Show"));
    }

    @Test
    void getShowByEmail_returnsNull_whenNoMatch() throws Exception {
        seedShow("someone@example.com", "Someone Else");

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(QUERY, vars("nobody@example.com"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.getShowByEmail").doesNotExist());
    }

    /**
     * The PII gate. A USER-role token must not be able to read another
     * account's details. AccessAspect#isAdminJwtValid rejects on the showRole
     * claim, the @Around throws InvalidJwtException, and CustomExceptionResolver
     * turns that into HTTP 200 + errors[].message == "INVALID_JWT".
     */
    @Test
    void getShowByEmail_rejectsNonAdmin() throws Exception {
        seedShow("victim@example.com", "Victim Show");

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken())
                        .content(graphqlBody(QUERY, vars("victim@example.com"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors[0].message").value("INVALID_JWT"))
                .andExpect(jsonPath("$.data.getShowByEmail").doesNotExist());
    }
}
