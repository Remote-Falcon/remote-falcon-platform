package com.remotefalcon.service;

import com.mongodb.client.MongoClient;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.bson.Document;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.localstack.LocalStackContainer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteBucketRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Integration tests for {@link MongoBackupService}.
 *
 * Boots Mongo + LocalStack S3 via {@link MongoBackupTestResource}, seeds a
 * canonical Show document into Mongo, and asserts that the scheduled backup
 * pipeline writes a correctly-named gzip object into the configured bucket,
 * deletes objects beyond the retention window, and survives S3 failures
 * without crashing.
 */
@QuarkusTest
@QuarkusTestResource(MongoBackupTestResource.class)
class MongoBackupServiceTest {

    private static final Pattern BACKUP_KEY_PATTERN =
            Pattern.compile("^mongo-backups/mongo-backup-\\d{8}-\\d{6}\\.gz$");

    @Inject
    MongoBackupService service;

    @Inject
    MongoClient mongoClient;

    @ConfigProperty(name = "s3.bucket.name")
    String bucket;

    private S3Client adminS3;

    @BeforeEach
    void setUp() {
        LocalStackContainer ls = MongoBackupTestResource.localstack();
        adminS3 = S3Client.builder()
                .endpointOverride(ls.getEndpointOverride(LocalStackContainer.Service.S3))
                .region(Region.of(ls.getRegion()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(ls.getAccessKey(), ls.getSecretKey())))
                .forcePathStyle(true)
                .build();

        // Empty the bucket so each test starts clean.
        emptyBucket();

        // Seed Mongo with a Show-like document so the dump has content.
        var db = mongoClient.getDatabase("remote-falcon");
        db.getCollection("show").drop();
        db.getCollection("show").insertOne(new Document()
                .append("showSubdomain", "test-show")
                .append("email", "fixture@remotefalcon.test")
                .append("showName", "Fixture Show"));
    }

    @AfterEach
    void tearDown() {
        if (adminS3 != null) {
            adminS3.close();
        }
    }

    @Test
    void runBackup_uploadsObjectMatchingKeyPattern() {
        service.runArchiveProcess();

        List<S3Object> objects = listAll();
        assertThat(objects)
                .as("backup should produce at least one object")
                .isNotEmpty();
        assertThat(objects)
                .extracting(S3Object::key)
                .as("each backup key should match mongo-backups/mongo-backup-YYYYMMDD-HHMMSS.gz")
                .allSatisfy(k -> assertThat(BACKUP_KEY_PATTERN.matcher(k).matches())
                        .withFailMessage("key %s did not match expected pattern", k)
                        .isTrue());
    }

    @Test
    void runBackup_writesToConfiguredBucket() {
        assertThat(bucket).isEqualTo(MongoBackupTestResource.BUCKET);

        service.runArchiveProcess();

        List<S3Object> objects = listAll();
        assertThat(objects).isNotEmpty();
        // Object content should be non-trivial (gzip header + at least one document).
        assertThat(objects.get(0).size()).isPositive();
    }

    @Test
    void retention_deletesOldObjects() {
        // Pre-seed a backup well outside the 21-day retention window.
        String oldKey = "mongo-backups/mongo-backup-20240101-000000.gz";
        adminS3.putObject(PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(oldKey)
                        .contentType("application/gzip")
                        .build(),
                RequestBody.fromString("legacy"));

        // And one within the retention window (today, but a synthetic far-future-looking key
        // is awkward; seed yesterday so it survives cleanup).
        String recentKey = "mongo-backups/mongo-backup-"
                + java.time.LocalDateTime.now().minusDays(1)
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"))
                + ".gz";
        adminS3.putObject(PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(recentKey)
                        .contentType("application/gzip")
                        .build(),
                RequestBody.fromString("recent"));

        service.runArchiveProcess();

        List<String> keys = listAll().stream().map(S3Object::key).toList();
        assertThat(keys)
                .as("old backup outside retention window should be deleted")
                .doesNotContain(oldKey);
        assertThat(keys)
                .as("recent backup within retention window should survive")
                .contains(recentKey);
        assertThat(keys)
                .as("a fresh backup from this run should be present")
                .anyMatch(k -> BACKUP_KEY_PATTERN.matcher(k).matches() && !k.equals(recentKey));
    }

    @Test
    void s3Failure_logsWithoutCrashing() {
        // Drop the bucket so PutObject fails with NoSuchBucket. The service catches
        // all exceptions in runArchiveProcess and logs them; nothing should bubble.
        try {
            emptyBucket();
            adminS3.deleteBucket(DeleteBucketRequest.builder().bucket(bucket).build());
        } catch (Exception ignored) {
            // already gone
        }

        assertThatCode(() -> service.runArchiveProcess())
                .as("scheduled job must swallow S3 failures so the pod stays alive")
                .doesNotThrowAnyException();

        // Recreate the bucket so subsequent tests (if any) and tearDown stay healthy.
        try {
            adminS3.createBucket(b -> b.bucket(bucket));
        } catch (Exception ignored) {
            // recreation race is fine
        }
    }

    // ---------- helpers ----------

    private List<S3Object> listAll() {
        ListObjectsV2Response resp;
        try {
            resp = adminS3.listObjectsV2(ListObjectsV2Request.builder()
                    .bucket(bucket)
                    .prefix("mongo-backups/")
                    .build());
        } catch (NoSuchBucketException e) {
            return List.of();
        }
        return resp.contents();
    }

    private void emptyBucket() {
        try {
            ListObjectsV2Response resp = adminS3.listObjectsV2(ListObjectsV2Request.builder()
                    .bucket(bucket)
                    .build());
            for (S3Object o : resp.contents()) {
                adminS3.deleteObject(DeleteObjectRequest.builder()
                        .bucket(bucket)
                        .key(o.key())
                        .build());
            }
        } catch (NoSuchBucketException ignored) {
            // bucket missing — nothing to empty
        }
    }
}
