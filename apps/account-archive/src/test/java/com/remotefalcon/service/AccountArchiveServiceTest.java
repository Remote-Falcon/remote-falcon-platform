package com.remotefalcon.service;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Integration tests for {@link AccountArchiveService}.
 *
 * <p>Boots Mongo via {@link AccountArchiveTestResource}, seeds Show documents
 * with various {@code lastLoginDate} / {@code emailVerified} / {@code createdDate}
 * values, then asserts that:
 * <ul>
 *   <li>{@code archiveAccounts} only archives shows whose {@code lastLoginDate}
 *       is older than 24 months (or null), backing them up to the
 *       {@code remote-falcon-archive} database before deleting them from the
 *       primary {@code remote-falcon} database.</li>
 *   <li>{@code deleteUnverifiedShows} only deletes shows that are unverified
 *       AND older than 7 days; verified shows and recent unverified shows
 *       survive.</li>
 *   <li>Both processes handle empty / no-op cases without throwing.</li>
 * </ul>
 */
@QuarkusTest
@QuarkusTestResource(AccountArchiveTestResource.class)
class AccountArchiveServiceTest {

    private static final String PRIMARY_DB = "remote-falcon";
    private static final String ARCHIVE_DB = "remote-falcon-archive";
    private static final String SHOW_COLLECTION = "show";

    @Inject
    AccountArchiveService service;

    @Inject
    ShowRepository showRepository;

    @Inject
    MongoClient mongoClient;

    @BeforeEach
    void resetCollections() {
        mongoClient.getDatabase(PRIMARY_DB).getCollection(SHOW_COLLECTION).drop();
        mongoClient.getDatabase(ARCHIVE_DB).getCollection(SHOW_COLLECTION).drop();
    }

    // ---------- archiveAccounts ----------

    @Test
    void archive_removesShowsWithLastLoginBeforeCutoff() {
        Show stale = newShow("stale@test", LocalDateTime.now().minusYears(2).minusDays(1));
        Show recent = newShow("recent@test", LocalDateTime.now().minusDays(7));

        showRepository.persist(stale);
        showRepository.persist(recent);

        service.runArchiveProcess();

        assertThat(primaryEmails())
                .as("stale show is archived & removed from primary db")
                .doesNotContain("stale@test")
                .as("recent show remains in primary db")
                .contains("recent@test");
    }

    @Test
    void archive_archivesShowsWithNullLastLoginDate() {
        // The service's predicate is "lastLoginDate < cutoff OR lastLoginDate is null".
        // Shows that have never logged in (null lastLoginDate) are eligible.
        Show neverLoggedIn = newShow("never@test", null);
        showRepository.persist(neverLoggedIn);

        service.runArchiveProcess();

        assertThat(primaryEmails())
                .as("show with null lastLoginDate is archived")
                .doesNotContain("never@test");
    }

    @Test
    void archive_copiesShowToArchiveDatabaseBeforeDeleting() {
        Show stale = newShow("backup-me@test", LocalDateTime.now().minusYears(3));
        showRepository.persist(stale);

        service.runArchiveProcess();

        MongoCollection<Document> archive = mongoClient
                .getDatabase(ARCHIVE_DB)
                .getCollection(SHOW_COLLECTION);
        long archived = archive.countDocuments(new Document("email", "backup-me@test"));
        assertThat(archived)
                .as("stale show is written to remote-falcon-archive.show before being deleted")
                .isEqualTo(1L);
    }

    @Test
    void archive_handlesEmptyResultGracefully() {
        // No shows in collection — archive should run cleanly, no exceptions.
        assertThatCode(() -> service.runArchiveProcess())
                .as("archive on empty collection must not throw")
                .doesNotThrowAnyException();

        assertThat(primaryEmails()).isEmpty();
    }

    @Test
    void archive_isIdempotentForRecentShows() {
        Show recent = newShow("staying@test", LocalDateTime.now().minusDays(1));
        showRepository.persist(recent);

        service.runArchiveProcess();
        service.runArchiveProcess();

        assertThat(primaryEmails())
                .as("a recent show survives any number of archive runs")
                .containsExactly("staying@test");

        long archivedCount = mongoClient.getDatabase(ARCHIVE_DB)
                .getCollection(SHOW_COLLECTION)
                .countDocuments();
        assertThat(archivedCount)
                .as("nothing should have been written to the archive db")
                .isZero();
    }

    // ---------- deleteUnverifiedShows ----------

    @Test
    void deleteUnverified_removesUnverifiedShowsOlderThan7Days() {
        Show staleUnverified = newShow("ghost@test", LocalDateTime.now().minusDays(1));
        staleUnverified.setEmailVerified(false);
        staleUnverified.setCreatedDate(LocalDateTime.now().minusDays(30));

        showRepository.persist(staleUnverified);

        service.runDeleteUnverifiedShowsProcess();

        assertThat(primaryEmails())
                .as("stale unverified show is deleted")
                .doesNotContain("ghost@test");
    }

    @Test
    void deleteUnverified_keepsVerifiedShowsRegardlessOfAge() {
        Show oldVerified = newShow("verified@test", LocalDateTime.now().minusDays(1));
        oldVerified.setEmailVerified(true);
        oldVerified.setCreatedDate(LocalDateTime.now().minusDays(60));

        showRepository.persist(oldVerified);

        service.runDeleteUnverifiedShowsProcess();

        assertThat(primaryEmails())
                .as("verified shows are protected from the unverified-cleanup job")
                .contains("verified@test");
    }

    @Test
    void deleteUnverified_keepsRecentUnverifiedShows() {
        // Newly registered users haven't had time to click the verification email yet —
        // they must NOT be deleted by the 7-day window cleanup.
        Show recentUnverified = newShow("pending@test", LocalDateTime.now().minusHours(1));
        recentUnverified.setEmailVerified(false);
        recentUnverified.setCreatedDate(LocalDateTime.now().minusDays(2));

        showRepository.persist(recentUnverified);

        service.runDeleteUnverifiedShowsProcess();

        assertThat(primaryEmails())
                .as("unverified shows newer than 7 days survive the cleanup")
                .contains("pending@test");
    }

    @Test
    void deleteUnverified_handlesEmptyResultGracefully() {
        assertThatCode(() -> service.runDeleteUnverifiedShowsProcess())
                .as("deleteUnverified on empty collection must not throw")
                .doesNotThrowAnyException();
    }

    // ---------- helpers ----------

    /**
     * Builds a minimal Show entity. Mirrors libs/test-fixtures' ShowFactory shape
     * but targets the Quarkus Panache entity that this service actually uses
     * (libs/test-fixtures returns the Spring documents.Show, which is a
     * different class on a different classpath).
     */
    private Show newShow(String email, LocalDateTime lastLoginDate) {
        String subdomain = email.replaceAll("[^a-z0-9]+", "-");
        LocalDateTime now = LocalDateTime.now();
        return Show.builder()
                .showToken(UUID.randomUUID().toString())
                .email(email)
                .password("$2a$10$test.bcrypt.hash.placeholder")
                .showName(email + "-show")
                .showSubdomain(subdomain)
                .emailVerified(true)
                .createdDate(now.minusDays(30))
                .lastLoginDate(lastLoginDate)
                .expireDate(now.plusYears(1))
                .showRole(ShowRole.USER)
                .build();
    }

    private java.util.List<String> primaryEmails() {
        java.util.List<String> emails = new java.util.ArrayList<>();
        mongoClient.getDatabase(PRIMARY_DB)
                .getCollection(SHOW_COLLECTION)
                .find()
                .forEach(doc -> emails.add(doc.getString("email")));
        return emails;
    }
}
