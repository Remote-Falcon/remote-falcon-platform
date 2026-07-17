package com.remotefalcon.resource;

import com.mongodb.client.MongoClient;
import com.remotefalcon.service.MongoBackupTestResource;
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
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPOutputStream;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;

/**
 * HTTP-level tests for {@link BackupResource}. Auth comes from the
 * {@code backup.auth.token} config the test resource pins to "test-token";
 * the backing Mongo + LocalStack S3 containers are the same ones the
 * service-level tests use.
 */
@QuarkusTest
@QuarkusTestResource(MongoBackupTestResource.class)
class BackupResourceTest {

    private static final String TOKEN_HEADER = "X-Backup-Token";
    private static final String VALID_TOKEN = "test-token";

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

        var db = mongoClient.getDatabase("remote-falcon");
        db.getCollection("show").drop();
        db.getCollection("show").insertOne(new Document()
                .append("showSubdomain", "resource-test-show")
                .append("email", "fixture@remotefalcon.test"));
    }

    @AfterEach
    void tearDown() {
        if (adminS3 != null) {
            adminS3.close();
        }
    }

    @Test
    void trigger_withoutToken_isUnauthorized() {
        given().when().post("/backup/trigger").then().statusCode(401);
    }

    @Test
    void trigger_withWrongToken_isUnauthorized() {
        given().header(TOKEN_HEADER, "nope")
                .when().post("/backup/trigger")
                .then().statusCode(401);
    }

    @Test
    void trigger_withValidToken_runsBackup() {
        given().header(TOKEN_HEADER, VALID_TOKEN)
                .when().post("/backup/trigger")
                .then().statusCode(200)
                .body(containsString("Backup completed successfully"));
    }

    @Test
    void restore_withoutFilename_isBadRequest() {
        given().header(TOKEN_HEADER, VALID_TOKEN)
                .when().post("/backup/restore")
                .then().statusCode(400)
                .body(containsString("filename"));
    }

    @Test
    void restore_withoutToken_isUnauthorized() {
        given().queryParam("filename", "mongo-backup-20990101-000000.gz")
                .when().post("/backup/restore")
                .then().statusCode(401);
    }

    @Test
    void restore_unknownFilename_isServerError() {
        given().header(TOKEN_HEADER, VALID_TOKEN)
                .queryParam("filename", "mongo-backup-does-not-exist.gz")
                .when().post("/backup/restore")
                .then().statusCode(500)
                .body(containsString("Restore failed"));
    }

    @Test
    void restore_withSeededBackup_restoresDocuments() throws Exception {
        // Hand-craft a minimal backup object (COLLECTION header + one JSON
        // document per line — the format createMongoBackup writes).
        String filename = "mongo-backup-20990101-000000.gz";
        byte[] gz;
        try (var baos = new ByteArrayOutputStream()) {
            try (var gzos = new GZIPOutputStream(baos);
                 var writer = new OutputStreamWriter(gzos, StandardCharsets.UTF_8)) {
                writer.write("COLLECTION:show\n");
                writer.write(new Document().append("showSubdomain", "restored-show").toJson());
                writer.write("\n");
            }
            gz = baos.toByteArray();
        }
        adminS3.putObject(PutObjectRequest.builder()
                        .bucket(bucket)
                        .key("mongo-backups/" + filename)
                        .contentType("application/gzip")
                        .build(),
                RequestBody.fromBytes(gz));

        given().header(TOKEN_HEADER, VALID_TOKEN)
                .queryParam("filename", filename)
                .when().post("/backup/restore")
                .then().statusCode(200)
                .body(containsString("Restore completed successfully"));

        var docs = mongoClient.getDatabase("remote-falcon")
                .getCollection("show")
                .find(new Document("showSubdomain", "restored-show"));
        assertThat(docs.first()).isNotNull();
    }
}
