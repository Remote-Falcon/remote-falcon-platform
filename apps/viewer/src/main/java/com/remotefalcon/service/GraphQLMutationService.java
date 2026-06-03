package com.remotefalcon.service;

import com.remotefalcon.exception.CustomGraphQLExceptionResolver;
import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.library.util.PluginQueueHelper;
import com.remotefalcon.metrics.ViewerMetrics;
import com.remotefalcon.repository.ShowRepository;
import com.remotefalcon.util.ClientUtil;
import com.remotefalcon.util.LocationUtil;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import lombok.extern.jbosslog.JBossLog;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.BooleanUtils;
import org.apache.commons.lang3.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@JBossLog
@ApplicationScoped
public class GraphQLMutationService {
  @Inject
  ShowRepository showRepository;

  @Inject
  RoutingContext context;

  @Inject
  ViewerMetrics viewerMetrics;

  public Boolean insertViewerPageStats(String showSubdomain, LocalDateTime date, String viewerId) {
    String clientIp = ClientUtil.getClientIP(context);
    if (StringUtils.isEmpty(clientIp)) {
      return true; // Skip if no IP available
    }

    // Only append if IP is different from lastLoginIp (owner)
    // Use atomic operation to avoid reading entire document
    Stat.Page pageStat = Stat.Page.builder()
        .ip(clientIp)
        .viewerId(viewerId)
        .dateTime(date)
        .build();

    long modifiedCount = this.showRepository.appendPageStatIfNotOwner(showSubdomain, clientIp, pageStat);
    if (modifiedCount > 0) {
      // Maintain viewer session window (PRD A1) — fire-and-forget; failure
      // here doesn't block the page-view stat insert that just succeeded.
      try {
        this.showRepository.upsertViewerSession(showSubdomain, clientIp, viewerId, date);
      } catch (Exception e) {
        log.warnf("upsertViewerSession failed for showSubdomain=%s: %s", showSubdomain, e.getMessage());
      }
    }
    return modifiedCount > 0;
  }

  public Boolean updateActiveViewers(String showSubdomain, String viewerId) {
    Optional<Show> show = this.showRepository.findByShowSubdomain(showSubdomain);
    if (show.isPresent()) {
      Show existingShow = show.get();
      String clientIp = ClientUtil.getClientIP(context);
      if (!StringUtils.equalsIgnoreCase(existingShow.getLastLoginIp(), clientIp)) {
        LocalDateTime now = LocalDateTime.now();
        this.showRepository.updateActiveViewer(showSubdomain, clientIp, viewerId, now);
        try {
          this.showRepository.upsertViewerSession(showSubdomain, clientIp, viewerId, now);
        } catch (Exception e) {
          log.warnf("upsertViewerSession failed for showSubdomain=%s: %s", showSubdomain, e.getMessage());
        }
      }
      return true;
    }
    log.errorf("updateActiveViewers unexpected: show not found for subdomain=%s", showSubdomain);
    throw new CustomGraphQLExceptionResolver(StatusResponse.UNEXPECTED_ERROR.name());
  }

