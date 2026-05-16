package com.remotefalcon.plugins.api.service;

import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.model.*;

import io.quarkus.logging.Log;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@RequestScoped
public class PluginService {

  private static final Logger LOG = Logger.getLogger(PluginService.class);

  @Inject
  ShowContext showContext;

  @Inject
  @ConfigProperty(name = "sequence.limit")
  int sequenceLimit;

  public NextPlaylistResponse nextPlaylistInQueue() {
    Show show = showContext.getShow();
    NextPlaylistResponse defaultResponse = NextPlaylistResponse.builder()
        .nextPlaylist(null)
        .playlistIndex(-1)
        .build();
    if (CollectionUtils.isEmpty(show.getRequests())) {
      return defaultResponse;
    }
    Optional<Request> nextRequest = show.getRequests().stream().min(Comparator.comparing(Request::getPosition));
    if (nextRequest.isEmpty()) {
      return defaultResponse;
    }
    this.updateVisibilityCounts(show, nextRequest.get());

    // Atomic removal of the request by position and update visibility counts
    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.combine(
            Updates.pull("requests", Filters.eq("position", nextRequest.get().getPosition())),
            Updates.set("sequences", show.getSequences()),
            Updates.set("sequenceGroups", show.getSequenceGroups())
        )
    );

    return NextPlaylistResponse.builder()
        .nextPlaylist(nextRequest.get().getSequence().getName())
        .playlistIndex(nextRequest.get().getSequence().getIndex())
        .build();
  }

  private void updateVisibilityCounts(Show show, Request request) {
    if (show.getPreferences().getHideSequenceCount() != 0) {
      if (!StringUtils.isEmpty(request.getSequence().getGroup())) {
        Optional<SequenceGroup> sequenceGroup = show.getSequenceGroups().stream()
            .filter((group) -> StringUtils.equalsIgnoreCase(group.getName(), request.getSequence().getGroup()))
            .findFirst();
        sequenceGroup.ifPresent(group -> group.setVisibilityCount(show.getPreferences().getHideSequenceCount() + 1));
      } else {
        Optional<Sequence> sequence = show.getSequences().stream()
            .filter((seq) -> StringUtils.equalsIgnoreCase(seq.getName(), request.getSequence().getName()))
            .findFirst();
        sequence.ifPresent(seq -> seq.setVisibilityCount(show.getPreferences().getHideSequenceCount() + 1));
      }
    }
  }

  public PluginResponse updatePlaylistQueue() {
    Show show = showContext.getShow();
    if (CollectionUtils.isEmpty(show.getRequests())) {
      return PluginResponse.builder().message("Queue Empty").build();
    } else {
      return PluginResponse.builder().message("Success").build();
    }
  }

  public PluginResponse syncPlaylists(SyncPlaylistRequest request) {
    Show show = showContext.getShow();
    List<SyncPlaylistDetails> playlists = request.getPlaylists();
    Log.infof("Received syncPlaylists request for %s. Playlist size: %s", show.getShowToken(),
        playlists != null ? playlists.size() : 0);
    if (playlists.size() > this.sequenceLimit) {
      LOG.warnf("syncPlaylists rejected for showToken=%s: requestPlaylists=%d exceeds limit=%d",
          show.getShowToken(), playlists.size(), this.sequenceLimit);
      throw new WebApplicationException(
          Response.status(Response.Status.BAD_REQUEST)
              .entity(PluginResponse.builder().message("Cannot sync more than " + this.sequenceLimit + " sequences").build())
              .build()
      );
    }

    Set<String> existingSequenceNames = Optional.ofNullable(show.getSequences())
        .orElse(Collections.emptyList())
        .stream()
        .filter(Objects::nonNull)
        .map(Sequence::getName)
        .filter(StringUtils::isNotEmpty)
        .map(StringUtils::lowerCase)
        .collect(Collectors.toSet());
    Set<String> combinedSequenceNames = new HashSet<>(existingSequenceNames);
    combinedSequenceNames.addAll(playlists.stream()
        .map(SyncPlaylistDetails::getPlaylistName)
        .filter(StringUtils::isNotEmpty)
        .map(StringUtils::lowerCase)
        .collect(Collectors.toSet()));
    if (combinedSequenceNames.size() > this.sequenceLimit) {
      LOG.warnf("syncPlaylists rejected for showToken=%s: existingSequences=%d, requestPlaylists=%d, combined=%d exceeds limit=%d",
          show.getShowToken(), existingSequenceNames.size(), playlists.size(), combinedSequenceNames.size(), this.sequenceLimit);
      throw new WebApplicationException(
          Response.status(Response.Status.BAD_REQUEST)
              .entity(PluginResponse.builder().message("Cannot sync more than " + this.sequenceLimit + " sequences").build())
              .build()
      );
    }
    Set<Sequence> updatedSequences = new HashSet<>();
    updatedSequences.addAll(this.getSequencesToDelete(request, show));
    updatedSequences.addAll(this.addNewSequences(request, show));

    List<PsaSequence> updatedPsaSequences = this.updatePsaSequences(request, show);

    // Atomic updates for sequences and PSA sequences
    if (CollectionUtils.isEmpty(updatedPsaSequences)) {
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.combine(
              Updates.set("sequences", updatedSequences.stream().toList()),
              Updates.set("psaSequences", updatedPsaSequences),
              Updates.set("preferences.psaEnabled", false)
          )
      );
    } else {
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.combine(
              Updates.set("sequences", updatedSequences.stream().toList()),
              Updates.set("psaSequences", updatedPsaSequences)
          )
      );
    }

    return PluginResponse.builder().message("Success").build();
  }

  private List<Sequence> getSequencesToDelete(SyncPlaylistRequest request, Show show) {
    Set<String> playlistNamesInRequest = request.getPlaylists().stream()
        .map(SyncPlaylistDetails::getPlaylistName)
        .filter(StringUtils::isNotEmpty)
        .map(StringUtils::lowerCase)
        .collect(Collectors.toSet());

    List<Sequence> existingSequences = show.getSequences();
    if (CollectionUtils.isEmpty(existingSequences)) {
      return new ArrayList<>();
    }

    List<Sequence> sequencesToDelete = new ArrayList<>();
    int inactiveSequenceOrder = request.getPlaylists().size() + 1;
    for (Sequence existingSequence : existingSequences) {
      if (existingSequence == null) {
        continue;
      }
      String normalizedExistingName = StringUtils.lowerCase(existingSequence.getName());
      if (!playlistNamesInRequest.contains(normalizedExistingName)) {
        existingSequence.setActive(false);
        existingSequence.setIndex(null);
        existingSequence.setOrder(inactiveSequenceOrder);
        sequencesToDelete.add(existingSequence);
        inactiveSequenceOrder++;
      }
    }
    return sequencesToDelete;
  }

  private List<Sequence> addNewSequences(SyncPlaylistRequest request, Show show) {
    List<Sequence> currentSequences = show.getSequences() != null ? show.getSequences() : new ArrayList<>();
    Set<String> existingSequences = currentSequences.stream()
        .filter(Objects::nonNull)
        .map(Sequence::getName)
        .filter(StringUtils::isNotEmpty)
        .map(StringUtils::lowerCase)
        .collect(Collectors.toSet());
    Set<String> processedNames = new HashSet<>();
    List<Sequence> sequencesToSync = new ArrayList<>();
    Optional<Sequence> lastSequenceInOrder = currentSequences.stream()
        .filter(Objects::nonNull)
        .filter(Sequence::getActive)
        .max(Comparator.comparing(Sequence::getOrder));
    int sequenceOrder = 0;
    if (lastSequenceInOrder.isPresent()) {
      sequenceOrder = lastSequenceInOrder.get().getOrder();
    }
    AtomicInteger atomicSequenceOrder = new AtomicInteger(sequenceOrder);
    for (SyncPlaylistDetails playlistInRequest : request.getPlaylists()) {
      String playlistName = playlistInRequest.getPlaylistName();
      if (StringUtils.isEmpty(playlistName)) {
        continue;
      }
      String normalizedName = StringUtils.lowerCase(playlistName);
      if (!processedNames.add(normalizedName)) {
        continue;
      }
      if (!existingSequences.contains(normalizedName)) {
        Sequence newSequence = Sequence.builder()
            .active(true)
            .displayName(StringUtils.defaultIfBlank(playlistInRequest.getMediaTitle(), playlistName))
            .duration(playlistInRequest.getPlaylistDuration())
            .imageUrl(StringUtils.defaultString(playlistInRequest.getMediaAlbumUrl()))
            .artist(StringUtils.defaultString(playlistInRequest.getMediaArtist()))
            .index(playlistInRequest.getPlaylistIndex() != null ? playlistInRequest.getPlaylistIndex() : -1)
            .name(playlistName)
            .order(atomicSequenceOrder.get())
            .visible(true)
            .visibilityCount(0)
            .type(playlistInRequest.getPlaylistType() == null ? "SEQUENCE" : playlistInRequest.getPlaylistType())
            .build();
        sequencesToSync.add(newSequence);
        existingSequences.add(normalizedName);
        atomicSequenceOrder.getAndIncrement();
      } else {
        currentSequences.stream()
            .filter(sequence -> sequence != null && StringUtils.equalsIgnoreCase(sequence.getName(), playlistName))
            .findFirst()
            .ifPresent(sequence -> {
              sequence.setIndex(playlistInRequest.getPlaylistIndex() != null ? playlistInRequest.getPlaylistIndex() : -1);
              sequence.setDuration(playlistInRequest.getPlaylistDuration());
              sequence.setType(playlistInRequest.getPlaylistType() == null ? "SEQUENCE" : playlistInRequest.getPlaylistType());
              sequence.setActive(true);
              if (StringUtils.isNotBlank(playlistInRequest.getMediaTitle())
                  && !StringUtils.equals(sequence.getDisplayName(), playlistInRequest.getMediaTitle())) {
                sequence.setDisplayName(playlistInRequest.getMediaTitle());
              }
              if (StringUtils.isNotBlank(playlistInRequest.getMediaArtist())
                  && !StringUtils.equals(sequence.getArtist(), playlistInRequest.getMediaArtist())) {
                sequence.setArtist(playlistInRequest.getMediaArtist());
              }
              if (StringUtils.isNotBlank(playlistInRequest.getMediaAlbumUrl())
                  && !StringUtils.equals(sequence.getImageUrl(), playlistInRequest.getMediaAlbumUrl())) {
                sequence.setImageUrl(playlistInRequest.getMediaAlbumUrl());
              }
              sequencesToSync.add(sequence);
            });
      }
    }
    return sequencesToSync;
  }

  private List<PsaSequence> updatePsaSequences(SyncPlaylistRequest request, Show show) {
    List<PsaSequence> updatedPsaSequences = new ArrayList<>();
    List<String> playlistNamesInRequest = request.getPlaylists().stream().map(SyncPlaylistDetails::getPlaylistName).toList();
    if (CollectionUtils.isNotEmpty(show.getPsaSequences())) {
      for (PsaSequence psa : show.getPsaSequences()) {
        if (playlistNamesInRequest.contains(psa.getName())) {
          updatedPsaSequences.add(psa);
        }
      }
    }
    return updatedPsaSequences;
  }

  public PluginResponse updateWhatsPlaying(UpdateWhatsPlayingRequest request) {
    if (request == null) {
      return PluginResponse.builder().build();
    }
    Show show = showContext.getShow();
    if (show.getPreferences() == null) {
      LOG.warnf("updateWhatsPlaying rejected for showToken=%s: preferences not found", show.getShowToken());
      throw new WebApplicationException(
          Response.status(Response.Status.BAD_REQUEST)
              .entity(PluginResponse.builder().message("Preferences not found").build())
              .build()
      );
    }

    boolean hasPlaylist = StringUtils.isNotEmpty(request.getPlaylist());

    if (!hasPlaylist) {
      show.setPlayingNow("");
      show.setPlayingNext("");
      show.setPlayingNextFromSchedule("");
    } else {
      show.setPlayingNow(request.getPlaylist());
    }

    if (hasPlaylist) {
      int sequencesPlayed = show.getPreferences().getSequencesPlayed() != null
          ? show.getPreferences().getSequencesPlayed()
          : 0;

      List<Sequence> sequences = show.getSequences() != null ? show.getSequences() : Collections.emptyList();
      List<PsaSequence> psaSequences = show.getPsaSequences() != null ? show.getPsaSequences() : Collections.emptyList();
      List<SequenceGroup> sequenceGroups = show.getSequenceGroups() != null ? show.getSequenceGroups() : Collections.emptyList();

      Optional<Sequence> whatsPlayingSequence = sequences.stream()
          .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), request.getPlaylist()))
          .findFirst();

      Optional<PsaSequence> psaSequence = psaSequences.stream()
          .filter(psa -> StringUtils.equalsIgnoreCase(psa.getName(), request.getPlaylist()))
          .findFirst();

      if (psaSequence.isPresent()) {
        sequencesPlayed = 0;
      } else {
        sequencesPlayed++;
      }

      if (whatsPlayingSequence.isPresent() && StringUtils.isNotEmpty(whatsPlayingSequence.get().getGroup())) {
        sequencesPlayed--;
      }

      show.getPreferences().setSequencesPlayed(sequencesPlayed);

      for (Sequence sequence : sequences) {
        if (sequence != null && sequence.getVisibilityCount() > 0) {
          sequence.setVisibilityCount(sequence.getVisibilityCount() - 1);
        }
      }

      for (SequenceGroup sequenceGroup : sequenceGroups) {
        if (sequenceGroup != null && sequenceGroup.getVisibilityCount() > 0) {
          sequenceGroup.setVisibilityCount(sequenceGroup.getVisibilityCount() - 1);
        }
      }

      Set<String> psaNamesLowerCase = psaSequences.stream()
          .filter(Objects::nonNull)
          .map(PsaSequence::getName)
          .filter(StringUtils::isNotEmpty)
          .map(StringUtils::lowerCase)
          .collect(Collectors.toSet());

      this.handleManagedPSA(sequencesPlayed, show, psaNamesLowerCase);

      // Clear viewer flags before persisting
      if (show.getRequests() != null) {
        show.getRequests().forEach(req -> req.setViewerRequested(null));
      }
      if (show.getVotes() != null) {
        show.getVotes().forEach(vote -> vote.setViewersVoted(new ArrayList<>()));
      }

      // Atomic update for all the modified fields
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.combine(
              Updates.set("playingNow", request.getPlaylist()),
              Updates.set("preferences.sequencesPlayed", sequencesPlayed),
              Updates.set("sequences", sequences),
              Updates.set("sequenceGroups", sequenceGroups),
              Updates.set("psaSequences", show.getPsaSequences() != null ? show.getPsaSequences() : new ArrayList<>()),
              Updates.set("requests", show.getRequests() != null ? show.getRequests() : new ArrayList<>()),
              Updates.set("votes", show.getVotes() != null ? show.getVotes() : new ArrayList<>())
          )
      );
    } else {
      // Clear playing fields
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.combine(
              Updates.set("playingNow", ""),
              Updates.set("playingNext", ""),
              Updates.set("playingNextFromSchedule", "")
          )
      );
    }

    return PluginResponse.builder().currentPlaylist(request.getPlaylist()).build();
  }

  private void handleManagedPSA(int sequencesPlayed, Show show, Set<String> psaNamesLowerCase) {
    List<PsaSequence> psaSequences = show.getPsaSequences();
    if (CollectionUtils.isEmpty(psaSequences) || CollectionUtils.isEmpty(psaNamesLowerCase)) {
      return;
    }
    if (sequencesPlayed == 0
        || !show.getPreferences().getPsaEnabled()
        || !show.getPreferences().getManagePsa()
        || show.getPreferences().getPsaFrequency() == null
        || show.getPreferences().getPsaFrequency() <= 0
        || sequencesPlayed % show.getPreferences().getPsaFrequency() != 0) {
      return;
    }

    Optional<PsaSequence> nextPsaSequence = psaSequences.stream()
        .filter(Objects::nonNull)
        .filter(psaSequence -> psaSequence.getLastPlayed() != null)
        .filter(psaSequence -> psaSequence.getOrder() != null)
        .min(Comparator.comparing(PsaSequence::getLastPlayed)
            .thenComparing(PsaSequence::getOrder));

    if (nextPsaSequence.isEmpty()) {
      return;
    }

    boolean isPSAPlayingNow = StringUtils.isNotEmpty(show.getPlayingNow())
        && psaNamesLowerCase.contains(StringUtils.lowerCase(show.getPlayingNow()));
    if (isPSAPlayingNow) {
      return;
    }

    Optional<Sequence> sequenceToAdd = Optional.empty();
    if (CollectionUtils.isNotEmpty(show.getSequences())) {
      sequenceToAdd = show.getSequences().stream()
          .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), nextPsaSequence.get().getName()))
          .findFirst();
    }

    int index = psaSequences.indexOf(nextPsaSequence.get());
    if (index >= 0) {
      psaSequences.get(index).setLastPlayed(LocalDateTime.now());
    }

    if (show.getPreferences().getViewerControlMode() == ViewerControlMode.JUKEBOX) {
      sequenceToAdd.ifPresent(sequence -> this.setPSASequenceRequest(show, sequence, psaNamesLowerCase));
    } else if (show.getPreferences().getViewerControlMode() == ViewerControlMode.VOTING) {
      sequenceToAdd.ifPresent(sequence -> this.setPSASequenceVote(show, sequence, psaNamesLowerCase));
    }
  }

  private void setPSASequenceRequest(Show show, Sequence requestedSequence, Set<String> psaNamesLowerCase) {
    if (show.getRequests() == null) {
      show.setRequests(new ArrayList<>());
    }
    if (show.getVotes() == null) {
      show.setVotes(new ArrayList<>());
    }

    // Calculate the next position in the queue
    int nextPosition = 1;
    if (CollectionUtils.isNotEmpty(show.getRequests())) {
      nextPosition = show.getRequests().stream()
          .map(Request::getPosition)
          .max(Integer::compareTo)
          .orElse(0) + 1;
    }

    // Always add PSA to votes with high priority (2000) for jukebox mode
    show.getVotes().add(Vote.builder()
        .sequence(requestedSequence)
        .ownerVoted(false)
        .lastVoteTime(LocalDateTime.now())
        .votes(2000)
        .build());

    // Add PSA to requests at the next available position in the queue
    show.getRequests().add(Request.builder()
        .sequence(requestedSequence)
        .ownerRequested(false)
        .position(nextPosition)
        .build());
  }

  private void setPSASequenceVote(Show show, Sequence requestedSequence, Set<String> psaNamesLowerCase) {
    if (show.getVotes() == null) {
      show.setVotes(new ArrayList<>());
    }

    // Always add PSA to votes with high priority (2000)
    show.getVotes().add(Vote.builder()
        .sequence(requestedSequence)
        .ownerVoted(false)
        .lastVoteTime(LocalDateTime.now())
        .votes(2000)
        .build());
  }


  public PluginResponse updateNextScheduledSequence(UpdateNextScheduledRequest request) {
    Show show = showContext.getShow();
    if (show.getPreferences() == null) {
      LOG.warnf("updateNextScheduledSequence rejected for showToken=%s: preferences not found", show.getShowToken());
      throw new WebApplicationException(
          Response.status(Response.Status.BAD_REQUEST)
              .entity(PluginResponse.builder().message("Preferences not found").build())
              .build()
      );
    }
    if (StringUtils.isEmpty(request.getSequence())) {
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.combine(
              Updates.set("playingNow", ""),
              Updates.set("playingNext", ""),
              Updates.set("playingNextFromSchedule", "")
          )
      );
    } else {
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.set("playingNextFromSchedule", request.getSequence())
      );
    }
    return PluginResponse.builder().nextScheduledSequence(request.getSequence()).build();
  }

  public PluginResponse viewerControlMode() {
    Show show = showContext.getShow();
    String viewerControlMode = show.getPreferences().getViewerControlMode().name().toLowerCase();
    return PluginResponse.builder()
        .viewerControlMode(viewerControlMode)
        .build();
  }

  public HighestVotedPlaylistResponse highestVotedPlaylist() {
    Show show = showContext.getShow();
    HighestVotedPlaylistResponse response = HighestVotedPlaylistResponse.builder()
        .winningPlaylist(null)
        .playlistIndex(-1)
        .build();
    //Get the sequence with the most votes. If there is a tie, get the sequence with the earliest vote time
    if (CollectionUtils.isNotEmpty(show.getVotes())) {
      Optional<Vote> winningVote = show.getVotes().stream()
          .max(Comparator.comparing(Vote::getVotes)
              .thenComparing(Comparator.comparing(Vote::getLastVoteTime).reversed()));
      if (winningVote.isPresent()) {
        SequenceGroup winningSequenceGroup = winningVote.get().getSequenceGroup();
        if (winningSequenceGroup != null) {
          return this.processWinningGroup(winningVote.get(), show);
        } else {
          return this.processWinningVote(winningVote.get(), show);
        }
      }
    }

    return response;
  }

  private HighestVotedPlaylistResponse processWinningGroup(Vote winningVote, Show show) {
    SequenceGroup winningSequenceGroup = winningVote.getSequenceGroup();
    show.getVotes().remove(winningVote);

    if (winningSequenceGroup != null) {
      Optional<SequenceGroup> actualSequenceGroup = show.getSequenceGroups().stream()
          .filter(sequenceGroup -> StringUtils.equalsIgnoreCase(sequenceGroup.getName(), winningSequenceGroup.getName()))
          .findFirst();

      if (actualSequenceGroup.isPresent()) {
        List<Sequence> sequencesInGroup = new ArrayList<>(show.getSequences().stream()
            .filter(sequence -> StringUtils.equalsIgnoreCase(actualSequenceGroup.get().getName(), sequence.getGroup()))
            .toList());
        if (CollectionUtils.isEmpty(sequencesInGroup)) {
          return null;
        }

        show.getStats().getVotingWin().add(Stat.VotingWin.builder()
            .name(actualSequenceGroup.get().getName())
            .dateTime(LocalDateTime.now())
            .build());

        //Set visibility counts
        if (show.getPreferences().getHideSequenceCount() != 0) {
          actualSequenceGroup.get().setVisibilityCount(show.getPreferences().getHideSequenceCount() + 1);
        }

        int voteCount = 2099;

        Vote updatedWinningVote = Vote.builder()
            .votes(voteCount)
            .lastVoteTime(LocalDateTime.now())
            .ownerVoted(false)
            .sequence(sequencesInGroup.getFirst())
            .build();
        voteCount--;

        sequencesInGroup.removeFirst();

        List<Vote> sequencesInGroupVotes = new ArrayList<>();
        for (Sequence groupedSequence : sequencesInGroup) {
          sequencesInGroupVotes.add(Vote.builder()
              .votes(voteCount)
              .lastVoteTime(LocalDateTime.now())
              .ownerVoted(false)
              .sequence(groupedSequence)
              .build());
          voteCount--;
        }
        show.getVotes().addAll(sequencesInGroupVotes);
        return this.processWinningVote(updatedWinningVote, show);
      }
    }
    return null;
  }

  private HighestVotedPlaylistResponse processWinningVote(Vote winningVote, Show show) {
    Sequence winningSequence = winningVote.getSequence();
    show.getVotes().remove(winningVote);

    if (winningSequence != null) {
      boolean winningSequenceIsPSA = show.getPsaSequences().stream()
          .anyMatch(psaSequence -> StringUtils.equalsIgnoreCase(psaSequence.getName(), winningSequence.getName()));
      Optional<Sequence> actualSequence = show.getSequences().stream()
          .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), winningSequence.getName()))
          .findFirst();

      if (actualSequence.isPresent()) {
        boolean noGroupedSequencesHaveVotes = show.getVotes().stream()
            .noneMatch(vote -> vote.getSequence() == null || StringUtils.isNotEmpty(vote.getSequence().getGroup()));

        //Vote resets should only happen if there are no grouped sequences with active votes AND the winning sequence is not a PSA
        if (noGroupedSequencesHaveVotes && !winningSequenceIsPSA) {
          //Reset votes
          if (show.getPreferences().getResetVotes()) {
            show.getVotes().clear();
          }
        }

        //Set visibility counts
        if (show.getPreferences().getHideSequenceCount() != 0 && StringUtils.isEmpty(actualSequence.get().getGroup())) {
          actualSequence.get().setVisibilityCount(show.getPreferences().getHideSequenceCount() + 1);
        }

        //Only save stats for non-grouped sequences
        if (StringUtils.isEmpty(actualSequence.get().getGroup()) && !winningSequenceIsPSA) {
          show.getStats().getVotingWin().add(Stat.VotingWin.builder()
              .name(actualSequence.get().getName())
              .dateTime(LocalDateTime.now())
              .build());
        }

        if (show.getPreferences().getPsaEnabled() && !show.getPreferences().getManagePsa()
            && CollectionUtils.isNotEmpty(show.getPsaSequences()) && StringUtils.isEmpty(actualSequence.get().getGroup()) && !winningSequenceIsPSA) {
          Integer voteWinsToday = show.getStats().getVotingWin().stream()
              .filter(stat -> stat.getDateTime().isAfter(LocalDateTime.now().withHour(0).withMinute(0).withSecond(0)))
              .toList()
              .size();
          boolean isPSAPlayingNow = show.getPsaSequences().stream()
              .anyMatch(psaSequence -> StringUtils.equalsIgnoreCase(show.getPlayingNow(), psaSequence.getName()));
          if (voteWinsToday % show.getPreferences().getPsaFrequency() == 0 && !isPSAPlayingNow) {
            Optional<PsaSequence> nextPsaSequence = show.getPsaSequences().stream()
                .filter(Objects::nonNull)
                .filter(psaSequence -> psaSequence.getLastPlayed() != null)
                .filter(psaSequence -> psaSequence.getOrder() != null)
                .min(Comparator.comparing(PsaSequence::getLastPlayed)
                    .thenComparing(PsaSequence::getOrder));
            if (nextPsaSequence.isPresent()) {
              Optional<Sequence> sequenceToAdd = show.getSequences().stream()
                  .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), nextPsaSequence.get().getName()))
                  .findFirst();
              show.getPsaSequences().get(show.getPsaSequences().indexOf(nextPsaSequence.get())).setLastPlayed(LocalDateTime.now());
              //Final Sanity check
              List<String> psaSequences = show.getPsaSequences().stream().map(PsaSequence::getName).toList();
              boolean isPsaInVotes = show.getVotes().stream().anyMatch(vote -> (vote.getSequence() != null
                  && vote.getSequence().getName() != null
                  && psaSequences.contains(vote.getSequence().getName())));
              if (!isPsaInVotes) {
                sequenceToAdd.ifPresent(sequence -> show.getVotes().add(Vote.builder()
                    .sequence(sequence)
                    .ownerVoted(false)
                    .lastVoteTime(LocalDateTime.now())
                    .votes(2000)
                    .build()));
              }
            }
          }
        }

        // Atomic update for all changes
        Show.mongoCollection().updateOne(
            Filters.eq("showToken", show.getShowToken()),
            Updates.combine(
                Updates.set("votes", show.getVotes()),
                Updates.set("stats.votingWin", show.getStats().getVotingWin()),
                Updates.set("sequences", show.getSequences()),
                Updates.set("psaSequences", show.getPsaSequences())
            )
        );

        //Return winning sequence
        return HighestVotedPlaylistResponse.builder()
            .winningPlaylist(actualSequence.get().getName())
            .playlistIndex(actualSequence.get().getIndex())
            .build();
      }
    }
    return null;
  }

  // V18 — when the reported plugin/FPP version differs from what's stored,
  // append a VersionChange record so the dashboard can show "last upgraded
  // N days ago" + a history popover. Prune + push run as two updates because
  // Mongo rejects $pull and $push on the same field path in one operation.
  private static final long VERSION_CHANGE_RETENTION_DAYS = 365L;

  public PluginResponse pluginVersion(PluginVersion request) {
    Show show = showContext.getShow();
    String newPluginVer = request.getPluginVersion();
    String newFppVer = request.getFppVersion();
    boolean pluginChanged = newPluginVer != null && !java.util.Objects.equals(newPluginVer, show.getPluginVersion());
    boolean fppChanged = newFppVer != null && !java.util.Objects.equals(newFppVer, show.getFppVersion());

    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.combine(
            Updates.set("pluginVersion", newPluginVer),
            Updates.set("fppVersion", newFppVer)
        )
    );

    if (pluginChanged || fppChanged) {
      LocalDateTime now = LocalDateTime.now();
      LocalDateTime cutoff = now.minusDays(VERSION_CHANGE_RETENTION_DAYS);
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.pull("versionChanges", Filters.lt("at", cutoff))
      );
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.push("versionChanges",
              VersionChange.builder()
                  .at(now)
                  .pluginVersion(newPluginVer)
                  .fppVersion(newFppVer)
                  .build())
      );
    }

    return PluginResponse.builder().message("Success").build();
  }

  public RemotePreferenceResponse remotePreferences() {
    Show show = showContext.getShow();
    return RemotePreferenceResponse.builder()
        .remoteSubdomain(show.getShowSubdomain())
        .viewerControlMode(show.getPreferences().getViewerControlMode().name().toLowerCase())
        .build();
  }

  public PluginResponse purgeQueue() {
    Show show = showContext.getShow();
    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.combine(
            Updates.set("requests", new ArrayList<>()),
            Updates.set("votes", new ArrayList<>())
        )
    );
    return PluginResponse.builder().message("Success").build();
  }

  public PluginResponse resetAllVotes() {
    Show show = showContext.getShow();
    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.set("votes", new ArrayList<>())
    );
    return PluginResponse.builder().message("Success").build();
  }

  public PluginResponse toggleViewerControl() {
    Show show = showContext.getShow();
    boolean newValue = !show.getPreferences().getViewerControlEnabled();
    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.combine(
            Updates.set("preferences.viewerControlEnabled", newValue),
            Updates.set("preferences.sequencesPlayed", 0)
        )
    );
    return PluginResponse.builder().viewerControlEnabled(newValue).build();
  }

  public PluginResponse updateViewerControl(ViewerControlRequest request) {
    Show show = showContext.getShow();
    if (show.getPreferences() == null) {
      LOG.warnf("updateViewerControl rejected for showToken=%s: preferences not found", show.getShowToken());
      throw new WebApplicationException(
          Response.status(Response.Status.BAD_REQUEST)
              .entity(PluginResponse.builder().message("Preferences not found").build())
              .build()
      );
    }
    boolean enabled = StringUtils.equalsIgnoreCase("Y", request.getViewerControlEnabled());
    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.set("preferences.viewerControlEnabled", enabled)
    );
    return PluginResponse.builder().viewerControlEnabled(enabled).build();
  }

  public PluginResponse updateManagedPsa(ManagedPSARequest request) {
    Show show = showContext.getShow();
    if (show.getPreferences() == null) {
      LOG.warnf("updateManagedPsa rejected for showToken=%s: preferences not found", show.getShowToken());
      throw new WebApplicationException(
          Response.status(Response.Status.BAD_REQUEST)
              .entity(PluginResponse.builder().message("Preferences not found").build())
              .build()
      );
    }
    boolean enabled = StringUtils.equalsIgnoreCase("Y", request.getManagedPsaEnabled());
    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.set("preferences.managePsa", enabled)
    );
    return PluginResponse.builder().managedPsaEnabled(enabled).build();
  }

  // Threshold for what counts as "the plugin dropped." Plugin heartbeats
  // every ~30s in steady state; 5 min is comfortably outside normal jitter
  // but tight enough to catch real outages worth visualizing.
  private static final long HEARTBEAT_GAP_THRESHOLD_MINUTES = 5L;
  private static final long HEARTBEAT_GAP_RETENTION_DAYS = 30L;
  // Floor for accepting a heartbeat write. The plugin sends every ~30s, so
  // anything faster than this is either a buggy plugin (retry loop, clock
  // jitter on a slow box) or a misbehaving client. Heartbeat data is
  // information-poor — we only care about "alive in the last 5 min" — so
  // silently dropping high-frequency duplicates is loss-free and protects
  // the Show document from write amplification at scale.
  private static final long HEARTBEAT_MIN_INTERVAL_SECONDS = 10L;

  public void fppHeartbeat() {
    Show show = showContext.getShow();
    LocalDateTime now = LocalDateTime.now();
    LocalDateTime previous = show.getLastFppHeartbeat();

    // Rate limit: if the previous heartbeat landed within the floor, accept
    // the request (controller returns 204) but skip the Mongo write. Caller
    // can't tell the difference and doesn't need to — fire-and-forget.
    if (previous != null && previous.isAfter(now.minusSeconds(HEARTBEAT_MIN_INTERVAL_SECONDS))) {
      return;
    }

    // V17 — gap detection. If the previous heartbeat was more than the
    // threshold ago, we just came back from an outage; record the gap window.
    HeartbeatGap newGap = null;
    if (previous != null && previous.isBefore(now.minusMinutes(HEARTBEAT_GAP_THRESHOLD_MINUTES))) {
      newGap = HeartbeatGap.builder().startedAt(previous).endedAt(now).build();
    }

    // Always prune anything older than the retention window — keeps the
    // embedded list bounded over a long-running show that's been up for years.
    // Pull + push on heartbeatGaps must be two separate updates because Mongo
    // rejects both modifiers on the same field path in one operation.
    LocalDateTime cutoff = now.minusDays(HEARTBEAT_GAP_RETENTION_DAYS);
    var filter = Filters.eq("showToken", show.getShowToken());

    Show.mongoCollection().updateOne(
        filter,
        Updates.combine(
            Updates.set("lastFppHeartbeat", now),
            Updates.pull("heartbeatGaps", Filters.lt("endedAt", cutoff))
        )
    );

    if (newGap != null) {
      Show.mongoCollection().updateOne(filter, Updates.push("heartbeatGaps", newGap));
    }
  }
}
