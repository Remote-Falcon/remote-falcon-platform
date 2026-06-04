package com.remotefalcon.plugins.api.service;

import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.library.util.PluginQueueHelper;
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

  // Markers stored in Request.viewerRequested for operator-injected (not
  // viewer-driven) queue entries. These must survive the per-poll viewer-IP
  // scrub in updateWhatsPlaying: control-panel's "cancel pending override"
  // and the viewer's strip filter both identify injected rows by these.
  private static final Set<String> OPERATOR_INJECTION_MARKERS = Set.of("OVERRIDE", "LEADER", "PSA");

  // Vote priority tiers (higher wins): cadence/override PSA = 2000, a winner
  // re-queued after its vote-leader played = 2001. The 2001 value doubles as
  // the "already led" sentinel — a promoted winner coming back around must
  // NOT re-trigger the leader, or the leader plays every cycle and the
  // winning song never plays (PSA-v2 review item 1).
  private static final int LEADER_PROMOTED_WINNER_VOTES = 2001;

  public NextPlaylistResponse nextPlaylistInQueue() {
    Show show = showContext.getShow();
    NextPlaylistResponse defaultResponse = NextPlaylistResponse.builder()
        .nextPlaylist(null)
        .playlistIndex(-1)
        .build();
    if (CollectionUtils.isEmpty(show.getRequests())) {
      return defaultResponse;
    }
    // Return the next queued item (by position) verbatim, including PSAs
    // and leaders. This endpoint is the *plugin-facing* one — FPP calls it
    // to ask "what should play next?" and then actually plays whatever we
    // return. PSAs injected via handleManagedPSA (Q1/Q4/Q7) and leaders
    // injected via addSequenceToQueue (Q6) only reach playback if FPP can
    // fetch them here, so we must NOT skip them.
    //
    // The viewer-facing filtering (the Q2 isSongLike skip predicate) still
    // happens — but at the viewer's GraphQLQueryService.updatePlayingNext.
    // That's the correct boundary: viewer doesn't see PSAs as "up next";
    // FPP still plays them.
    Optional<Request> nextRequest = show.getRequests().stream()
        .filter(r -> r != null && r.getSequence() != null)
        .min(Comparator.comparing(Request::getPosition));
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

      // PSA-v2 — operator-policy items (PSAs and leader sequences) are both
      // transparent to the cadence counter: do not increment (do not reset
      // either). Songs increment as before. This makes psaFrequency=N
      // honestly mean "every N audience-facing songs."
      //
      // Leaders are treated the same as PSAs here (PSA-v2 design symmetry):
      // both are operator-policy interstitials, both bypass jukeboxDepth,
      // both are filtered from viewer-facing NEXT_PLAYLIST, and both must
      // be transparent to the cadence so leader playback doesn't
      // accidentally shorten the PSA-frequency window.
      if (PluginQueueHelper.isSongLike(show, request.getPlaylist())) {
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

      // Clear viewer IPs before persisting, but PRESERVE operator-injection
      // markers (OVERRIDE/LEADER/PSA). Nulling them on every FPP poll silently
      // broke control-panel's "cancel pending override" (removeIf OVERRIDE)
      // and the viewer's strip filter after a single tick (PSA-v2 review
      // item 6) — they could no longer identify the injected rows.
      if (show.getRequests() != null) {
        show.getRequests().forEach(req -> {
          String marker = req.getViewerRequested();
          if (marker == null || !OPERATOR_INJECTION_MARKERS.contains(marker)) {
            req.setViewerRequested(null);
          }
        });
      }
      if (show.getVotes() != null) {
        show.getVotes().forEach(vote -> vote.setViewersVoted(new ArrayList<>()));
      }

      // Atomic update for all the modified fields. nextPsaOverride is included
      // because handlePsaOverride clears it in memory after consuming —
      // without persisting that null, the pill on Special Roles would never
      // disappear after FPP fires the override (PSA-v2 PR-2 smoke-test bug).
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.combine(
              Updates.set("playingNow", request.getPlaylist()),
              Updates.set("preferences.sequencesPlayed", sequencesPlayed),
              Updates.set("sequences", sequences),
              Updates.set("sequenceGroups", sequenceGroups),
              Updates.set("psaSequences", show.getPsaSequences() != null ? show.getPsaSequences() : new ArrayList<>()),
              Updates.set("requests", show.getRequests() != null ? show.getRequests() : new ArrayList<>()),
              Updates.set("votes", show.getVotes() != null ? show.getVotes() : new ArrayList<>()),
              Updates.set("nextPsaOverride", show.getNextPsaOverride())
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

  /**
   * PSA-v2 cadence-tick handler. Implements three design decisions in order:
   *
   * <ol>
   *   <li><b>Q7 — operator-pick override</b>: if {@code Show.nextPsaOverride}
   *       is set, fire that PSA out-of-band (does NOT tick the cadence
   *       counter — Q4 cadence-counter fix already makes PSAs transparent to
   *       sequencesPlayed). The field clears after firing (single-shot).
   *       If the override target is missing/disabled/non-existent in FPP,
   *       the field is still cleared (with a warning logged) so a broken
   *       override doesn't get stuck.</li>
   *   <li><b>Q4 — play-all PSAs burst</b>: at a cadence tick, when
   *       {@code Preference.playAllPsas} is true, inject ALL enabled +
   *       FPP-existent PSAs in {@code order} ascending. All share a single
   *       {@code lastPlayed} timestamp. The Q7 override, if it fired in
   *       step 1, runs BEFORE the burst (override first, then burst).</li>
   *   <li><b>Q1 — round-robin pick</b>: default behavior. Pick the enabled,
   *       FPP-existent PSA with min {@code lastPlayed} (null plays first),
   *       tie-break by {@code order} ascending then by name. Inject it and
   *       update {@code lastPlayed}.</li>
   * </ol>
   *
   * <p><b>No-loop invariant</b>: PR-1 removed the {@code sequencesPlayed=0}
   * reset on PSA. Back-to-back PSA prevention now relies on the existing
   * {@code isPSAPlayingNow} guard (playingNow matching a PSA name). The
   * guard runs before BOTH the override path and the cadence-tick path, so
   * a PSA injected this tick cannot trigger another at the next tick while
   * it's still playing.
   *
   * <p><b>Legacy null handling</b>: {@code playAllPsas} and
   * {@code PsaSequence.enabled} are boxed Booleans with no default. Legacy
   * shows have them null. {@code playAllPsas} null is treated as false
   * ({@link Boolean#TRUE}{@code .equals(...)}); {@code enabled} null is
   * treated as true (a PSA is enabled unless explicitly disabled).
   */
  private void handleManagedPSA(int sequencesPlayed, Show show, Set<String> psaNamesLowerCase) {
    List<PsaSequence> psaSequences = show.getPsaSequences();
    if (CollectionUtils.isEmpty(psaSequences) || CollectionUtils.isEmpty(psaNamesLowerCase)) {
      return;
    }

    // No-loop guard — refuses to fire a PSA while another operator-policy
    // non-song item (PSA or leader) is already playing. Same predicate
    // applies to override (Q7) and cadence-tick (Q1/Q4) paths, so a PSA
    // can't trigger right after another PSA OR a leader. Symmetric with
    // PSA-v2 design: leaders are treated like PSAs everywhere.
    boolean isNonSongPlayingNow = StringUtils.isNotEmpty(show.getPlayingNow())
        && !PluginQueueHelper.isSongLike(show, show.getPlayingNow());
    if (isNonSongPlayingNow) {
      return;
    }

    // Step 1 — Q7 override check. Out-of-band: doesn't depend on the cadence
    // window, doesn't tick sequencesPlayed (already transparent per PR-1).
    // Capture the target BEFORE handlePsaOverride consumes/clears it so the
    // burst below can skip it (it's already queued at the front).
    String overrideTarget = show.getNextPsaOverride();
    boolean overrideFired = this.handlePsaOverride(show, psaSequences, psaNamesLowerCase);

    // Step 2/3 are gated on the cadence window AND the managed-PSA toggles.
    // The override above is intentionally NOT gated on these — operator
    // intent is honored regardless of cadence state. Burst-with-override
    // still requires the cadence window to elapse (per PRD §7 "Q4 burst
    // interaction": override fires first AT the cadence boundary).
    if (!show.getPreferences().getPsaEnabled()
        || !show.getPreferences().getManagePsa()
        || show.getPreferences().getPsaFrequency() == null
        || show.getPreferences().getPsaFrequency() <= 0
        || sequencesPlayed == 0
        || sequencesPlayed % show.getPreferences().getPsaFrequency() != 0) {
      return;
    }

    // Dedup guard (PSA-v2) — in voting mode a cadence PSA is injected as a
    // priority vote (2000) that highestVotedPlaylist consumes one-at-a-time;
    // with resetVotes off, a PSA win doesn't clear the rest. The managed path
    // previously appended a fresh PSA vote every qualifying tick with no
    // check, so at psaFrequency=1 injection outran consumption: PSA votes
    // stacked up and played back-to-back, ignoring the frequency. Mirror the
    // unmanaged path's isPsaInVotes guard — if a configured PSA is already
    // pending in votes, skip this tick's injection (keeps <=1 pending for
    // round-robin; one set for burst, which won't re-burst until consumed).
    // Jukebox is unaffected (it consumes PSAs from the request queue by
    // position), and the Q7 override above is intentionally NOT gated.
    if (show.getPreferences().getViewerControlMode() == ViewerControlMode.VOTING
        && show.getVotes() != null
        && show.getVotes().stream().anyMatch(vote -> vote != null
            && vote.getSequence() != null
            && vote.getSequence().getName() != null
            && psaNamesLowerCase.contains(vote.getSequence().getName().toLowerCase()))) {
      return;
    }

    // Step 2 — Q4 burst. When playAllPsas is true, fire all enabled +
    // FPP-existent PSAs in `order` ascending, sharing one timestamp. Exclude
    // the override PSA when it already fired this tick — otherwise the
    // operator's pick is injected twice (front via override + again in the
    // burst) and plays twice in one cycle (PSA-v2 review item 5).
    if (Boolean.TRUE.equals(show.getPreferences().getPlayAllPsas())) {
      this.handlePsaBurst(show, psaSequences, psaNamesLowerCase, overrideFired ? overrideTarget : null);
      return;
    }

    // Step 3 — Q1 round-robin pick (default). Skip if the override already
    // fired at this tick — operator's pick replaces the round-robin slot
    // (PRD §7 Q7e). The override's lastPlayed update is enough; no need to
    // also pick a round-robin PSA at the same tick.
    if (overrideFired) {
      return;
    }
    this.handlePsaRoundRobin(show, psaSequences, psaNamesLowerCase);
  }

  /**
   * Q7 — fires the operator-picked override PSA if one is pending.
   * Returns true if an override was processed (whether or not it was
   * actually injected — a missing/disabled target still clears the field).
   */
  private boolean handlePsaOverride(Show show, List<PsaSequence> psaSequences, Set<String> psaNamesLowerCase) {
    String overrideName = show.getNextPsaOverride();
    if (StringUtils.isEmpty(overrideName)) {
      return false;
    }

    Optional<PsaSequence> overridePsa = psaSequences.stream()
        .filter(Objects::nonNull)
        .filter(psa -> StringUtils.equalsIgnoreCase(psa.getName(), overrideName))
        .findFirst();

    boolean playable = overridePsa.isPresent()
        && !Boolean.FALSE.equals(overridePsa.get().getEnabled())
        && this.sequenceExistsInFPP(show, overridePsa.get().getName());

    if (playable) {
      Optional<Sequence> sequenceToAdd = show.getSequences().stream()
          .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), overridePsa.get().getName()))
          .findFirst();
      if (sequenceToAdd.isPresent()) {
        overridePsa.get().setLastPlayed(LocalDateTime.now());
        // Q7: operator-pick fires at NEXT sequence boundary — use the priority
        // variant so the PSA pre-empts whatever was already queued by cadence,
        // burst, or stale prior runs.
        this.injectPsaPriority(show, sequenceToAdd.get(), psaNamesLowerCase);
      } else {
        // Defensive: sequenceExistsInFPP passed but stream lookup failed.
        // Treat as missing — clear the override.
        LOG.warnf("PSA-v2 override for showToken=%s: PSA '%s' resolved but sequence missing on lookup; clearing override.",
            show.getShowToken(), overrideName);
        playable = false;
      }
    } else {
      LOG.warnf("PSA-v2 override for showToken=%s: target PSA '%s' missing, disabled, or has no matching FPP sequence; clearing override.",
          show.getShowToken(), overrideName);
    }

    // Single-shot — clear regardless of success so a broken override
    // doesn't stay pending.
    show.setNextPsaOverride(null);
    return playable;
  }

  /**
   * Q4 — bursts all enabled + FPP-existent PSAs in `order` ascending,
   * tie-breaking by name. All PSAs share the same `lastPlayed` timestamp.
   */
  private void handlePsaBurst(Show show, List<PsaSequence> psaSequences, Set<String> psaNamesLowerCase, String excludeName) {
    LocalDateTime burstTimestamp = LocalDateTime.now();

    List<PsaSequence> burst = psaSequences.stream()
        .filter(Objects::nonNull)
        .filter(psa -> !Boolean.FALSE.equals(psa.getEnabled()))
        .filter(psa -> StringUtils.isBlank(excludeName) || !StringUtils.equalsIgnoreCase(psa.getName(), excludeName))
        .filter(psa -> this.sequenceExistsInFPP(show, psa.getName()))
        .sorted(Comparator
            .comparing((PsaSequence p) -> p.getOrder() != null ? p.getOrder() : Integer.MAX_VALUE)
            .thenComparing(p -> p.getName() != null ? p.getName() : ""))
        .toList();

    if (burst.isEmpty()) {
      LOG.warnf("PSA-v2 burst for showToken=%s: no enabled PSAs match an FPP sequence; nothing to inject.",
          show.getShowToken());
      return;
    }

    for (PsaSequence psa : burst) {
      Optional<Sequence> sequenceToAdd = show.getSequences().stream()
          .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), psa.getName()))
          .findFirst();
      if (sequenceToAdd.isPresent()) {
        psa.setLastPlayed(burstTimestamp);
        this.injectPsa(show, sequenceToAdd.get(), psaNamesLowerCase);
      }
    }
  }

  /**
   * Q1 — round-robin: pick the enabled + FPP-existent PSA with min
   * {@code lastPlayed} (null plays first — treated as -infinity by sorting
   * null-firsts), tie-break by {@code order} ascending then by name.
   */
  private void handlePsaRoundRobin(Show show, List<PsaSequence> psaSequences, Set<String> psaNamesLowerCase) {
    Optional<PsaSequence> nextPsaSequence = psaSequences.stream()
        .filter(Objects::nonNull)
        .filter(psa -> !Boolean.FALSE.equals(psa.getEnabled()))
        .filter(psa -> this.sequenceExistsInFPP(show, psa.getName()))
        .min(Comparator
            .comparing(PsaSequence::getLastPlayed, Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing((PsaSequence p) -> p.getOrder() != null ? p.getOrder() : Integer.MAX_VALUE)
            .thenComparing(p -> p.getName() != null ? p.getName() : ""));

    if (nextPsaSequence.isEmpty()) {
      LOG.warnf("PSA-v2 round-robin for showToken=%s: no enabled PSAs match an FPP sequence; nothing to inject.",
          show.getShowToken());
      return;
    }

    Optional<Sequence> sequenceToAdd = show.getSequences().stream()
        .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), nextPsaSequence.get().getName()))
        .findFirst();
    if (sequenceToAdd.isEmpty()) {
      // sequenceExistsInFPP passed but stream lookup failed (e.g. case-only
      // mismatch caught by case-insensitive compare). Skip rather than NPE.
      return;
    }

    nextPsaSequence.get().setLastPlayed(LocalDateTime.now());
    this.injectPsa(show, sequenceToAdd.get(), psaNamesLowerCase);
  }

  /**
   * Returns true when {@code psaName} matches an active sequence on the
   * show's FPP-synced sequence list (case-insensitive). Mirrors the existing
   * pattern used elsewhere in this file (e.g. round-robin's
   * {@code show.getSequences().stream()...equalsIgnoreCase}). The Show's
   * sequences list is the FPP-synced source of truth — populated by
   * {@link #syncPlaylists(SyncPlaylistRequest)} — so a name absent from it
   * means the PSA references a sequence that no longer exists in FPP.
   */
  private boolean sequenceExistsInFPP(Show show, String psaName) {
    if (StringUtils.isEmpty(psaName) || CollectionUtils.isEmpty(show.getSequences())) {
      return false;
    }
    return show.getSequences().stream()
        .filter(Objects::nonNull)
        .anyMatch(seq -> StringUtils.equalsIgnoreCase(seq.getName(), psaName));
  }

  /**
   * Mode-aware PSA injection — routes to the jukebox or voting helper based
   * on viewer control mode. Centralizes the JUKEBOX vs VOTING branch so the
   * override, burst, and round-robin paths all inject identically.
   *
   * <p>Cadence-driven injections (Q1 round-robin, Q4 burst) append at the
   * end of the queue. Use {@link #injectPsaPriority} for the Q7 operator
   * override path so the PSA pre-empts whatever is already queued.
   */
  private void injectPsa(Show show, Sequence sequence, Set<String> psaNamesLowerCase) {
    if (show.getPreferences().getViewerControlMode() == ViewerControlMode.JUKEBOX) {
      this.setPSASequenceRequest(show, sequence, psaNamesLowerCase, false);
    } else if (show.getPreferences().getViewerControlMode() == ViewerControlMode.VOTING) {
      this.setPSASequenceVote(show, sequence, psaNamesLowerCase);
    }
  }

  /**
   * Q7 operator-override variant of {@link #injectPsa} — the PSA is placed
   * at the front of the queue (position = current min - 1, or 1 if empty)
   * so it plays at the next sequence boundary rather than after whatever
   * cadence-injected PSAs were already queued.
   */
  private void injectPsaPriority(Show show, Sequence sequence, Set<String> psaNamesLowerCase) {
    if (show.getPreferences().getViewerControlMode() == ViewerControlMode.JUKEBOX) {
      this.setPSASequenceRequest(show, sequence, psaNamesLowerCase, true);
    } else if (show.getPreferences().getViewerControlMode() == ViewerControlMode.VOTING) {
      // Voting-mode override: leave at the existing PSA priority (2000)
      // for now. Voting-winner promotion (PR-3) already runs the leader at
      // 2001; bumping the override to 2002 would require a coordinated
      // priority tier rework. Tracked as a follow-up.
      this.setPSASequenceVote(show, sequence, psaNamesLowerCase);
    }
  }

  private void setPSASequenceRequest(Show show, Sequence requestedSequence, Set<String> psaNamesLowerCase, boolean priority) {
    if (show.getRequests() == null) {
      show.setRequests(new ArrayList<>());
    }
    if (show.getVotes() == null) {
      show.setVotes(new ArrayList<>());
    }

    // Position assignment depends on whether this is a Q7 operator-override
    // (priority=true → front of queue, plays next) or a normal Q1 round-robin
    // / Q4 burst injection (priority=false → back of queue, plays after
    // anything already there).
    int nextPosition;
    if (CollectionUtils.isEmpty(show.getRequests())) {
      nextPosition = 1;
    } else if (priority) {
      nextPosition = show.getRequests().stream()
          .map(Request::getPosition)
          .min(Integer::compareTo)
          .orElse(1) - 1;
    } else {
      nextPosition = show.getRequests().stream()
          .map(Request::getPosition)
          .max(Integer::compareTo)
          .orElse(0) + 1;
    }

    // Always add PSA to votes with high priority (2000) for jukebox mode
    show.getVotes().add(Vote.builder()
        .sequence(requestedSequence)
        .ownerVoted(false)
        .systemInjected(true)
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
        .systemInjected(true)
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
            .systemInjected(true)
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
              .systemInjected(true)
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
            // Honor the Q1 enabled toggle (review item 7) and treat a
            // never-played PSA (null lastPlayed) as highest priority via
            // nullsFirst rather than excluding it (review item 12) — a
            // freshly-added PSA was previously never selectable in unmanaged
            // voting. Mirrors handlePsaRoundRobin's comparator.
            Optional<PsaSequence> nextPsaSequence = show.getPsaSequences().stream()
                .filter(Objects::nonNull)
                .filter(psaSequence -> !Boolean.FALSE.equals(psaSequence.getEnabled()))
                .min(Comparator
                    .comparing(PsaSequence::getLastPlayed, Comparator.nullsFirst(Comparator.naturalOrder()))
                    .thenComparing(psaSequence -> psaSequence.getOrder() != null ? psaSequence.getOrder() : Integer.MAX_VALUE)
                    .thenComparing(psaSequence -> psaSequence.getName() != null ? psaSequence.getName() : ""));
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
                    .systemInjected(true)
                    .lastVoteTime(LocalDateTime.now())
                    .votes(2000)
                    .build()));
              }
            }
          }
        }

        // PSA-v2 PR-3 (Q6): voting-mode leader injection. When the show has a
        // voteLeaderSequence configured and the name resolves to a real
        // sequence in show.getSequences(), play the leader THIS cycle and
        // re-queue the actual winner with a high vote count so it wins NEXT
        // cycle. votes=2001 beats the PSA injection above (2000) and any
        // genuine viewer vote, so the order is guaranteed: leader now, then
        // winner, then any PSA. Skip when the winner is itself a PSA (don't
        // gild operator-policy interstitials) or when the configured leader
        // name matches the winning sequence (would create a no-op loop).
        // A winner re-queued by a prior leader cycle comes back at
        // LEADER_PROMOTED_WINNER_VOTES. It must NOT re-trigger the leader, or
        // the leader plays every cycle and the winning song never plays —
        // the re-queued winner would win, fire the leader, get re-queued, and
        // loop forever (PSA-v2 review item 1). When already-led, fall through
        // to play the winner.
        boolean winnerAlreadyLed = winningVote.getVotes() != null
            && winningVote.getVotes() == LEADER_PROMOTED_WINNER_VOTES;
        Optional<Sequence> leaderSequence = this.resolveVoteLeaderSequence(show);
        if (leaderSequence.isPresent()
            && !winningSequenceIsPSA
            && !winnerAlreadyLed
            && !StringUtils.equalsIgnoreCase(leaderSequence.get().getName(), actualSequence.get().getName())) {
          show.getVotes().add(Vote.builder()
              .sequence(actualSequence.get())
              .ownerVoted(false)
              .systemInjected(true)
              .lastVoteTime(LocalDateTime.now())
              .votes(LEADER_PROMOTED_WINNER_VOTES)
              .build());

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

          // Return the leader as this cycle's winner. The actual winner is
          // queued above and will be returned by the next call.
          return HighestVotedPlaylistResponse.builder()
              .winningPlaylist(leaderSequence.get().getName())
              .playlistIndex(leaderSequence.get().getIndex())
              .build();
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

  /**
   * PSA-v2 PR-3 (Q6): resolves the configured vote-leader sequence to a
   * playable {@link Sequence}. Returns empty when the show has no
   * {@code voteLeaderSequence} (null or blank — admin cleared the field), or
   * when the configured name doesn't match any sequence in
   * {@code show.getSequences()} (FPP-synced source of truth). Same
   * silent-skip semantics PSAs use when their target sequence is missing.
   */
  private Optional<Sequence> resolveVoteLeaderSequence(Show show) {
    String leaderName = show.getVoteLeaderSequence();
    if (StringUtils.isBlank(leaderName) || CollectionUtils.isEmpty(show.getSequences())) {
      return Optional.empty();
    }
    return show.getSequences().stream()
        .filter(Objects::nonNull)
        .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), leaderName))
        .findFirst();
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
