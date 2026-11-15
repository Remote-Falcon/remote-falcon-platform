package com.remotefalcon.plugins.api.service;

import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Sequence;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * No-op detection for {@link PluginService#syncPlaylists}. The plugin re-sends
 * its full playlist on every sync, and one install looped the call at 1/s for
 * a week; each call rewrote the whole sequences and psaSequences arrays even
 * when nothing had changed.
 *
 * <p>Equality rule: the sequences syncPlaylists would write are compared with
 * the ones loaded from the document as a multiset of whole {@link Sequence}
 * values (every field, via Lombok equals), ignoring array order. Fields
 * syncPlaylists does not manage (visibilityCount, playsToday, group,
 * category, visible) are carried through unchanged on both sides, so they
 * never force a write, and a skipped write cannot drop a change to them.
 * psaSequences are compared as ordered lists (syncPlaylists only filters
 * them). Anything that the write would also normalise counts as a change:
 * a null array, null or duplicate entries, or psaEnabled not already false
 * when the PSA list ends up empty.
 */
final class SyncPlaylistsDiff {

  /**
   * Write order for the sequences array. syncPlaylists renumbers removed
   * sequences from their array position, so the array has to come back in
   * the same relative order for repeat calls to reach a fixed point. HashSet
   * order does not guarantee that (its hash includes the order field).
   */
  static final Comparator<Sequence> STORED_ORDER = Comparator
      .comparing(Sequence::getOrder, Comparator.nullsLast(Comparator.naturalOrder()))
      .thenComparing(Sequence::getName, Comparator.nullsLast(Comparator.naturalOrder()));

  private SyncPlaylistsDiff() {
  }

  /**
   * Deep copy taken before syncPlaylists mutates the loaded sequences in
   * place. Keep in step with {@link Sequence}'s fields (guarded by a test);
   * a missed field fails safe as a write, never as a skipped one.
   */
  static Sequence copyOf(Sequence s) {
    return Sequence.builder()
        .name(s.getName())
        .displayName(s.getDisplayName())
        .duration(s.getDuration())
        .visible(s.getVisible())
        .index(s.getIndex())
        .order(s.getOrder())
        .imageUrl(s.getImageUrl())
        .active(s.getActive())
        .visibilityCount(s.getVisibilityCount())
        .type(s.getType())
        .group(s.getGroup())
        .category(s.getCategory())
        .artist(s.getArtist())
        .playsToday(s.getPlaysToday())
        .build();
  }

  /** Copies of the loaded sequences, nulls kept so they register as a change. Null if the array is missing. */
  static List<Sequence> snapshot(List<Sequence> sequences) {
    if (sequences == null) {
      return null;
    }
    return sequences.stream().map(s -> s == null ? null : copyOf(s)).toList();
  }

  static boolean isNoOp(List<Sequence> sequencesBefore, List<Sequence> sequencesAfter,
                        List<PsaSequence> psaBefore, List<PsaSequence> psaAfter,
                        Boolean psaEnabled) {
    if (sequencesBefore == null || psaBefore == null) {
      return false;
    }
    if (psaAfter.isEmpty() && !Boolean.FALSE.equals(psaEnabled)) {
      return false;
    }
    return psaBefore.equals(psaAfter) && counts(sequencesBefore).equals(counts(sequencesAfter));
  }

  private static Map<Sequence, Long> counts(Collection<Sequence> sequences) {
    Map<Sequence, Long> counts = new HashMap<>();
    for (Sequence s : sequences) {
      counts.merge(s, 1L, Long::sum);
    }
    return counts;
  }
}