  public Boolean updatePlayingNow(String showSubdomain, String playingNow) {
    Optional<Show> show = this.showRepository.findByShowSubdomain(showSubdomain);
    if (show.isPresent()) {
      Show existingShow = show.get();

      String resolvedPlayingNow = playingNow;
      if (CollectionUtils.isNotEmpty(existingShow.getSequences())) {
        resolvedPlayingNow = existingShow.getSequences().stream()
            .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), playingNow))
            .map(Sequence::getDisplayName)
            .filter(StringUtils::isNotBlank)
            .findFirst()
            .orElse(playingNow);
      }

      this.showRepository.updatePlayingNow(showSubdomain, resolvedPlayingNow);
      return true;
    }
    log.errorf("updatePlayingNow unexpected: show not found for subdomain=%s, playingNow=%s", showSubdomain, playingNow);
    throw new CustomGraphQLExceptionResolver(StatusResponse.UNEXPECTED_ERROR.name());
  }

  public Boolean updatePlayingNext(String showSubdomain, String playingNext) {
    Optional<Show> show = this.showRepository.findByShowSubdomain(showSubdomain);
    if (show.isPresent()) {
      Show existingShow = show.get();

      String resolvedPlayingNext = playingNext;
      if (CollectionUtils.isNotEmpty(existingShow.getSequences())) {
        resolvedPlayingNext = existingShow.getSequences().stream()
            .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), playingNext))
            .map(Sequence::getDisplayName)
            .filter(StringUtils::isNotBlank)
            .findFirst()
            .orElse(playingNext);
      }

      this.showRepository.updatePlayingNext(showSubdomain, resolvedPlayingNext);
      return true;
    }
    log.errorf("updatePlayingNext unexpected: show not found for subdomain=%s, playingNext=%s", showSubdomain, playingNext);
    throw new CustomGraphQLExceptionResolver(StatusResponse.UNEXPECTED_ERROR.name());
  }

  public Boolean addSequenceToQueue(String showSubdomain, String name, Float latitude, Float longitude, String viewerId) {
    // Use optimized query that excludes large stats but keeps fields needed for validation
    Optional<Show> show = this.showRepository.findByShowSubdomainForMutations(showSubdomain);
    if (show.isPresent()) {
      Show existingShow = show.get();
      String clientIp = ClientUtil.getClientIP(context);
      if (StringUtils.isEmpty(clientIp)) {
        log.errorf("Client IP not found or empty in addSequenceToQueue: showSubdomain=%s, name=%s", showSubdomain, name);
        throw new CustomGraphQLExceptionResolver(StatusResponse.UNEXPECTED_ERROR.name());
      }
      if (this.isIpBlocked(clientIp, show.get())) {
        this.logRejectedRequest(showSubdomain, name, viewerId, StatusResponse.NAUGHTY.name());
        throw new CustomGraphQLExceptionResolver(StatusResponse.NAUGHTY.name());
      }
      if (this.hasViewerRequested(show.get(), clientIp)) {
        this.logRejectedRequest(showSubdomain, name, viewerId, StatusResponse.ALREADY_REQUESTED.name());
        throw new CustomGraphQLExceptionResolver(StatusResponse.ALREADY_REQUESTED.name());
      }
      if (this.isQueueFull(existingShow)) {
        this.logRejectedRequest(showSubdomain, name, viewerId, StatusResponse.QUEUE_FULL.name());
        throw new CustomGraphQLExceptionResolver(StatusResponse.QUEUE_FULL.name());
      }
      if (!this.isViewerPresent(existingShow, latitude, longitude)) {
        this.logRejectedRequest(showSubdomain, name, viewerId, StatusResponse.INVALID_LOCATION.name());
        throw new CustomGraphQLExceptionResolver(StatusResponse.INVALID_LOCATION.name());
      }
      Optional<Sequence> requestedSequence = show.get().getSequences().stream()
          .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), name))
          .findFirst();
      if (requestedSequence.isPresent()) {
        this.checkIfSequenceRequested(show.get(), requestedSequence.get());

        // PSA-v2 PR-3 (Q6): leader sequence injection. If the show has a
        // requestLeaderSequence configured and the named sequence exists in
        // the FPP-synced sequence list, inject it at the lower position so
        // the existing min-position dequeue plays the leader first, then
        // the viewer's request. Leader is marked viewerRequested="LEADER"
        // to mirror the PSA marker pattern. Same null/empty/missing-target
        // handling as PSAs: silently fall through if leader can't play.
        Optional<Sequence> leaderSequence = this.resolveRequestLeaderSequence(show.get());
        // Don't inject the leader when the viewer requested the leader
        // sequence itself — it would queue the same sequence twice
        // back-to-back. Mirrors the vote-leader guard in plugins-api
        // processWinningVote (PSA-v2 review item 9).
        if (leaderSequence.isPresent()
            && StringUtils.equalsIgnoreCase(leaderSequence.get().getName(), requestedSequence.get().getName())) {
          leaderSequence = Optional.empty();
        }

        // Build request and stat
        long nextPosition = this.showRepository.nextRequestPosition(existingShow);
        Request request = Request.builder()
            .sequence(requestedSequence.get())
            .ownerRequested(false)
            .viewerRequested(StringUtils.isEmpty(clientIp) ? "" : clientIp)
            .position(Math.toIntExact(leaderSequence.isPresent() ? nextPosition + 1 : nextPosition))
            .build();
        Stat.Jukebox jukeboxStat = Stat.Jukebox.builder()
            .dateTime(LocalDateTime.now())
            .name(requestedSequence.get().getName())
            .viewerId(viewerId)
            .build();

        if (leaderSequence.isPresent()) {
          // Leader gets the lower position so min-position dequeue plays it first.
          Request leaderRequest = Request.builder()
              .sequence(leaderSequence.get())
              .ownerRequested(false)
              .viewerRequested("LEADER")
              .position(Math.toIntExact(nextPosition))
              .build();
          // Batched write: single DB call for both rows + the (viewer-named) stat.
          this.showRepository.appendMultipleRequestsAndJukeboxStat(
              showSubdomain, List.of(leaderRequest, request), jukeboxStat);
        } else {
          // Batched write: single DB call for both request and stat
          this.showRepository.appendRequestAndJukeboxStat(showSubdomain, request, jukeboxStat);
        }

        // Bump session window so the request counts toward dwell tracking
        try {
          this.showRepository.upsertViewerSession(showSubdomain, clientIp, viewerId, LocalDateTime.now());
        } catch (Exception e) {
          log.warnf("upsertViewerSession failed for showSubdomain=%s: %s", showSubdomain, e.getMessage());
        }

        // Update in-memory list so PSA position calculation sees this request
        if (show.get().getRequests() == null) {
          show.get().setRequests(new ArrayList<>());
        }
        leaderSequence.ifPresent(seq -> show.get().getRequests().add(Request.builder()
            .sequence(seq)
            .ownerRequested(false)
            .viewerRequested("LEADER")
            .position(Math.toIntExact(nextPosition))
            .build()));
        show.get().getRequests().add(request);

        // Handle PSA if needed (calculate inline without re-fetching)
        if (show.get().getPreferences().getPsaEnabled() && !show.get().getPreferences().getManagePsa()
            && CollectionUtils.isNotEmpty(show.get().getPsaSequences())) {
          // Calculate total requests today (existing + 1 we just added)
          int requestsMadeToday = (int) show.get().getStats().getJukebox().stream()
              .filter(stat -> stat.getDateTime().isAfter(LocalDateTime.now().withHour(0).withMinute(0).withSecond(0)))
              .count() + 1; // +1 for the request we just added

          this.handlePsaForJukeboxInline(showSubdomain, show.get(), requestsMadeToday);
        }
        viewerMetrics.recordRequestSuccess();
        return true;
      } else { // It's a sequence group
        Optional<SequenceGroup> requestedSequenceGroup = show.get().getSequenceGroups().stream()
            .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), name))
            .findFirst();
        if (requestedSequenceGroup.isPresent()) {
          List<Sequence> sequencesInGroup = show.get().getSequences().stream()
              .filter(
                  sequence -> StringUtils.equalsIgnoreCase(requestedSequenceGroup.get().getName(), sequence.getGroup()))
              .sorted(Comparator.comparing(Sequence::getOrder))
              .toList();

          // Check all sequences first
          for (Sequence sequence : sequencesInGroup) {
            this.checkIfSequenceRequested(show.get(), sequence);
          }

          // Allocate all positions at once
          long startPosition = this.showRepository.allocatePositionBlock(existingShow, sequencesInGroup.size());

          // Build all requests using allocated positions
          List<Request> requests = new ArrayList<>();
          for (int i = 0; i < sequencesInGroup.size(); i++) {
            Request request = Request.builder()
                .sequence(sequencesInGroup.get(i))
                .ownerRequested(false)
                .viewerRequested(StringUtils.isEmpty(clientIp) ? "" : clientIp)
                .position(Math.toIntExact(startPosition + i))
                .build();
            requests.add(request);
          }
          Stat.Jukebox jukeboxStat = Stat.Jukebox.builder()
              .dateTime(LocalDateTime.now())
              .name(requestedSequenceGroup.get().getName())
              .viewerId(viewerId)
              .build();

          // Batched write: single DB call for all requests and stat
          this.showRepository.appendMultipleRequestsAndJukeboxStat(showSubdomain, requests, jukeboxStat);

          try {
            this.showRepository.upsertViewerSession(showSubdomain, clientIp, viewerId, LocalDateTime.now());
          } catch (Exception e) {
            log.warnf("upsertViewerSession failed for showSubdomain=%s: %s", showSubdomain, e.getMessage());
          }

          // Update in-memory list so PSA position calculation sees these requests
          if (show.get().getRequests() == null) {
            show.get().setRequests(new ArrayList<>());
          }
          show.get().getRequests().addAll(requests);

          // Handle PSA if needed (calculate inline without re-fetching)
          if (show.get().getPreferences().getPsaEnabled() && !show.get().getPreferences().getManagePsa()
              && CollectionUtils.isNotEmpty(show.get().getPsaSequences())) {
            // Calculate total requests today (existing + 1 we just added for the group)
            int requestsMadeToday = (int) show.get().getStats().getJukebox().stream()
                .filter(stat -> stat.getDateTime().isAfter(LocalDateTime.now().withHour(0).withMinute(0).withSecond(0)))
                .count() + 1; // +1 for the group request we just added

            this.handlePsaForJukeboxInline(showSubdomain, show.get(), requestsMadeToday);
          }
          viewerMetrics.recordRequestSuccess();
          return true;
        }
      }
      log.errorf("Sequence or sequence group not found: showSubdomain=%s, name=%s", showSubdomain, name);
      throw new CustomGraphQLExceptionResolver("SEQUENCE_NOT_FOUND");
    }
    log.errorf("Show not found: showSubdomain=%s", showSubdomain);
    throw new CustomGraphQLExceptionResolver(StatusResponse.UNEXPECTED_ERROR.name());
  }

  public Boolean voteForSequence(String showSubdomain, String name, Float latitude, Float longitude, String viewerId) {
    // Use optimized query that excludes large stats
    Optional<Show> show = this.showRepository.findByShowSubdomainForMutations(showSubdomain);
    if (show.isPresent()) {
      Show existingShow = show.get();
      String clientIp = ClientUtil.getClientIP(context);
      if (StringUtils.isEmpty(clientIp)) {
        log.errorf("Client IP not found or empty in voteForSequence: showSubdomain=%s, name=%s", showSubdomain, name);
        throw new CustomGraphQLExceptionResolver(StatusResponse.UNEXPECTED_ERROR.name());
      }
      if (this.isIpBlocked(clientIp, existingShow)) {
        throw new CustomGraphQLExceptionResolver(StatusResponse.NAUGHTY.name());
      }
      if (this.hasViewerVoted(existingShow, clientIp)) {
        throw new CustomGraphQLExceptionResolver(StatusResponse.ALREADY_VOTED.name());
      }
      if (!this.isViewerPresent(existingShow, latitude, longitude)) {
        throw new CustomGraphQLExceptionResolver(StatusResponse.INVALID_LOCATION.name());
      }
      Optional<Sequence> requestedSequence = existingShow.getSequences().stream()
          .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), name))
          .findFirst();
      if (requestedSequence.isPresent()) {
        this.saveSequenceVote(existingShow, requestedSequence.get(), clientIp, viewerId, false);
        try {
          this.showRepository.upsertViewerSession(showSubdomain, clientIp, viewerId, LocalDateTime.now());
        } catch (Exception e) {
          log.warnf("upsertViewerSession failed for showSubdomain=%s: %s", showSubdomain, e.getMessage());
        }
        viewerMetrics.recordVoteSuccess();
        return true;
      } else { // It's a sequence group
        Optional<SequenceGroup> votedSequenceGroup = existingShow.getSequenceGroups().stream()
            .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), name))
            .findFirst();
        if (votedSequenceGroup.isPresent()) {
          this.saveSequenceGroupVote(existingShow, votedSequenceGroup.get(), clientIp, viewerId);
          try {
            this.showRepository.upsertViewerSession(showSubdomain, clientIp, viewerId, LocalDateTime.now());
          } catch (Exception e) {
            log.warnf("upsertViewerSession failed for showSubdomain=%s: %s", showSubdomain, e.getMessage());
          }
          viewerMetrics.recordVoteSuccess();
          return true;
        }
      }
    }
    log.errorf("voteForSequence unexpected: show or sequence not found for subdomain=%s, name=%s", showSubdomain, name);
    throw new CustomGraphQLExceptionResolver(StatusResponse.UNEXPECTED_ERROR.name());
  }

  private boolean isIpBlocked(String ipAddress, Show show) {
    if (CollectionUtils.isNotEmpty(show.getPreferences().getBlockedViewerIps())) {
      return show.getPreferences().getBlockedViewerIps().contains(ipAddress);
    }
    return false;
  }

  private Boolean hasViewerRequested(Show show, String ipAddress) {
    if (BooleanUtils.isTrue(show.getPreferences().getCheckIfRequested())) {
      return show.getRequests().stream()
          .anyMatch(request -> StringUtils.equalsIgnoreCase(ipAddress, request.getViewerRequested()));
    }
    return false;
  }

  private Boolean hasViewerVoted(Show show, String ipAddress) {
    if (BooleanUtils.isTrue(show.getPreferences().getCheckIfVoted())) {
      return show.getVotes().stream().anyMatch(vote -> vote.getViewersVoted().contains(ipAddress));
    }
    return false;
  }

  private Boolean isQueueFull(Show show) {
    // PSA-v2 Q3 (#49) — count only viewer-initiated requests against
    // jukeboxDepth. PSAs and leader sequences (operator-policy injects)
    // bypass the cap entirely: they're not viewer demand and shouldn't
    // compete with viewers for the slots the setting is meant to govern.
    // Previous behavior counted everything in the requests array, which
    // silently halved viewer capacity at steady state when PSAs were
    // interleaved (e.g., jukeboxDepth=5 + psaFrequency=3 produced ~2
    // PSAs + ~3 viewer slots).
    if (show.getPreferences().getJukeboxDepth() == null
        || show.getPreferences().getJukeboxDepth() == 0) {
      return false;
    }
    return PluginQueueHelper.countViewerRequests(show) >= show.getPreferences().getJukeboxDepth();
  }

  private Boolean isViewerPresent(Show show, Float latitude, Float longitude) {
    if (show.getPreferences().getLocationCheckMethod() == LocationCheckMethod.GEO) {
      if (latitude == null || longitude == null) {
        return false;
      }
      if (show.getPreferences().getAllowedRadius() == null) {
        log.errorf("GPS check enabled but allowedRadius is null for show: %s", show.getShowSubdomain());
        return false;
      }
      Double distance = LocationUtil.asTheCrowFlies(
          show.getPreferences().getShowLatitude(),
          show.getPreferences().getShowLongitude(),
          latitude,
          longitude);
      return distance <= show.getPreferences().getAllowedRadius();
    }
    return true;
  }

  // V15 — log a refused addSequenceToQueue attempt for the conversion funnel.
  // Best-effort: failures here must not block the rejection path.
  private void logRejectedRequest(String showSubdomain, String sequenceName, String viewerId, String reason) {
    try {
      this.showRepository.appendRejectedRequestStat(
          showSubdomain,
          Stat.RejectedRequest.builder()
              .name(sequenceName)
              .viewerId(viewerId)
              .reason(reason)
              .dateTime(LocalDateTime.now())
              .build()
      );
    } catch (Exception e) {
      log.warnf("appendRejectedRequestStat failed for showSubdomain=%s reason=%s: %s", showSubdomain, reason, e.getMessage());
    }
  }

  private void checkIfSequenceRequested(Show show, Sequence requestedSequence) {
    if (this.isRequestedSequencePlayingNow(show, requestedSequence)) {
      this.logRejectedRequest(show.getShowSubdomain(), requestedSequence.getName(), null, StatusResponse.SEQUENCE_REQUESTED.name());
      throw new CustomGraphQLExceptionResolver(StatusResponse.SEQUENCE_REQUESTED.name());
    }
    if (this.isRequestedSequencePlayingNext(show, requestedSequence)) {
      this.logRejectedRequest(show.getShowSubdomain(), requestedSequence.getName(), null, StatusResponse.SEQUENCE_REQUESTED.name());
      throw new CustomGraphQLExceptionResolver(StatusResponse.SEQUENCE_REQUESTED.name());
    }
    if (this.isRequestedSequenceWithinRequestLimit(show, requestedSequence)) {
      this.logRejectedRequest(show.getShowSubdomain(), requestedSequence.getName(), null, StatusResponse.SEQUENCE_REQUESTED.name());
      throw new CustomGraphQLExceptionResolver(StatusResponse.SEQUENCE_REQUESTED.name());
    }
  }

  private Boolean isRequestedSequencePlayingNow(Show show, Sequence requestedSequence) {
    return StringUtils.equalsIgnoreCase(show.getPlayingNow(), requestedSequence.getName())
        || (StringUtils.isNotEmpty(requestedSequence.getDisplayName())
            && StringUtils.equalsIgnoreCase(show.getPlayingNow(), requestedSequence.getDisplayName()));
  }

  private Boolean isRequestedSequencePlayingNext(Show show, Sequence requestedSequence) {
    return StringUtils.equalsIgnoreCase(show.getPlayingNext(), requestedSequence.getName())
        || (StringUtils.isNotEmpty(requestedSequence.getDisplayName())
            && StringUtils.equalsIgnoreCase(show.getPlayingNext(), requestedSequence.getDisplayName()));
  }

  private Boolean isRequestedSequenceWithinRequestLimit(Show show, Sequence requestedSequence) {
    if (show.getPreferences().getJukeboxRequestLimit() != 0) {
      // Count only viewer song requests in the "last N" dedup window.
      // Operator-injected rows (PSAs, leaders, overrides) must not consume
      // window slots, or a real recent request falls out of the window and
      // becomes re-requestable (PSA-v2 review item 10). isSongLike excludes
      // PSA/leader names — the same predicate isQueueFull uses.
      List<String> requestNamesLastToFirst = show.getRequests().stream()
          .filter(request -> request.getSequence() != null
              && PluginQueueHelper.isSongLike(show, request.getSequence().getName()))
          .sorted(Comparator.comparing(Request::getPosition)
              .reversed())
          .limit(show.getPreferences().getJukeboxRequestLimit())
          .map(request -> request.getSequence().getName())
          .toList();
      return requestNamesLastToFirst.contains(requestedSequence.getName());
    }
    return false;
  }

  private void saveSequenceRequest(String showSubdomain, Show show, Sequence requestedSequence, String ipAddress) {
    long nextPosition = this.showRepository.nextRequestPosition(show);
    Request request = Request.builder()
        .sequence(requestedSequence)
        .ownerRequested(false)
        .viewerRequested(StringUtils.isEmpty(ipAddress) ? "" : ipAddress)
        .position(Math.toIntExact(nextPosition))
        .build();
    this.showRepository.appendRequest(showSubdomain, request);
    if (CollectionUtils.isEmpty(show.getRequests())) {
      show.setRequests(new ArrayList<>());
    }
    show.getRequests().add(request);
  }

  /**
   * PSA-v2 PR-3 (Q6): resolves the configured request-leader sequence to a
   * playable {@link Sequence}. Returns empty when:
   * <ul>
   *   <li>the show has no {@code requestLeaderSequence} configured
   *       (null or blank — admin cleared the field), or</li>
   *   <li>the configured name doesn't match any sequence in
   *       {@code show.getSequences()} (FPP-synced source of truth) — same
   *       silent-skip semantics PSAs use when their target sequence is missing
   *       from FPP.</li>
   * </ul>
   */
  private Optional<Sequence> resolveRequestLeaderSequence(Show show) {
    String leaderName = show.getRequestLeaderSequence();
    if (StringUtils.isBlank(leaderName) || CollectionUtils.isEmpty(show.getSequences())) {
      return Optional.empty();
    }
    return show.getSequences().stream()
        .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), leaderName))
        .findFirst();
  }

  private void handlePsaForJukeboxInline(String showSubdomain, Show show, int requestsMadeToday) {
    // Inline PSA handling that doesn't require re-fetching show
    if (requestsMadeToday % show.getPreferences().getPsaFrequency() == 0) {
      // Honor the Q1 enabled toggle (review item 7): a PSA soft-disabled via
      // the Special Roles tab must not be injected in unmanaged jukebox mode,
      // matching the managed path's enabled filter. nullsFirst on lastPlayed
      // (review item 14) treats a never-played PSA as highest priority instead
      // of NPEing, and the null-safe order/name tie-break mirrors
      // handlePsaRoundRobin so all PSA pickers order identically.
      Optional<PsaSequence> nextPsaSequence = show.getPsaSequences().stream()
          .filter(psa -> psa != null && !Boolean.FALSE.equals(psa.getEnabled()))
          .min(Comparator
              .comparing(PsaSequence::getLastPlayed, Comparator.nullsFirst(Comparator.naturalOrder()))
              .thenComparing(psa -> psa.getOrder() != null ? psa.getOrder() : Integer.MAX_VALUE)
              .thenComparing(psa -> psa.getName() != null ? psa.getName() : ""));
      if (nextPsaSequence.isPresent()) {
        Optional<Sequence> sequenceToAdd = show.getSequences().stream()
            .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), nextPsaSequence.get().getName()))
            .findFirst();
        show.getPsaSequences().get(show.getPsaSequences().indexOf(nextPsaSequence.get()))
            .setLastPlayed(LocalDateTime.now());
        this.showRepository.updatePsaSequences(showSubdomain, show.getPsaSequences());
        sequenceToAdd.ifPresent(sequence -> this.saveSequenceRequest(showSubdomain, show, sequence, "PSA"));
      }
    }
  }

  private void saveSequenceVote(Show show, Sequence votedSequence, String ipAddress, String viewerId, Boolean isGrouped) {
    Optional<Vote> sequenceVotes = show.getVotes().stream()
        .filter(vote -> vote.getSequence() != null)
        .filter(vote -> StringUtils.equalsIgnoreCase(vote.getSequence().getName(), votedSequence.getName()))
        .findFirst();

    LocalDateTime voteTime = LocalDateTime.now();
    String voterIp = StringUtils.isEmpty(ipAddress) ? "" : ipAddress;

    if (sequenceVotes.isPresent()) {
      // Existing vote: increment count, append voter, update time, and add stat
      Stat.Voting votingStat = isGrouped ? null : Stat.Voting.builder()
          .dateTime(voteTime)
          .name(votedSequence.getName())
          .viewerId(viewerId)
          .build();

      if (isGrouped) {
        // For grouped votes, don't add voting stat
        this.showRepository.incrementVoteAndAppendVoter(show.getShowSubdomain(), votedSequence.getName(), voterIp, voteTime, null);
      } else {
        this.showRepository.incrementVoteAndAppendVoter(show.getShowSubdomain(), votedSequence.getName(), voterIp, voteTime, votingStat);
      }
    } else {
      // New vote: add vote entry and stat
      Vote newVote = Vote.builder()
          .sequence(votedSequence)
          .ownerVoted(false)
          .lastVoteTime(voteTime)
          .viewersVoted(List.of(voterIp))
          .votes(isGrouped ? 1001 : 1)
          .build();

      Stat.Voting votingStat = isGrouped ? null : Stat.Voting.builder()
          .dateTime(voteTime)
          .name(votedSequence.getName())
          .viewerId(viewerId)
          .build();

      this.showRepository.addNewVoteAndStat(show.getShowSubdomain(), newVote, votingStat);
    }
  }

  private void saveSequenceGroupVote(Show show, SequenceGroup votedSequenceGroup, String ipAddress, String viewerId) {
    Optional<Vote> sequenceVotes = show.getVotes().stream()
        .filter(vote -> vote.getSequenceGroup() != null)
        .filter(vote -> StringUtils.equalsIgnoreCase(vote.getSequenceGroup().getName(), votedSequenceGroup.getName()))
        .findFirst();

    LocalDateTime voteTime = LocalDateTime.now();
    Stat.Voting votingStat = Stat.Voting.builder()
        .dateTime(voteTime)
        .name(votedSequenceGroup.getName())
        .viewerId(viewerId)
        .build();

    if (sequenceVotes.isPresent()) {
      // Existing vote: increment count, append voter, update time, and add stat
      this.showRepository.incrementSequenceGroupVoteAndAppendVoter(
          show.getShowSubdomain(),
          votedSequenceGroup.getName(),
          ipAddress,
          voteTime,
          votingStat
      );
    } else {
      // New vote: add vote entry and stat
      Vote newVote = Vote.builder()
          .sequenceGroup(votedSequenceGroup)
          .ownerVoted(false)
          .lastVoteTime(voteTime)
          .viewersVoted(List.of(ipAddress))
          .votes(1)
          .build();

      this.showRepository.addNewVoteAndStat(show.getShowSubdomain(), newVote, votingStat);
    }
  }
}
