package com.remotefalcon.controlpanel.service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Date;

import com.mongodb.MongoTimeoutException;
import com.mongodb.client.FindIterable;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.ReplaceOptions;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The persisted platform-outage cohort. It has to live in Mongo, not in
 * memory: SchedulerLock hands each minute's tick to whichever replica wins,
 * so a cohort remembered by one pod would be invisible to the next tick.
 */
@ExtendWith(MockitoExtension.class)
class FppHealthOutageStoreTest {

    @Mock private MongoTemplate mongoTemplate;
    @Mock private MongoCollection<Document> collection;
    @Mock private FindIterable<Document> found;

    private FppHealthOutageStore store;

    @BeforeEach
    void setUp() {
        store = new FppHealthOutageStore(mongoTemplate);
        when(mongoTemplate.getCollection(FppHealthOutageStore.COLLECTION)).thenReturn(collection);
    }

    @Test
    void save_upsertsASingleDocument_andLoadReadsItBack() {
        // Date has millisecond precision; the cohort bounds only need minutes.
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MILLIS);
        FppHealthOutageStore.Outage outage = new FppHealthOutageStore.Outage(
                now.minusMinutes(7), now.minusMinutes(6), now);

        store.save(outage);

        ArgumentCaptor<Bson> filter = ArgumentCaptor.forClass(Bson.class);
        ArgumentCaptor<Document> doc = ArgumentCaptor.forClass(Document.class);
        ArgumentCaptor<ReplaceOptions> options = ArgumentCaptor.forClass(ReplaceOptions.class);
        verify(collection).replaceOne(filter.capture(), doc.capture(), options.capture());
        assertThat(options.getValue().isUpsert()).isTrue();
        assertThat(doc.getValue().getString("_id")).isEqualTo(FppHealthOutageStore.ID);
        assertThat(doc.getValue().get("cohortStart")).isInstanceOf(Date.class);

        when(collection.find(any(Bson.class))).thenReturn(found);
        when(found.first()).thenReturn(doc.getValue());
        assertThat(store.load()).contains(outage);
    }

    @Test
    void load_returnsEmpty_whenNoOutageWasEverRecorded() {
        when(collection.find(any(Bson.class))).thenReturn(found);
        when(found.first()).thenReturn(null);

        assertThat(store.load()).isEmpty();
    }

    @Test
    void load_returnsEmpty_forAMalformedDocument_ratherThanThrowingEveryMinute() {
        when(collection.find(any(Bson.class))).thenReturn(found);
        when(found.first()).thenReturn(new Document("_id", FppHealthOutageStore.ID).append("cohortStart", "x"));

        assertThat(store.load()).isEmpty();
    }

    @Test
    void save_failure_isSwallowed() {
        // The suppression decision for THIS tick is already made in memory;
        // failing to remember it must not abort the task's sweeps.
        when(collection.replaceOne(any(Bson.class), any(Document.class), any(ReplaceOptions.class)))
                .thenThrow(new MongoTimeoutException("timeout"));
        LocalDateTime now = LocalDateTime.now();

        assertDoesNotThrow(() -> store.save(new FppHealthOutageStore.Outage(now, now, now)));
    }
}
