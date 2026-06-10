package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.models.Stat;
import org.springframework.data.mongodb.repository.Aggregation;
import org.springframework.data.mongodb.repository.ExistsQuery;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Date;
import java.util.List;

/**
 * Pattern B — pushes the dashboard analytics date filter into MongoDB so the
 * analytics methods never materialize a season's worth of {@code stats.*}
 * (5–10 MB) in the JVM. Each method returns ONLY the stat entries whose
 * {@code dateTime} falls in the requested window, via:
 *
 * <pre>
 *   $match showToken  ->  $project the one stats sub-array  ->  $unwind
 *   ->  $match dateTime in [lower, upper]  ->  $replaceRoot
 * </pre>
 *
 * <p><b>Parity contract.</b> {@code DashboardService.convertStatDateTime}
 * attaches the user's zone to the stored {@code dateTime} <i>without shifting
 * it</i>, so the canonical range test is a pure wall-clock comparison done in
 * Java. To keep that the single source of truth, callers pass a window WIDENED
 * by a day on each side (see {@code DashboardService}) — these methods return a
 * <i>superset</i> of the precise in-range set, and the unchanged Java filter in
 * the {@code build*Stats} helpers trims it to the exact rows. For all
 * WELL-FORMED data the result is identical to the old full-document path. The
 * superset holds for any fixed JVM-zone offset under 24h; prod runs UTC, where
 * the stored {@code LocalDateTime} and the {@link Date} bounds share one instant
 * frame.
 *
 * <p><b>Two deliberate differences from the old path, on malformed/legacy data
 * only — both turn a 500 into a graceful 200:</b> (1) a stat element with a
 * null/absent {@code dateTime} is dropped by {@code $match} (the old build*
 * helpers had no null guard and NPE'd on it — they now guard too); (2) a
 * {@code stats != null} document with an absent sub-array yields empty buckets
 * rather than an NPE. See ShowRepositoryProjectionTest / StatsRepositoryTest /
 * DashboardServiceTest for the pinned behavior.
 *
 * <p>{@code lower}/{@code upper} are {@link Date} so they bind as BSON dates —
 * the {@code ?1}/{@code ?2} placeholders must stay UNQUOTED in the pipeline or
 * they would stringify and match nothing. Every pipeline opens with
 * {@code $match showToken}, index-backed by idx_showToken (created at startup
 * by MongoIndexInitializer).
 */
public interface StatsRepository extends MongoRepository<Show, String> {

    // Cheap existence check (idx_showToken) so analytics can preserve the
    // SHOW_NOT_FOUND behavior without loading the document.
    boolean existsByShowToken(String showToken);

    // True only when the show exists AND has a stats sub-document. Lets the
    // analytics methods reproduce the legacy "stats == null -> empty response
    // (no gap-filled days)" branch without loading the stats arrays.
    @ExistsQuery("{ 'showToken': ?0, 'stats': { '$ne': null } }")
    boolean hasStatsByShowToken(String showToken);

    @Aggregation(pipeline = {
            "{ '$match': { 'showToken': ?0 } }",
            "{ '$project': { 'items': '$stats.page' } }",
            "{ '$unwind': '$items' }",
            "{ '$match': { 'items.dateTime': { '$gte': ?1, '$lte': ?2 } } }",
            "{ '$replaceRoot': { 'newRoot': '$items' } }"
    })
    List<Stat.Page> pageStatsInRange(String showToken, Date lower, Date upper);

    @Aggregation(pipeline = {
            "{ '$match': { 'showToken': ?0 } }",
            "{ '$project': { 'items': '$stats.jukebox' } }",
            "{ '$unwind': '$items' }",
            "{ '$match': { 'items.dateTime': { '$gte': ?1, '$lte': ?2 } } }",
            "{ '$replaceRoot': { 'newRoot': '$items' } }"
    })
    List<Stat.Jukebox> jukeboxStatsInRange(String showToken, Date lower, Date upper);

    @Aggregation(pipeline = {
            "{ '$match': { 'showToken': ?0 } }",
            "{ '$project': { 'items': '$stats.voting' } }",
            "{ '$unwind': '$items' }",
            "{ '$match': { 'items.dateTime': { '$gte': ?1, '$lte': ?2 } } }",
            "{ '$replaceRoot': { 'newRoot': '$items' } }"
    })
    List<Stat.Voting> votingStatsInRange(String showToken, Date lower, Date upper);

    @Aggregation(pipeline = {
            "{ '$match': { 'showToken': ?0 } }",
            "{ '$project': { 'items': '$stats.votingWin' } }",
            "{ '$unwind': '$items' }",
            "{ '$match': { 'items.dateTime': { '$gte': ?1, '$lte': ?2 } } }",
            "{ '$replaceRoot': { 'newRoot': '$items' } }"
    })
    List<Stat.VotingWin> votingWinStatsInRange(String showToken, Date lower, Date upper);

    @Aggregation(pipeline = {
            "{ '$match': { 'showToken': ?0 } }",
            "{ '$project': { 'items': '$stats.rejectedRequests' } }",
            "{ '$unwind': '$items' }",
            "{ '$match': { 'items.dateTime': { '$gte': ?1, '$lte': ?2 } } }",
            "{ '$replaceRoot': { 'newRoot': '$items' } }"
    })
    List<Stat.RejectedRequest> rejectedRequestsInRange(String showToken, Date lower, Date upper);
}
