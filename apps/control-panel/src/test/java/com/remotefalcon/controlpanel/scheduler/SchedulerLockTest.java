package com.remotefalcon.controlpanel.scheduler;

import com.mongodb.MongoWriteException;
import com.mongodb.ServerAddress;
import com.mongodb.WriteError;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.UpdateOptions;
import com.mongodb.client.result.UpdateResult;
import org.bson.BsonDocument;
import org.bson.BsonString;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Cross-replica mutual exclusion for the @Scheduled tasks.
 *
 * <p>The contract that matters: exactly one replica may run a task per tick,
 * and a lock store that is down or contended must never propagate an exception
 * into the scheduler thread (an escaping exception from the every-minute cron
 * would take the recovery and TTL sweeps down with it).
 */
@ExtendWith(MockitoExtension.class)
class SchedulerLockTest {

    @Mock private MongoTemplate mongoTemplate;
    @Mock private MongoCollection<Document> collection;

    private SchedulerLock schedulerLock;

    @BeforeEach
    void setUp() {
        schedulerLock = new SchedulerLock(mongoTemplate);
        when(mongoTemplate.getCollection(SchedulerLock.COLLECTION)).thenReturn(collection);
    }

    private void respondWith(UpdateResult result) {
        when(collection.updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class)))
                .thenReturn(result);
    }

    @Test
    void winsWhenTheLockDocumentDidNotExistYet() {
        respondWith(UpdateResult.acknowledged(0, 0L, new BsonString("fppHeartbeatTask")));
        assertThat(schedulerLock.tryAcquire("fppHeartbeatTask", Duration.ofSeconds(50))).isTrue();
    }

    @Test
    void winsWhenTheExistingLockHadAlreadyExpired() {
        respondWith(UpdateResult.acknowledged(1, 1L, null));
        assertThat(schedulerLock.tryAcquire("fppHeartbeatTask", Duration.ofSeconds(50))).isTrue();
    }

    @Test
    void losesWhenAnotherReplicaHoldsALiveLock() {
        // A live lock fails the lockedUntil predicate, so the upsert falls
        // through to an INSERT and collides on _id. That duplicate key IS the
        // mutual exclusion — it must read as "lost", not as an error.
        when(collection.updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class)))
                .thenThrow(new MongoWriteException(
                        new WriteError(11000, "E11000 duplicate key error", new BsonDocument()),
                        new ServerAddress()));

        assertThat(schedulerLock.tryAcquire("fppHeartbeatTask", Duration.ofSeconds(50))).isFalse();
    }

    @Test
    void failsClosedWhenTheLockStoreIsUnreachable() {
        // Skipping one tick is strictly cheaper than every replica proceeding
        // unguarded, which is the stampede this class exists to prevent.
        when(collection.updateOne(any(Bson.class), any(Bson.class), any(UpdateOptions.class)))
                .thenThrow(new IllegalStateException("no primary available"));

        assertThat(schedulerLock.tryAcquire("nightlyMaintenance", Duration.ofMinutes(30))).isFalse();
    }

    @Test
    void claimsByNameAndOnlyWhenTheHeldLockHasLapsed() {
        respondWith(UpdateResult.acknowledged(1, 1L, null));
        schedulerLock.tryAcquire("nightlyMaintenance", Duration.ofMinutes(30));

        ArgumentCaptor<Bson> filter = ArgumentCaptor.forClass(Bson.class);
        ArgumentCaptor<UpdateOptions> options = ArgumentCaptor.forClass(UpdateOptions.class);
        verify(collection).updateOne(filter.capture(), any(Bson.class), options.capture());

        Document captured = (Document) filter.getValue();
        assertThat(captured.get("_id")).isEqualTo("nightlyMaintenance");
        // Without the lockedUntil predicate the update would steal a live lock
        // instead of colliding, and the whole mechanism would silently no-op.
        assertThat(captured.get("lockedUntil", Document.class)).containsKey("$lte");
        // Without upsert the very first run could never create the document.
        assertThat(options.getValue().isUpsert()).isTrue();
    }

    @Test
    void locksAreScopedPerTaskName() {
        respondWith(UpdateResult.acknowledged(1, 1L, null));
        schedulerLock.tryAcquire("fppHeartbeatTask", Duration.ofSeconds(50));

        ArgumentCaptor<Bson> filter = ArgumentCaptor.forClass(Bson.class);
        verify(collection).updateOne(filter.capture(), any(Bson.class), any(UpdateOptions.class));
        assertThat(((Document) filter.getValue()).get("_id")).isEqualTo("fppHeartbeatTask");
        verify(mongoTemplate).getCollection(eq(SchedulerLock.COLLECTION));
    }
}
