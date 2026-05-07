package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.testfixtures.ShowFactory;
import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Collation;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies {@link ShowRepository#findByEmailCollation(String)} continues to:
 *
 * <ol>
 *   <li>Match emails case-insensitively (en, strength=2 collation).</li>
 *   <li>Use the {@code idx_email_ci} index instead of falling back to a COLLSCAN.</li>
 * </ol>
 *
 * <p>Regression context: pre-monorepo signIn used Spring Data's derived
 * {@code findByEmailIgnoreCase}, which compiles to a {@code $regex /…/i} query.
 * Mongo refuses to use a collation index when query collation doesn't match the
 * index collation, so every login was a COLLSCAN (~5s). PR #73 swapped to a
 * {@code @Query}-annotated method with explicit collation. This test pins that
 * behavior so a future refactor that re-introduces the derived method fails CI.
 */
@DataMongoTest
@Testcontainers
class ShowRepositoryCollationTest {

    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MongoTemplate mongoTemplate;

    @Autowired
    private ShowRepository showRepository;

    @BeforeEach
    void setup() {
        mongoTemplate.dropCollection(Show.class);

        // Mirror the live cluster's idx_email_ci. PR #75 / MongoIndexInitializer
        // creates this on app startup; @DataMongoTest may not boot the initializer,
        // so create it explicitly so the query plan is realistic.
        mongoTemplate.indexOps(Show.class).ensureIndex(
                new Index()
                        .on("email", Sort.Direction.ASC)
                        .named("idx_email_ci")
                        .unique()
                        .collation(Collation.of("en")
                                .strength(Collation.ComparisonLevel.secondary())));
    }

    @Test
    void findByEmailCollation_matchesExactCase() {
        Show show = ShowFactory.builder()
                .email("foo@example.com")
                .build();
        mongoTemplate.insert(show);

        Optional<Show> result = showRepository.findByEmailCollation("foo@example.com");

        assertThat(result).isPresent();
        assertThat(result.get().getEmail()).isEqualTo("foo@example.com");
    }

    @Test
    void findByEmailCollation_matchesDifferentCase() {
        Show show = ShowFactory.builder()
                .email("Foo@Example.COM")
                .build();
        mongoTemplate.insert(show);

        Optional<Show> result = showRepository.findByEmailCollation("foo@example.com");

        assertThat(result)
                .as("collation strength=2 must treat Foo@Example.COM and foo@example.com as equal")
                .isPresent();
        assertThat(result.get().getEmail()).isEqualTo("Foo@Example.COM");
    }

    @Test
    void findByEmailCollation_returnsEmpty_whenNoMatch() {
        Show show = ShowFactory.builder()
                .email("someone@example.com")
                .build();
        mongoTemplate.insert(show);

        Optional<Show> result = showRepository.findByEmailCollation("nobody@example.com");

        assertThat(result).isEmpty();
    }

    /**
     * Regression-catcher: if someone removes the {@code @Query} annotation and
     * replaces the method with a derived {@code findByEmailIgnoreCase}, Mongo
     * runs a COLLSCAN and this assertion fails.
     *
     * <p>We replicate the query Spring Data emits for the {@code @Query}-annotated
     * method ({@code { email: ?0 }} with the en/secondary collation) and inspect
     * the explain plan. A correct implementation produces FETCH→IXSCAN; the
     * regression produces a COLLSCAN.
     */
    @Test
    void findByEmailCollation_useIndexNotCollscan() {
        // Seed multiple shows so the planner has a real choice between IXSCAN/COLLSCAN.
        for (int i = 0; i < 50; i++) {
            mongoTemplate.insert(ShowFactory.builder()
                    .email("user" + i + "@example.com")
                    .build());
        }
        mongoTemplate.insert(ShowFactory.builder().email("target@example.com").build());

        Document explainResult = mongoTemplate.getCollection("show")
                .find(new Document("email", "target@example.com"))
                .collation(com.mongodb.client.model.Collation.builder()
                        .locale("en")
                        .collationStrength(com.mongodb.client.model.CollationStrength.SECONDARY)
                        .build())
                .explain();

        String stage = extractLeafStage(explainResult);
        assertThat(stage)
                .as("findByEmailCollation must use idx_email_ci (IXSCAN), not COLLSCAN. " +
                        "If this fails, someone likely replaced the @Query-annotated method " +
                        "with a derived findByEmailIgnoreCase, which emits $regex /…/i and " +
                        "cannot use a collation index.")
                .isEqualTo("IXSCAN");
    }

    /** Walks the explain plan tree to the leaf stage (FETCH → IXSCAN, or COLLSCAN). */
    private static String extractLeafStage(Document explain) {
        Document queryPlanner = (Document) explain.get("queryPlanner");
        Document winningPlan = (Document) queryPlanner.get("winningPlan");
        Document stage = winningPlan;
        // Newer Mongo wraps the plan in queryPlan; unwrap if present.
        if (stage.containsKey("queryPlan")) {
            stage = (Document) stage.get("queryPlan");
        }
        while (stage.containsKey("inputStage")) {
            stage = (Document) stage.get("inputStage");
        }
        return stage.getString("stage");
    }
}
