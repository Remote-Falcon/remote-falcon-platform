package com.remotefalcon.controlpanel.configuration;

import com.remotefalcon.library.documents.Show;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.IndexInfo;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies {@link MongoIndexInitializer} creates every expected index on the
 * {@code show} collection — in particular the two public-query indexes added to
 * close COLLSCANs on the Show-map and Wrapped-summary paths. Catches a fat-fingered
 * field path or wrong index type at review (the queries they back are public and
 * uncached, so a missing/wrong index is a full scan of every show on each request).
 */
@DataMongoTest
@Testcontainers
class MongoIndexInitializerTest {

    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry reg) {
        reg.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }

    @Autowired
    private MongoTemplate mongoTemplate;

    private Map<String, IndexInfo> indexes;

    @BeforeEach
    void setup() {
        mongoTemplate.dropCollection(Show.class);
        new MongoIndexInitializer(new MaintenanceMongo(null, mongoTemplate)).ensureShowIndexes();
        indexes = mongoTemplate.indexOps(Show.class).getIndexInfo().stream()
                .collect(Collectors.toMap(IndexInfo::getName, Function.identity()));
    }

    @Test
    void buildsIndexesOnTheMaintenanceClient() {
        // S8a: a NEW index build on the show collection can run well past the
        // request-path client's 10s read timeout, so it must go through the
        // long-timeout maintenance client.
        MongoTemplate maintenanceTemplate = org.mockito.Mockito.mock(MongoTemplate.class);
        org.springframework.data.mongodb.core.index.IndexOperations ops =
                org.mockito.Mockito.mock(org.springframework.data.mongodb.core.index.IndexOperations.class);
        org.mockito.Mockito.when(maintenanceTemplate.indexOps(Show.class)).thenReturn(ops);

        new MongoIndexInitializer(new MaintenanceMongo(null, maintenanceTemplate)).ensureShowIndexes();

        org.mockito.Mockito.verify(ops, org.mockito.Mockito.atLeast(9)).ensureIndex(
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void ensuresAllExpectedShowIndexes() {
        assertThat(indexes.keySet()).contains(
                "idx_showToken", "idx_email_ci", "idx_showName", "idx_showSubdomain",
                "idx_fppHeartbeat_enabled", "idx_apiAccessToken", "idx_passwordResetLink",
                "idx_showOnMap", "idx_wrappedShareToken");
    }

    @Test
    void showOnMapIndex_isPartial_onLatLong() {
        IndexInfo idx = indexes.get("idx_showOnMap");
        assertThat(idx).isNotNull();
        assertThat(idx.getIndexFields()).extracting(f -> f.getKey())
                .containsExactly("preferences.showLatitude", "preferences.showLongitude");
        // Partial filter on showOnMap keeps only map-opted shows in the index.
        assertThat(idx.getPartialFilterExpression())
                .as("idx_showOnMap must be partial (showOnMap=true) so it stays small")
                .isNotNull();
    }

    @Test
    void wrappedShareTokenIndex_isSparse() {
        IndexInfo idx = indexes.get("idx_wrappedShareToken");
        assertThat(idx).isNotNull();
        assertThat(idx.getIndexFields()).extracting(f -> f.getKey())
                .containsExactly("preferences.wrappedShareToken");
        assertThat(idx.isSparse())
                .as("idx_wrappedShareToken must be sparse (most shows have no token)")
                .isTrue();
    }
}
