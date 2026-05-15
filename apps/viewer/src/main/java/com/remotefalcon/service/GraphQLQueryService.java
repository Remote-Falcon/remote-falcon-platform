package com.remotefalcon.service;

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
    // Get next from request list
    Optional<Request> nextRequest = show.getRequests().stream()
        .min(Comparator.comparing(Request::getPosition));
    nextRequest.ifPresent(request -> {
      show.setPlayingNext(request.getSequence().getDisplayName());
      show.setPlayingNextSequence(request.getSequence());
    });

    // Get next from schedule if next request is empty
    if (nextRequest.isEmpty()) {
      Optional<Sequence> playingNextScheduledSequence = show.getSequences().stream()
          .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), show.getPlayingNextFromSchedule()))
          .findFirst();
      playingNextScheduledSequence.ifPresent(sequence -> {
        show.setPlayingNext(sequence.getDisplayName());
        show.setPlayingNextSequence(sequence);
      });
    }
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
