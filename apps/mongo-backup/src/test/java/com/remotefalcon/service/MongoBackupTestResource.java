package com.remotefalcon.service;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.containers.localstack.LocalStackContainer;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;

import java.util.HashMap;
import java.util.Map;

/**
 * Boots a MongoDB container and a LocalStack S3 container, then wires their
 * endpoints into Quarkus configuration so {@link MongoBackupService} resolves
 * them via CDI just like in production.
 */
public class MongoBackupTestResource implements QuarkusTestResourceLifecycleManager {

    public static final String BUCKET = "test-bucket-fixture";

    private static MongoDBContainer mongo;
    private static LocalStackContainer localstack;
    private static S3Client adminS3;

    @Override
    public Map<String, String> start() {
        mongo = new MongoDBContainer(DockerImageName.parse("mongo:7.0"))
                .withReuse(false);
        mongo.start();

        localstack = new LocalStackContainer(DockerImageName.parse("localstack/localstack:3.5"))
                .withServices(LocalStackContainer.Service.S3)
                .withReuse(false);
        localstack.start();

        // Pre-create bucket so the service can put objects.
        adminS3 = S3Client.builder()
                .endpointOverride(localstack.getEndpointOverride(LocalStackContainer.Service.S3))
                .region(Region.of(localstack.getRegion()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(localstack.getAccessKey(), localstack.getSecretKey())))
                .forcePathStyle(true)
                .build();
        try {
            adminS3.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
        } catch (Exception ignored) {
            // bucket may already exist on retries
        }

        Map<String, String> conf = new HashMap<>();
        conf.put("quarkus.mongodb.connection-string", mongo.getReplicaSetUrl());
        conf.put("quarkus.s3.endpoint-override",
                localstack.getEndpointOverride(LocalStackContainer.Service.S3).toString());
        conf.put("quarkus.s3.aws.region", localstack.getRegion());
        conf.put("quarkus.s3.aws.credentials.type", "static");
        conf.put("quarkus.s3.aws.credentials.static-provider.access-key-id", localstack.getAccessKey());
        conf.put("quarkus.s3.aws.credentials.static-provider.secret-access-key", localstack.getSecretKey());
        conf.put("quarkus.s3.path-style-access", "true");
        conf.put("s3.bucket.name", BUCKET);
        // Ensure scheduler is paused so the @Scheduled cron does not interfere
        // with deterministic test invocations.
        conf.put("quarkus.scheduler.enabled", "false");
        // Required env values used by application.properties.
        conf.put("BACKUP_AUTH_TOKEN", "test-token");
        conf.put("backup.auth.token", "test-token");
        return conf;
    }

    @Override
    public void stop() {
        if (adminS3 != null) {
            adminS3.close();
            adminS3 = null;
        }
        if (localstack != null) {
            localstack.stop();
            localstack = null;
        }
        if (mongo != null) {
            mongo.stop();
            mongo = null;
        }
    }

    public static LocalStackContainer localstack() {
        return localstack;
    }

    public static MongoDBContainer mongo() {
        return mongo;
    }
}
