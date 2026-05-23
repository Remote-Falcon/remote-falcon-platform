package com.remotefalcon.service;

import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.SequenceGroup;
import com.remotefalcon.library.models.ViewerPage;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.repository.ShowRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import lombok.extern.jbosslog.JBossLog;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@JBossLog
@ApplicationScoped
public class GraphQLQueryService {
  @Inject
  ShowRepository showRepository;

  public Show getShow(String showSubdomain) {
    // Use optimized query that excludes stats and sensitive fields
    Optional<Show> show = this.showRepository.findByShowSubdomainForViewer(showSubdomain);
    if (show.isPresent()) {
      Show existingShow = show.get();
      this.updatePlayingNow(existingShow);
      this.updatePlayingNext(existingShow);
      existingShow.setSequences(this.processSequencesForViewer(existingShow));
      existingShow.setPages(this.filterActivePageOnly(existingShow.getPages()));
    }
    return show.orElse(null);
  }

  private void updatePlayingNow(Show show) {
    Optional<Sequence> playingNowSequence = show.getSequences().stream()
        .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), show.getPlayingNow()))
        .findFirst();
    playingNowSequence.ifPresent(sequence -> {
      show.setPlayingNow(sequence.getDisplayName());
      show.setPlayingNowSequence(sequence);
    });
  }

  private void updatePlayingNext(Show show) {
    // Voting-mode shows must skip the request-queue read entirely.
    // `requests` is a jukebox concept — winning votes are surfaced to FPP
    // via the highestVotedPlaylist endpoint and never put entries into
    // `requests`. Skipping this read in voting mode also stops stale
    // entries left over from an earlier jukebox-mode session from leaking
    // into playingNext: when a show was once in jukebox mode with managed
    // PSA, the PSA's Request stuck in the array (only nextPlaylistInQueue
    // removes it, and that endpoint isn't called in voting mode). Every
    // subsequent getShow saw it as the min-by-position request and
    // overwrote playingNext with the PSA's displayName, regardless of
    // what the schedule said (#78).
    boolean isVotingMode = show.getPreferences() != null
        && ViewerControlMode.VOTING.equals(show.getPreferences().getViewerControlMode());

    Optional<Request> nextRequest = isVotingMode
        ? Optional.empty()
        : show.getRequests().stream().min(Comparator.comparing(Request::getPosition));

    if (nextRequest.isPresent()) {
      show.setPlayingNext(nextRequest.get().getSequence().getDisplayName());
      show.setPlayingNextSequence(nextRequest.get().getSequence());
      return;
    }

    // Fall through to the FPP-reported next-scheduled sequence. This is
    // the source of truth in voting mode and the fallback in jukebox mode
    // when the request queue is empty.
    Optional<Sequence> playingNextScheduledSequence = show.getSequences().stream()
        .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), show.getPlayingNextFromSchedule()))
        .findFirst();
    playingNextScheduledSequence.ifPresent(sequence -> {
      show.setPlayingNext(sequence.getDisplayName());
      show.setPlayingNextSequence(sequence);
    });
  }

  private List<Sequence> processSequencesForViewer(Show show) {
    List<Sequence> updatedSequences = show.getSequences();
    List<SequenceGroup> updatedSequenceGroups = show.getSequenceGroups();
    updatedSequences = this.sortAndFilterSequences(updatedSequences);
    updatedSequenceGroups = this.filterSequenceGroups(updatedSequenceGroups);
    return this.replaceSequencesWithSequenceGroups(updatedSequences, updatedSequenceGroups);
  }

  private List<ViewerPage> filterActivePageOnly(List<ViewerPage> pages) {
    if (pages == null) {
      return null;
    }
    return pages.stream()
        .filter(ViewerPage::getActive)
        .limit(1)
        .toList();
  }

  private List<Sequence> sortAndFilterSequences(List<Sequence> sequences) {
    sequences.sort(Comparator.comparing(Sequence::getOrder));
    return sequences.stream()
        .filter(sequence -> sequence.getVisibilityCount() == 0)
        .filter(Sequence::getActive)
        // A sequence with no FPP playlist index can't actually play: the
        // plugin's Insert-Playlist call to FPPD requires a numeric index,
        // and a null/negative one either silently fails or (worse) inserts
        // the wrong sequence at FPPD's index 0. Hide unsynced sequences
        // from viewers so requests can't be drained on something that
        // won't play. plugins-api uses -1 as the "not in playlist" marker
        // when the FPP-side index is missing.
        .filter(sequence -> sequence.getIndex() != null && sequence.getIndex() >= 0)
        .toList();
  }

  private List<SequenceGroup> filterSequenceGroups(List<SequenceGroup> sequenceGroups) {
    return sequenceGroups.stream()
        .filter(group -> group.getVisibilityCount() == 0)
        .toList();
  }

  private List<Sequence> replaceSequencesWithSequenceGroups(List<Sequence> sequences,
      List<SequenceGroup> sequenceGroups) {
    // Create a map for O(1) lookups instead of O(n) stream operations
    java.util.Map<String, SequenceGroup> groupMap = new java.util.HashMap<>();
    for (SequenceGroup group : sequenceGroups) {
      groupMap.put(group.getName().toLowerCase(), group);
    }

    List<Sequence> sequencesWithGroups = new ArrayList<>();
    java.util.Set<String> groupsAdded = new java.util.HashSet<>();

    for (Sequence sequence : sequences) {
      if (StringUtils.isNotEmpty(sequence.getGroup())) {
        String groupKey = sequence.getGroup().toLowerCase();
        SequenceGroup sequenceGroup = groupMap.get(groupKey);

        if (sequenceGroup != null && !groupsAdded.contains(groupKey)) {
          groupsAdded.add(groupKey);

          sequence.setName(sequenceGroup.getName());
          sequence.setDisplayName(sequenceGroup.getName());
          sequence.setVisibilityCount(sequenceGroup.getVisibilityCount());

          sequencesWithGroups.add(sequence);
        }
      } else {
        sequencesWithGroups.add(sequence);
      }
    }
    return sequencesWithGroups;
  }

  public String activeViewerPage(String showSubdomain) {
    // Optimized: Fetch only the pages array (not entire Show document)
    // Java iteration over 1-5 pages is faster than complex MongoDB projection
    Optional<Show> show = this.showRepository.findPagesOnlyByShowSubdomain(showSubdomain);
    if (show.isPresent() && show.get().getPages() != null) {
      return show.get().getPages().stream()
          .filter(ViewerPage::getActive)
          .findFirst()
          .map(ViewerPage::getHtml)
          .orElse("");
    }
    return "";
  }
}
