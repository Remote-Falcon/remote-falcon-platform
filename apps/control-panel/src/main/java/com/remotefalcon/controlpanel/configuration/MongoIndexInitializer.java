package com.remotefalcon.controlpanel.configuration;

import com.remotefalcon.library.documents.Show;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;
import org.springframework.data.mongodb.core.query.Collation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Component;

/**
 * Ensures the production indexes on the {@code show} collection exist at startup.
 *
 * <p>Historically these indexes were applied imperatively via {@code mongosh} against
 * the live cluster, which left fresh environments (local dev, new clusters, ephemeral
 * test envs) silently unindexed until someone remembered to run the script. Wiring
 * them into {@link ApplicationReadyEvent} makes the bootstrap automatic and idempotent:
 * {@link org.springframework.data.mongodb.core.index.IndexOperations#ensureIndex}
 * creates the index if missing, no-ops if an identical spec already exists, and throws
 * if the existing spec differs (which is the desired safety net for accidental drift).
 *
 * <p>Each index is wrapped in its own try/catch so a single failure (e.g. a unique
 * constraint violated by post-restore duplicate data) doesn't prevent the rest from
 * being applied. Failures log at ERROR and are visible at deploy time.
 *
 * <p>Indexes ensured:
 * <ul>
 *   <li>{@code idx_showToken} — unique on {@code showToken}; every authed
 *       control-panel call + every plugin heartbeat resolves through this.</li>
 *   <li>{@code idx_email_ci} — unique on {@code email} with case-insensitive
 *       collation ({@code locale: "en", strength: 2}); login/signup/reset paths.</li>
 *   <li>{@code idx_showSubdomain} — unique on {@code showSubdomain}; every viewer
 *       page load + write, plus signUp's uniqueness check.</li>
 *   <li>{@code idx_fppHeartbeat_enabled} — partial on {@code lastFppHeartbeat} for
 *       shows with FPP heartbeat alerts enabled; backs the 5-min scheduled job that
 *       previously scanned the full collection.</li>
 *   <li>{@code idx_apiAccessToken} — sparse on {@code apiAccess.apiAccessToken};
 *       external-api authenticates every request through this field.</li>
 *   <li>{@code idx_passwordResetLink} — sparse on {@code passwordResetLink}; reset
 *       flow lookup.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MongoIndexInitializer {

  private final MongoTemplate mongoTemplate;

  @EventListener(ApplicationReadyEvent.class)
  public void ensureShowIndexes() {
    long start = System.currentTimeMillis();

    ensure("idx_showToken",
        new Index()
            .on("showToken", Sort.Direction.ASC)
            .named("idx_showToken")
            .unique()
    );

    ensure("idx_email_ci",
        new Index()
            .on("email", Sort.Direction.ASC)
            .named("idx_email_ci")
            .unique()
            .collation(Collation.of("en").strength(Collation.ComparisonLevel.secondary()))
    );

    // Case-insensitive collation index on showName, used by the admin
    // show-name autosuggest (ShowRepository.findByShowNameStartingWithIgnoreCase).
    // Without this index, the autosuggest query falls back to a full
    // COLLSCAN on every keystroke (~5,000+ docs in prod), making the
    // admin search effectively unusable.
    //
    // Collation strength=2 means case-insensitive but accent-sensitive.
    // The repository query MUST set a matching collation or Mongo won't
    // use this index. NOT unique (multiple shows can share a name across
    // owners, though that's rare).
    ensure("idx_showName_ci",
        new Index()
            .on("showName", Sort.Direction.ASC)
            .named("idx_showName_ci")
            .collation(Collation.of("en").strength(Collation.ComparisonLevel.secondary()))
    );

    ensure("idx_showSubdomain",
        new Index()
            .on("showSubdomain", Sort.Direction.ASC)
            .named("idx_showSubdomain")
            .unique()
    );

    // Partial: only shows that have opted into FPP heartbeat alerts get an entry.
    // Cron query: { 'preferences.notificationPreferences.enableFppHeartbeat': true,
    //               lastFppHeartbeat: { $lt: cutoff } }
    ensure("idx_fppHeartbeat_enabled",
        new Index()
            .on("lastFppHeartbeat", Sort.Direction.ASC)
            .named("idx_fppHeartbeat_enabled")
            .partial(PartialIndexFilter.of(
                Criteria.where("preferences.notificationPreferences.enableFppHeartbeat").is(true)
            ))
    );

    // Sparse: most shows don't have apiAccess configured. Only indexed entries
    // exist for shows with an apiAccessToken set, keeping the index tiny.
    ensure("idx_apiAccessToken",
        new Index()
            .on("apiAccess.apiAccessToken", Sort.Direction.ASC)
            .named("idx_apiAccessToken")
            .sparse()
    );

    // Sparse: passwordResetLink is null/absent except during an active reset window.
    ensure("idx_passwordResetLink",
        new Index()
            .on("passwordResetLink", Sort.Direction.ASC)
            .named("idx_passwordResetLink")
            .sparse()
    );

    log.info("Show collection indexes ensured in {} ms",
             System.currentTimeMillis() - start);
  }

  private void ensure(String name, Index spec) {
    try {
      mongoTemplate.indexOps(Show.class).ensureIndex(spec);
      log.info("Ensured Show index: {}", name);
    } catch (Exception e) {
      // Each index is independent — log loudly and let startup proceed so other
      // indexes still get applied. Most likely cause is a spec mismatch against an
      // existing index of the same name, or a unique-constraint violation from
      // bad data post-restore.
      log.error("Failed to ensure Show index '{}': {}", name, e.getMessage(), e);
    }
  }
}
