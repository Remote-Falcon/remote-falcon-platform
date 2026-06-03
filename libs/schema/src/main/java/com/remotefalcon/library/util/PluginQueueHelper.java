package com.remotefalcon.library.util;

import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Shared helpers for classifying queue items across PSA-v2 code paths.
 *
 * <p>The {@code Show} document ships in two parallel variants
 * ({@link com.remotefalcon.library.documents.Show Spring} and
 * {@link com.remotefalcon.library.quarkus.entity.Show Quarkus}) that don't
 * share a supertype. Each public helper is overloaded for both variants;
 * both overloads delegate to the same private field-level implementation
 * so behavior is provably identical across stacks.
 *
 * <p>Three categories of queue items matter for PSA-v2:
 * <ul>
 *   <li><b>Songs</b> — actual audience-facing music sequences. Count against
 *       {@code jukeboxDepth} (Q3) and tick the PSA cadence counter (Q4).</li>
 *   <li><b>PSAs</b> — operator-policy interstitials defined in
 *       {@code Show.psaSequences[]}. Bypass {@code jukeboxDepth} and are
 *       transparent to the cadence counter.</li>
 *   <li><b>Leaders</b> — operator-policy "you requested this!" intro
 *       sequences defined by {@code Show.requestLeaderSequence} and
 *       {@code Show.voteLeaderSequence}. Same treatment as PSAs for cap
 *       and cadence math (Q6).</li>
 * </ul>
 *
 * <p>All methods are null-safe on every input — a Show that's mid-migration
 * (no {@code psaSequences}, no leader fields) behaves as "no non-song items
 * defined," which is the correct degenerate behavior.
 */
public final class PluginQueueHelper {

    private PluginQueueHelper() {
        // utility class — not instantiable
    }

    // ---------- nonSongNames ----------

    /**
     * Returns the set of all names that classify as "non-song" queue items on
     * the given Spring Show: every {@code PsaSequence.name} plus the two
     * optional leader sequence names, with null/empty entries filtered out.
     */
    public static Set<String> nonSongNames(com.remotefalcon.library.documents.Show s) {
        if (s == null) {
            return Collections.emptySet();
        }
        return nonSongNames(s.getPsaSequences(), s.getRequestLeaderSequence(), s.getVoteLeaderSequence());
    }

    /**
     * Returns the set of all names that classify as "non-song" queue items on
     * the given Quarkus Show.
     */
    public static Set<String> nonSongNames(com.remotefalcon.library.quarkus.entity.Show s) {
        if (s == null) {
            return Collections.emptySet();
        }
        return nonSongNames(s.getPsaSequences(), s.getRequestLeaderSequence(), s.getVoteLeaderSequence());
    }

    private static Set<String> nonSongNames(List<PsaSequence> psaSequences,
                                            String requestLeaderSequence,
                                            String voteLeaderSequence) {
        // Case-INSENSITIVE membership: FPP reports sequence names verbatim
        // (e.g. "psa1") while operators store PSA/leader names as free text
        // (e.g. "PSA1"). Every other name comparison in the plugin/viewer
        // services uses equalsIgnoreCase; this set must match. A
        // CASE_INSENSITIVE_ORDER TreeSet keeps the original-case strings but
        // makes contains() case-insensitive, so isSongLike/countViewerRequests
        // classify a case-skewed PSA correctly.
        Set<String> result = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        if (psaSequences != null) {
            for (PsaSequence psa : psaSequences) {
                if (psa == null) continue;
                String name = psa.getName();
                if (name != null && !name.isEmpty()) {
                    result.add(name);
                }
            }
        }
        if (requestLeaderSequence != null && !requestLeaderSequence.isEmpty()) {
            result.add(requestLeaderSequence);
        }
        if (voteLeaderSequence != null && !voteLeaderSequence.isEmpty()) {
            result.add(voteLeaderSequence);
        }
        return result;
    }

    // ---------- isSongLike ----------

    /**
     * Returns true when {@code name} is NOT in {@link #nonSongNames(com.remotefalcon.library.documents.Show)}.
     * A null or empty name is treated as not-song-like (false). Used as the
     * Q2 skip predicate when reporting NEXT_PLAYLIST.
     */
    public static boolean isSongLike(com.remotefalcon.library.documents.Show s, String name) {
        if (name == null || name.isEmpty()) {
            return false;
        }
        return !nonSongNames(s).contains(name);
    }

    /**
     * Returns true when {@code name} is NOT in {@link #nonSongNames(com.remotefalcon.library.quarkus.entity.Show)}.
     */
    public static boolean isSongLike(com.remotefalcon.library.quarkus.entity.Show s, String name) {
        if (name == null || name.isEmpty()) {
            return false;
        }
        return !nonSongNames(s).contains(name);
    }

    // ---------- countViewerRequests ----------

    /**
     * Counts entries in {@code s.getRequests()} whose sequence name is
     * song-like. Used by Q3's {@code isQueueFull} to enforce
     * {@code jukeboxDepth} against viewer-driven requests only.
     */
    public static int countViewerRequests(com.remotefalcon.library.documents.Show s) {
        if (s == null) {
            return 0;
        }
        return countViewerRequests(s.getRequests(), nonSongNames(s));
    }

    public static int countViewerRequests(com.remotefalcon.library.quarkus.entity.Show s) {
        if (s == null) {
            return 0;
        }
        return countViewerRequests(s.getRequests(), nonSongNames(s));
    }

    private static int countViewerRequests(List<Request> requests, Set<String> nonSong) {
        if (requests == null || requests.isEmpty()) {
            return 0;
        }
        int count = 0;
        for (Request r : requests) {
            if (r == null) continue;
            Sequence seq = r.getSequence();
            if (seq == null) continue;
            String name = seq.getName();
            if (name == null || name.isEmpty()) continue;
            if (!nonSong.contains(name)) {
                count++;
            }
        }
        return count;
    }

    // ---------- isPsaSequence ----------

    /**
     * Returns true when {@code name} matches any {@code PsaSequence.name} on
     * the show. Used by the Q4 cadence counter fix to skip ticking on PSA
     * playback.
     */
    public static boolean isPsaSequence(com.remotefalcon.library.documents.Show s, String name) {
        if (s == null || name == null || name.isEmpty()) {
            return false;
        }
        return isPsaSequence(s.getPsaSequences(), name);
    }

    public static boolean isPsaSequence(com.remotefalcon.library.quarkus.entity.Show s, String name) {
        if (s == null || name == null || name.isEmpty()) {
            return false;
        }
        return isPsaSequence(s.getPsaSequences(), name);
    }

    private static boolean isPsaSequence(List<PsaSequence> psaSequences, String name) {
        if (psaSequences == null || psaSequences.isEmpty()) {
            return false;
        }
        for (PsaSequence psa : psaSequences) {
            if (psa == null) continue;
            // Case-insensitive: see nonSongNames. `name` is guaranteed
            // non-null by the public overloads; a null psa.getName() yields
            // false (String.equalsIgnoreCase handles a null argument).
            if (name.equalsIgnoreCase(psa.getName())) {
                return true;
            }
        }
        return false;
    }
}
