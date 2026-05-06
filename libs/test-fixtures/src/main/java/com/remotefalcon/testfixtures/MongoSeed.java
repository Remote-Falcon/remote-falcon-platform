package com.remotefalcon.testfixtures;

import com.remotefalcon.library.documents.Show;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.util.Arrays;

/**
 * Helpers for seeding and clearing the {@link Show} collection in test Mongo
 * instances (typically backed by Testcontainers).
 */
public final class MongoSeed {

    private MongoSeed() {}

    /** Inserts every supplied {@link Show} into the underlying Mongo template. */
    public static void seed(MongoTemplate template, Show... shows) {
        template.insertAll(Arrays.asList(shows));
    }

    /** Drops the {@link Show} collection. Cheap, idempotent, safe in @BeforeEach. */
    public static void clear(MongoTemplate template) {
        template.dropCollection(Show.class);
    }
}
