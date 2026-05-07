package com.remotefalcon.service;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.HashMap;
import java.util.Map;

/**
 * Boots a MongoDB container and wires its connection string into Quarkus
 * configuration so {@link AccountArchiveService} resolves it via CDI just
 * like in production.
 */
public class AccountArchiveTestResource implements QuarkusTestResourceLifecycleManager {

    private static MongoDBContainer mongo;

    @Override
    public Map<String, String> start() {
        mongo = new MongoDBContainer(DockerImageName.parse("mongo:7.0"))
                .withReuse(false);
        mongo.start();

        Map<String, String> conf = new HashMap<>();
        conf.put("quarkus.mongodb.connection-string", mongo.getReplicaSetUrl());
        conf.put("quarkus.mongodb.database", "remote-falcon");
        // Keep the @Scheduled cron paused so deterministic test invocations
        // are not racing the real scheduler.
        conf.put("quarkus.scheduler.enabled", "false");
        // The application.properties references ${MONGO_URI} as a fallback
        // for some tooling; provide a value so config resolution succeeds.
        conf.put("MONGO_URI", mongo.getReplicaSetUrl());
        return conf;
    }

    @Override
    public void stop() {
        if (mongo != null) {
            mongo.stop();
            mongo = null;
        }
    }

    public static MongoDBContainer mongo() {
        return mongo;
    }
}
