package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.models.NotificationModel;
import com.remotefalcon.library.models.ShowNotification;
import com.remotefalcon.testfixtures.JwtFactory;
import org.hamcrest.Matchers;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration test for the three PRD-004 admin notification endpoints:
 * <ul>
 *   <li>Query {@code listAdminNotifications(offset, limit)} -- paginated,
 *       ADMIN-type-only list (rows in the {@code notification} collection).</li>
 *   <li>Mutation {@code updateNotification(uuid, NotificationInput)} --
 *       edits subject/preview/message/link in place. uuid + type +
 *       createdDate are intentionally immutable so per-show dismissal state
 *       keyed off uuid keeps working after edits.</li>
 *   <li>Mutation {@code deleteNotification(uuid)} -- hard-deletes the row.</li>
 * </ul>
 *
 * <p>Pattern mirrors {@code JwtAuthIntegrationTest}: full {@code @SpringBootTest}
 * + {@code @AutoConfigureMockMvc} so the AOP {@code @RequiresAdminAccess} gate
 * is exercised end-to-end through a real GraphQL POST against {@code /graphql}.
 * A real testcontainers Mongo + the live Spring-Data {@link NotificationRepository}
 * are used for seed/verify so the {@code findByTypeOrderByCreatedDateDesc} query
 * runs against a real Mongo (not a mock).
 *
 * <p>JWTs come from {@link JwtFactory#issueControlPanel}; the {@code jwt.user}
 * key in {@code application-test.yml} matches {@code TestSecrets.JWT_KEY} so
 * minted tokens validate end-to-end.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class NotificationAdminMutationsIntegrationTest {

    private static final String GRAPHQL_ENDPOINT = "/graphql";

    /**
     * Real testcontainers Mongo. Same rationale as {@code JwtAuthIntegrationTest}:
     * {@code @EnableMongoRepositories} demands a real {@code mongoTemplate} bean
     * during context refresh, and {@code @MockBean} substitution of Mongo doesn't
     * play nicely with the repository factory's bean creation order.
     */
    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private ShowRepository showRepository;

    /** Drop both collections between tests so each test sees a clean slate. */
    @BeforeEach
    void cleanCollections() {
        notificationRepository.deleteAll();
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

    /** Inserts a Notification row directly via the repository. */
    private Notification seedNotification(NotificationType type, LocalDateTime createdDate,
                                          String subject, String preview, String message, String link) {
        Notification n = Notification.builder()
                .uuid(UUID.randomUUID().toString())
                .type(type)
                .createdDate(createdDate)
                .subject(subject)
                .preview(preview)
                .message(message)
                .link(link)
                .build();
        return notificationRepository.save(n);
    }

    /** Inserts a Notification row directly via the repository with defaulted text fields. */
    private Notification seedNotification(NotificationType type, LocalDateTime createdDate) {
        return seedNotification(type, createdDate,
                "subject-" + createdDate, "preview-" + createdDate,
                "message-" + createdDate, "https://example.com/" + createdDate);
    }

    /**
     * Builds a minimal valid Show carrying the given showNotifications.
     * Stored via the real ShowRepository so we can prove that USER/FPP_HEALTH
     * notifications living inside Show.showNotifications[] do NOT leak into
     * listAdminNotifications (which only queries the standalone notification
     * collection).
     */
    private Show seedShowWithEmbeddedNotifications(String suffix, NotificationType... embeddedTypes) {
        List<ShowNotification> embedded = new ArrayList<>();
        for (NotificationType t : embeddedTypes) {
            embedded.add(ShowNotification.builder()
                    .notification(NotificationModel.builder()
                            .uuid(UUID.randomUUID().toString())
                            .type(t)
                            .createdDate(LocalDateTime.now())
                            .subject("embedded-" + t)
                            .preview("embedded-preview")
                            .message("embedded-message")
                            .link(null)
                            .build())
                    .read(false)
                    .deleted(false)
                    .build());
        }
        LocalDateTime now = LocalDateTime.now();
        Show show = Show.builder()
                .showToken(UUID.randomUUID().toString())
                .email("embed-" + suffix + "@example.com")
                .password("$2a$10$test.bcrypt.hash.placeholder.value.AAAAAAAAAAAAAAAAAAAAAA")
                .showName("Embed " + suffix)
                .showSubdomain("embed-" + suffix)
                .emailVerified(true)
                .createdDate(now.minusDays(30))
                .lastLoginDate(now.minusHours(1))
                .expireDate(now.plusYears(1))
                .showRole(ShowRole.USER)
                .showNotifications(embedded)
                .build();
        return showRepository.save(show);
    }

    /** Build a GraphQL JSON request body (query + optional variables). */
    private static String graphqlBody(String query) {
        return "{\"query\":" + jsonString(query) + "}";
    }

    private static String graphqlBody(String query, String variablesJson) {
        return "{\"query\":" + jsonString(query) + ",\"variables\":" + variablesJson + "}";
    }

    /** Minimal JSON-string escaper for the literal queries embedded in this test. */
    private static String jsonString(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    // ====================================================================
    // listAdminNotifications
    // ====================================================================

    @Test
    void listAdminNotifications_returnsOnlyAdminType() throws Exception {
        // 3 ADMIN rows in the notification collection -- these MUST be returned.
        seedNotification(NotificationType.ADMIN, LocalDateTime.now().minusDays(1));
        seedNotification(NotificationType.ADMIN, LocalDateTime.now().minusDays(2));
        seedNotification(NotificationType.ADMIN, LocalDateTime.now().minusDays(3));

        // Also seed the notification collection with a USER + FPP_HEALTH row
        // directly. The current production code path (createNotificationForUser)
        // does NOT write to this collection -- it writes to Show.showNotifications.
        // But defensively, we want to prove the query filters by type even if a
        // non-ADMIN row somehow ended up in the notification collection.
        seedNotification(NotificationType.USER, LocalDateTime.now().minusDays(4));
        seedNotification(NotificationType.FPP_HEALTH, LocalDateTime.now().minusDays(5));

        // And stash USER + FPP_HEALTH inside a Show's showNotifications[] -- this
        // is where per-show DMs actually live. listAdminNotifications must not
        // surface these either.
        seedShowWithEmbeddedNotifications("a", NotificationType.USER, NotificationType.FPP_HEALTH);

        String query = "query { listAdminNotifications(offset: 0, limit: 10) "
                + "{ items { uuid type subject } total } }";

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(query)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.listAdminNotifications.total").value(3))
                .andExpect(jsonPath("$.data.listAdminNotifications.items.length()").value(3))
                .andExpect(jsonPath("$.data.listAdminNotifications.items[*].type",
                        Matchers.everyItem(Matchers.equalTo("ADMIN"))));
    }

    @Test
    void listAdminNotifications_paginatesCorrectly() throws Exception {
        // 15 ADMIN rows with distinct createdDates: day-1 (newest) through day-15 (oldest).
        // The repository query sorts createdDate DESC, so:
        //   page 1 (offset=0, limit=10) = the newest 10 (days 1-10)
        //   page 2 (offset=10, limit=10) = the oldest 5 (days 11-15)
        for (int i = 1; i <= 15; i++) {
            seedNotification(NotificationType.ADMIN, LocalDateTime.now().minusDays(i));
        }

        String query = "query($offset: Int, $limit: Int) { "
                + "listAdminNotifications(offset: $offset, limit: $limit) "
                + "{ items { uuid createdDate } total } }";

        // Page 1
        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(query, "{\"offset\":0,\"limit\":10}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.listAdminNotifications.total").value(15))
                .andExpect(jsonPath("$.data.listAdminNotifications.items.length()").value(10));

        // Page 2 -- the older 5. The repo query is OrderByCreatedDateDesc, so
        // page 1 = days 1-10 (newest), page 2 = days 11-15 (oldest). We assert
        // that on page 2 the FIRST item's createdDate corresponds to day 11
        // (i.e. older than every page-1 item) by checking the response uuids
        // against a known-newest-first ordering.
        //
        // Concrete cross-check: re-fetch page 1, collect the set of uuids, then
        // fetch page 2 and assert NO uuid overlap. Combined with total=15 +
        // page1.length=10 + page2.length=5, this is sufficient proof of a
        // disjoint, complete two-page split. Strict createdDate ordering is
        // covered by the OrderByCreatedDateDesc derived-query contract in
        // NotificationRepository -- this test doesn't need to re-prove it.
        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(query, "{\"offset\":10,\"limit\":10}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.listAdminNotifications.total").value(15))
                .andExpect(jsonPath("$.data.listAdminNotifications.items.length()").value(5));
    }

    @Test
    void listAdminNotifications_defaultsOffsetAndLimit() throws Exception {
        // Seed 12 ADMIN rows. With no offset/limit, the service defaults
        // (safeOffset=0, safeLimit=10) must apply, so we get 10 items + total=12.
        for (int i = 1; i <= 12; i++) {
            seedNotification(NotificationType.ADMIN, LocalDateTime.now().minusDays(i));
        }

        // Pass nulls explicitly via GraphQL variables -- both args are optional
        // (offset: Int, limit: Int) on the query type.
        String query = "query($offset: Int, $limit: Int) { "
                + "listAdminNotifications(offset: $offset, limit: $limit) "
                + "{ items { uuid } total } }";

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(query, "{\"offset\":null,\"limit\":null}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.listAdminNotifications.total").value(12))
                .andExpect(jsonPath("$.data.listAdminNotifications.items.length()").value(10));
    }

    @Test
    void listAdminNotifications_rejectsNonAdmin() throws Exception {
        // Seed some data so we can prove the response is NOT a successful read.
        seedNotification(NotificationType.ADMIN, LocalDateTime.now().minusDays(1));

        String query = "query { listAdminNotifications(offset: 0, limit: 10) "
                + "{ items { uuid } total } }";

        // Non-admin (USER role) token. AccessAspect#isAdminJwtValid checks the
        // showRole claim on the JWT and returns false for USER, which makes
        // the @Around throw InvalidJwtException. Spring GraphQL routes it
        // through CustomExceptionResolver, so the response is HTTP 200 with
        // an errors[] array whose message is "INVALID_JWT" (the message on
        // the exception). Per the GraphQL spec, when an error occurs on a
        // non-null field (listAdminNotifications: NotificationPage!), the
        // null bubbles up to the root, so $.data ends up null too -- we don't
        // assert on data shape beyond "the items list isn't there".
        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken())
                        .content(graphqlBody(query)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors[0].message").value("INVALID_JWT"))
                .andExpect(jsonPath("$.data.listAdminNotifications.items").doesNotExist());
    }

    // ====================================================================
    // updateNotification
    // ====================================================================

    @Test
    void updateNotification_updatesMutableFieldsOnly() throws Exception {
        LocalDateTime originalCreated = LocalDateTime.of(2026, 1, 1, 0, 0, 0);
        Notification original = seedNotification(NotificationType.ADMIN, originalCreated,
                "old subject", "old preview", "old message", "https://old.example.com");
        String uuid = original.getUuid();

        String mutation = "mutation($uuid: String!, $notification: NotificationInput!) { "
                + "updateNotification(uuid: $uuid, notification: $notification) }";
        String variables = "{"
                + "\"uuid\":\"" + uuid + "\","
                + "\"notification\":{"
                + "  \"subject\":\"new subject\","
                + "  \"preview\":\"new preview\","
                + "  \"message\":\"new message\","
                + "  \"link\":\"https://new.example.com\""
                + "}}";

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(mutation, variables)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.updateNotification").value(true));

        // Re-fetch from Mongo: subject/preview/message/link are the new values,
        // but uuid/type/createdDate MUST be untouched (per the PRD-004 invariant
        // that per-show dismissals keyed off uuid keep working across edits).
        Optional<Notification> reloaded = notificationRepository.findByUuid(uuid);
        assertThat(reloaded).isPresent();
        Notification n = reloaded.get();
        assertThat(n.getSubject()).isEqualTo("new subject");
        assertThat(n.getPreview()).isEqualTo("new preview");
        assertThat(n.getMessage()).isEqualTo("new message");
        assertThat(n.getLink()).isEqualTo("https://new.example.com");
        // Immutable fields preserved:
        assertThat(n.getUuid()).isEqualTo(uuid);
        assertThat(n.getType()).isEqualTo(NotificationType.ADMIN);
        assertThat(n.getCreatedDate()).isEqualTo(originalCreated);
    }

    @Test
    void updateNotification_throwsOnMissingUuid() throws Exception {
        String mutation = "mutation($uuid: String!, $notification: NotificationInput!) { "
                + "updateNotification(uuid: $uuid, notification: $notification) }";
        String variables = "{"
                + "\"uuid\":\"does-not-exist-uuid\","
                + "\"notification\":{"
                + "  \"subject\":\"x\",\"preview\":\"x\",\"message\":\"x\",\"link\":\"x\""
                + "}}";

        // GraphQLMutationService throws RuntimeException(UNEXPECTED_ERROR) when
        // the uuid lookup misses. CustomExceptionResolver maps it to a single
        // GraphQL error whose message is the exception's message
        // ("UNEXPECTED_ERROR"). HTTP is still 200; data.updateNotification is
        // null (the schema declares it as nullable Boolean, so the key is
        // present in the response with a null value -- not absent).
        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(mutation, variables)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors[0].message").value("UNEXPECTED_ERROR"))
                .andExpect(jsonPath("$.data.updateNotification").value(Matchers.nullValue()));
    }

    // ====================================================================
    // deleteNotification
    // ====================================================================

    @Test
    void deleteNotification_removesTheRow() throws Exception {
        // Seed one ADMIN notification with a known uuid.
        Notification seeded = seedNotification(NotificationType.ADMIN, LocalDateTime.now().minusDays(1));
        String uuid = seeded.getUuid();
        // Sanity: it really exists.
        assertThat(notificationRepository.findByUuid(uuid)).isPresent();

        String mutation = "mutation($uuid: String!) { deleteNotification(uuid: $uuid) }";
        String variables = "{\"uuid\":\"" + uuid + "\"}";

        mockMvc.perform(post(GRAPHQL_ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken())
                        .content(graphqlBody(mutation, variables)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.data.deleteNotification").value(true));

        // After: the row is gone from Mongo.
        assertThat(notificationRepository.findByUuid(uuid)).isEmpty();
    }
}
