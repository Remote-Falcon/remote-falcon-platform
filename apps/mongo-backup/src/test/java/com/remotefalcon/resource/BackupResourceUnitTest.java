package com.remotefalcon.resource;

import com.remotefalcon.service.MongoBackupService;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Plain unit tests for the {@link BackupResource} paths the HTTP-level tests
 * can't reach: the deploy-misconfiguration guard (no auth token configured →
 * everything 401s, a secure default) and triggerBackup's catch block (only
 * reachable when the service throws before its own try — runArchiveProcess
 * swallows its internal failures). Fields are package-visible, so no CDI or
 * containers needed.
 */
class BackupResourceUnitTest {

    @Test
    void blankConfiguredToken_rejectsEveryRequest() {
        BackupResource resource = new BackupResource();
        resource.authToken = "";

        Response response = resource.triggerBackup("any-token");

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void trigger_whenServiceThrows_returnsServerError() {
        BackupResource resource = new BackupResource();
        resource.authToken = "tok";
        resource.backupService = new MongoBackupService() {
            @Override
            public void runArchiveProcess() {
                throw new RuntimeException("boom");
            }
        };

        Response response = resource.triggerBackup("tok");

        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(String.valueOf(response.getEntity())).contains("Backup failed: boom");
    }
}
