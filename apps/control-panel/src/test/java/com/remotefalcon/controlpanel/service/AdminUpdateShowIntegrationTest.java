package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.EmailUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.ViewerSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The regression test the 2026-08-22 audit found missing: an admin
 * Account-Details edit must not erase server-owned state.
 *
 * <p>The pre-fix {@code adminUpdateShow} rebuilt the Show from GraphQL input
 * and {@code save()}d it, wiping every field ShowInput doesn't carry — the
 * season's stats, viewer sessions, notification bell, FPP heartbeat state,
 * and the PRD-013 consent pair, which has compliance weight because it cannot
 * be reconstructed. The unit tests only pinned id/password carry-over, so the
 * wipe ran green. This test does the real round trip against real Mongo.
 */
@DataMongoTest
@Testcontainers
class AdminUpdateShowIntegrationTest {

    @Container
    static final MongoDBContainer MONGO =
            new MongoDBContainer(DockerImageName.parse("mongo:7"));

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", MONGO::getReplicaSetUrl);
        reg.add("spring.data.mongodb.database", () -> "remote-falcon-test");
    }

    @Autowired private MongoTemplate mongoTemplate;
    @Autowired private ShowRepository showRepository;

    // Mocked so @DataMongoTest doesn't try to wire them from the full context.
    @MockBean private EmailUtil emailUtil;
    @MockBean private AuthUtil authUtil;
    @MockBean private NotificationRepository notificationRepository;
    @MockBean private ClientUtil clientUtil;

    private GraphQLMutationService service;

    @BeforeEach
    void setUp() {
        mongoTemplate.dropCollection(Show.class);
        service = new GraphQLMutationService(
                emailUtil, authUtil, showRepository, notificationRepository,
                clientUtil, new ViewerPageService(), mongoTemplate,
                new com.remotefalcon.controlpanel.util.PostHogUtil(),
                new GraphQLQueryService(authUtil, clientUtil, showRepository,
                        notificationRepository, new ViewerPageService(), mongoTemplate));
        ReflectionTestUtils.setField(service, "autoValidateEmail", Boolean.TRUE);
    }

    @Test
    void adminEdit_changesTheEditedField_andPreservesEverythingElse() {
        LocalDateTime now = LocalDateTime.now();
        Show seeded = Show.builder()
                .showToken("tok-integration")
                .email("owner@example.com")
                .password("$2a$10$real.bcrypt.hash.the.wipe.must.not.touch.AAAAAAAAAAAAAA")
                .showName("Holtz Lights")
                .showSubdomain("holtzlights")
                .emailVerified(true)
                .showRole(ShowRole.USER)
                .createdDate(now.minusYears(1))
                .lastLoginDate(now.minusHours(2))
                .expireDate(now.plusYears(1))
                // --- the state the old implementation erased ---
                .stats(Stat.builder()
                        .page(new ArrayList<>(List.of(
                                Stat.Page.builder().ip("1.2.3.4").dateTime(now.minusDays(3)).build())))
                        .jukebox(new ArrayList<>(List.of(
                                Stat.Jukebox.builder().name("Carol of the Bells")
                                        .dateTime(now.minusDays(2)).build())))
                        .build())
                .viewerSessions(new ArrayList<>(List.of(
                        ViewerSession.builder().viewerId("v-1").lastSeen(now.minusDays(1)).build())))
                .lastFppHeartbeat(now.minusMinutes(3))
                .marketingOptIn(Boolean.TRUE)
                .optInUpdatedAt(now.minusDays(30))
                .build();
        showRepository.save(seeded);

        // The admin edits ONE thing in the JSON editor: the show name. The
        // bound input carries only what the editor's seed query selected.
        Show adminPayload = Show.builder()
                .showToken("tok-integration")
                .showName("Holtz Family Lights")
                .preferences(Preference.builder().viewerControlEnabled(Boolean.FALSE).build())
                .build();

        assertThat(service.adminUpdateShow(adminPayload)).isTrue();

        Show after = showRepository.findByShowToken("tok-integration").orElseThrow();
        // The edit landed.
        assertThat(after.getShowName()).isEqualTo("Holtz Family Lights");
        assertThat(after.getPreferences().getViewerControlEnabled()).isFalse();
        // Everything the old code wiped is intact.
        assertThat(after.getPassword())
                .isEqualTo("$2a$10$real.bcrypt.hash.the.wipe.must.not.touch.AAAAAAAAAAAAAA");
        assertThat(after.getStats()).isNotNull();
        assertThat(after.getStats().getPage()).hasSize(1);
        assertThat(after.getStats().getJukebox()).hasSize(1);
        assertThat(after.getViewerSessions()).hasSize(1);
        assertThat(after.getLastFppHeartbeat()).isNotNull();
        assertThat(after.getMarketingOptIn()).isTrue();
        assertThat(after.getOptInUpdatedAt()).isNotNull();
        assertThat(after.getEmail()).isEqualTo("owner@example.com");
    }

    @Test
    void serviceToken_isTransient_andNeverReachesDisk() {
        // @JsonIgnore is a Jackson annotation; Spring's MappingMongoConverter
        // ignores it, so before @Transient the runtime-only bearer token was
        // one populated save() away from disk. Assert the raw document.
        Show show = Show.builder()
                .showToken("tok-transient")
                .email("t@example.com")
                .showName("Transient Check")
                .build();
        show.setServiceToken("jwt-that-must-never-persist");
        showRepository.save(show);

        org.bson.Document raw = mongoTemplate.getCollection("show")
                .find(new org.bson.Document("showToken", "tok-transient")).first();
        assertThat(raw).isNotNull();
        assertThat(raw.containsKey("serviceToken")).isFalse();
    }
}
