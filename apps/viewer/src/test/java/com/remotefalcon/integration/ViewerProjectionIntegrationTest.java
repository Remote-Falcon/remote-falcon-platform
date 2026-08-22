package com.remotefalcon.integration;

import com.remotefalcon.library.models.HeartbeatGap;
import com.remotefalcon.library.models.MfaConfig;
import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.Stat;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.models.ViewerSession;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Contract test for {@link ShowRepository#findByShowSubdomainForViewer} — the
 * projection behind the per-viewer 5-second poll, the highest-frequency read
 * in the platform.
 *
 * <p>Two reasons this projection deserves a pinned contract. Security: the
 * viewer GraphQL schema is code-first, so every non-excluded entity field is
 * queryable on a PUBLIC endpoint — {@code mfa} (added to Show in July 2026,
 * after the exclusion list was written) sat fetchable until the 2026-08-22
 * audit. Cost: fields left in this projection are shipped and decoded 720
 * times per hour per open viewer page whether or not anything reads them —
 * that is how full page HTML and the entire dwell-session history rode along
 * unnoticed.
 */
@QuarkusTest
@QuarkusTestResource(MongoTestResource.class)
class ViewerProjectionIntegrationTest {

  @Inject
  ShowRepository showRepository;

  private static final String SUBDOMAIN = "projection-contract-show";

  @BeforeEach
  void setUp() {
    showRepository.findByShowSubdomain(SUBDOMAIN)
        .ifPresent(show -> showRepository.delete(show));

    LocalDateTime now = LocalDateTime.now();
    Show show = new Show();
    show.setShowToken("tok-projection");
    show.setShowSubdomain(SUBDOMAIN);
    show.setShowName("Projection Contract");
    show.setEmail("owner@example.com");
    show.setPassword("$2a$10$hash");
    show.setLastLoginIp("10.0.0.1");
    show.setPreferences(Preference.builder().viewerControlEnabled(true).build());
    show.setSequences(new ArrayList<>(List.of(
        Sequence.builder().name("Wizards").displayName("Wizards in Winter").build())));
    show.setMfa(MfaConfig.builder().build());
    show.setViewerSessions(new ArrayList<>(List.of(
        ViewerSession.builder().ip("9.9.9.9").lastSeen(now).build())));
    show.setHeartbeatGaps(new ArrayList<>(List.of(
        HeartbeatGap.builder().startedAt(now.minusHours(2)).endedAt(now.minusHours(1)).build())));
    show.setPages(new ArrayList<>(List.of(
        ViewerPage.builder().name("home").active(true)
            .html("<html>operator-authored, potentially 1MB</html>").build())));
    show.setStats(Stat.builder()
        .rejectedRequests(new ArrayList<>(List.of(
            Stat.RejectedRequest.builder().reason("full").dateTime(now).build())))
        .build());
    showRepository.persist(show);
  }

  @AfterEach
  void tearDown() {
    showRepository.findByShowSubdomain(SUBDOMAIN)
        .ifPresent(show -> showRepository.delete(show));
  }

  @Test
  void forViewer_dropsSecretsAndOperatorTelemetry_keepsWhatThePageRenders() {
    Show viewer = showRepository.findByShowSubdomainForViewer(SUBDOMAIN).orElseThrow();

    // Kept — what the viewer page actually renders from.
    assertNotNull(viewer.getPreferences());
    assertNotNull(viewer.getSequences());
    assertFalse(viewer.getSequences().isEmpty());

    // Never on a public endpoint: credentials, tokens, second factor.
    assertNull(viewer.getShowToken());
    assertNull(viewer.getEmail());
    assertNull(viewer.getPassword());
    assertNull(viewer.getLastLoginIp());
    assertNull(viewer.getMfa(),
        "mfa must never ride the public viewer read — the code-first schema "
            + "exposes every non-excluded field");

    // Operator telemetry the viewer never reads (2026-08-22 additions).
    assertNull(viewer.getViewerSessions());
    assertNull(viewer.getHeartbeatGaps());
    if (viewer.getStats() != null) {
      assertNull(viewer.getStats().getRejectedRequests());
    }
  }

  @Test
  void forViewer_keepsPageMetadata_dropsOnlyTheHtml() {
    // Deliberately pages.html, not pages: the code-first schema exposes
    // pages{} to custom viewer pages, and getShow's filterActivePageOnly
    // needs the metadata. Only the heavy operator-authored HTML — which has
    // its own dedicated getActiveViewerPage query with ETag caching — is cut
    // from the poll.
    Show viewer = showRepository.findByShowSubdomainForViewer(SUBDOMAIN).orElseThrow();

    assertNotNull(viewer.getPages());
    assertEquals(1, viewer.getPages().size());
    ViewerPage page = viewer.getPages().get(0);
    assertEquals("home", page.getName());
    assertTrue(Boolean.TRUE.equals(page.getActive()));
    assertNull(page.getHtml(), "pages[].html must not ride the 5s poll");
  }
}
