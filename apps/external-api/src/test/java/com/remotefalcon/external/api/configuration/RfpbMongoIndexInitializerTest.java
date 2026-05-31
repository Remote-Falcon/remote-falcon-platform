package com.remotefalcon.external.api.configuration;

import com.remotefalcon.external.api.document.RfpbLaunchJti;
import com.remotefalcon.external.api.document.RfpbSession;
import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.IndexDefinition;
import org.springframework.data.mongodb.core.index.IndexOperations;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Pins the index specs that {@link RfpbMongoIndexInitializer} ensures on
 * startup. Without these the RFPB TTL contract silently breaks in prod
 * (annotations are no-ops because auto-index-creation is off), so the
 * tests assert names + key shapes + expireAfterSeconds rather than just
 * "ensureIndex was called."
 */
@ExtendWith(MockitoExtension.class)
class RfpbMongoIndexInitializerTest {

    @Mock private MongoTemplate mongoTemplate;
    @Mock private IndexOperations sessionIndexOps;
    @Mock private IndexOperations jtiIndexOps;

    @InjectMocks private RfpbMongoIndexInitializer initializer;

    @BeforeEach
    void wireIndexOps() {
        when(mongoTemplate.indexOps(RfpbSession.class)).thenReturn(sessionIndexOps);
        when(mongoTemplate.indexOps(RfpbLaunchJti.class)).thenReturn(jtiIndexOps);
    }

    @Test
    void ensuresTtlAndCompoundIndexes_withCorrectSpecs() {
        initializer.ensureRfpbIndexes();

        ArgumentCaptor<IndexDefinition> sessionCaptor = ArgumentCaptor.forClass(IndexDefinition.class);
        verify(sessionIndexOps, times(2)).ensureIndex(sessionCaptor.capture());

        ArgumentCaptor<IndexDefinition> jtiCaptor = ArgumentCaptor.forClass(IndexDefinition.class);
        verify(jtiIndexOps).ensureIndex(jtiCaptor.capture());

        List<IndexDefinition> sessionSpecs = sessionCaptor.getAllValues();

        // 1. TTL on rfpb_sessions.expiresAt — expireAfterSeconds: 0
        IndexDefinition ttlSession = sessionSpecs.get(0);
        assertThat(ttlSession).isInstanceOf(Index.class);
        Document ttlSessionKeys = ttlSession.getIndexKeys();
        Document ttlSessionOpts = ttlSession.getIndexOptions();
        assertThat(ttlSessionKeys.keySet()).containsExactly("expiresAt");
        assertThat(ttlSessionOpts.getString("name")).isEqualTo("idx_rfpb_sessions_expiresAt");
        assertThat(ttlSessionOpts.get("expireAfterSeconds")).isEqualTo(0L);

        // 2. Compound on (showToken, pageId, revokedAt) — no TTL
        IndexDefinition compound = sessionSpecs.get(1);
        Document compoundKeys = compound.getIndexKeys();
        Document compoundOpts = compound.getIndexOptions();
        assertThat(compoundKeys.keySet()).containsExactly("showToken", "pageId", "revokedAt");
        assertThat(compoundOpts.getString("name"))
                .isEqualTo("idx_rfpb_sessions_showToken_pageId_revokedAt");
        assertThat(compoundOpts).doesNotContainKey("expireAfterSeconds");

        // 3. TTL on rfpb_launch_jtis.expiresAt — expireAfterSeconds: 0
        IndexDefinition ttlJti = jtiCaptor.getValue();
        Document ttlJtiKeys = ttlJti.getIndexKeys();
        Document ttlJtiOpts = ttlJti.getIndexOptions();
        assertThat(ttlJtiKeys.keySet()).containsExactly("expiresAt");
        assertThat(ttlJtiOpts.getString("name")).isEqualTo("idx_rfpb_launch_jtis_expiresAt");
        assertThat(ttlJtiOpts.get("expireAfterSeconds")).isEqualTo(0L);
    }

    @Test
    void singleIndexFailure_doesNotPreventTheRest() {
        // First sessionIndexOps.ensureIndex call (TTL) throws; the second
        // (compound) and the jti TTL must still be attempted.
        doThrow(new RuntimeException("simulated drift on existing index spec"))
                .when(sessionIndexOps).ensureIndex(any(IndexDefinition.class));

        initializer.ensureRfpbIndexes();

        verify(sessionIndexOps, times(2)).ensureIndex(any(IndexDefinition.class));
        verify(jtiIndexOps).ensureIndex(any(IndexDefinition.class));
    }
}
