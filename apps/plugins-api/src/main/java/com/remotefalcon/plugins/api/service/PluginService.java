package com.remotefalcon.plugins.api.service;

import com.mongodb.client.model.Filters;
import com.mongodb.client.model.UpdateOptions;
import com.mongodb.client.model.Updates;
import com.mongodb.client.result.UpdateResult;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.util.NightlyPlayLimitHelper;
import com.remotefalcon.library.models.*;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.library.util.PluginQueueHelper;
import com.remotefalcon.plugins.api.cache.TtlKeySet;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.model.*;
import com.remotefalcon.plugins.api.mongo.MongoGuarded;

import io.quarkus.logging.Log;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import org.bson.Document;
import org.bson.conversions.Bson;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.stream.Collectors;

// Writes go straight to Show.mongoCollection(), so the service itself is
// guarded by the Mongo circuit breaker (MongoGuardedInterceptor). Nested
// repository calls are recorded once, on the outer service call.
@MongoGuarded
@RequestScoped
public class PluginService {

  private static final Logger LOG = Logger.getLogger(PluginService.class);

  // Per-pod rate limit for the INFO line on no-op syncPlaylists calls.
  private static final Duration SYNC_PLAYLISTS_NOOP_LOG_WINDOW = Duration.ofMinutes(10);
  private static final TtlKeySet SYNC_PLAYLISTS_NOOP_LOGGED = new TtlKeySet(SYNC_PLAYLISTS_NOOP_LOG_WINDOW, 10_000);

  @Inject
  ShowContext showContext;

  @Inject
  com.remotefalcon.plugins.api.repository.ShowRepository showRepository;

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
    NextPlaylistResponse defaultResponse = NextPlaylistResponse.empty();
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
    List<Request> orderedRequests = show.getRequests().stream()
        .filter(r -> r != null && r.getSequence() != null)
        .sorted(Comparator.comparing(Request::getPosition))
        .toList();
    if (orderedRequests.isEmpty()) {
      return defaultResponse;
    }
    // #109 anti-consecutive (PRD-009, ADR-3): skip a queued request whose
    // category matches the just-playing sequence's category when that category
    // is flagged antiConsecutive and an alternative is queued. Operator-policy
    // items (PSA/leader/override/owner) keep their slot; the rule yields to the
    // head when every queued item shares the blocked category.
    Request nextRequest = this.selectNextRequest(show, orderedRequests);
    ElementWrites writes = new ElementWrites();
    writes.add(Updates.pull("requests", Filters.eq("position", nextRequest.getPosition())));
    this.updateVisibilityCounts(show, nextRequest, writes);

    // Atomic removal of the request by position plus the one visibility
    // count it changed (R3: a targeted element write, not the whole arrays).
    writes.apply(show.getShowToken());

    return NextPlaylistResponse.builder()
        .nextPlaylist(nextRequest.getSequence().getName())
        .playlistIndex(nextRequest.getSequence().getIndex())
        .build();
  }

  /**
   * The show's hideSequenceCount, with an unset value read as 0 (no
   * cooldown). Legacy documents can carry an explicit null; unboxing it
   * threw, so every vote/dequeue on such a show answered 500.
   */
  static int hideSequenceCount(Show show) {
    Integer hide = show.getPreferences() == null ? null : show.getPreferences().getHideSequenceCount();
    return hide == null ? 0 : hide;
  }

  private void updateVisibilityCounts(Show show, Request request, ElementWrites writes) {
    int hide = hideSequenceCount(show);
    if (hide != 0) {
      int hidden = hide + 1;
      if (!StringUtils.isEmpty(request.getSequence().getGroup())) {
        Optional<SequenceGroup> sequenceGroup = show.getSequenceGroups().stream()
            .filter((group) -> StringUtils.equalsIgnoreCase(group.getName(), request.getSequence().getGroup()))
            .findFirst();
        sequenceGroup.ifPresent(group -> {
          group.setVisibilityCount(hidden);
          writes.setOnElement("sequenceGroups", show.getSequenceGroups(), SequenceGroup::getName,
              group.getName(), "visibilityCount", hidden);
        });
      } else {
        Optional<Sequence> sequence = show.getSequences().stream()
            .filter((seq) -> StringUtils.equalsIgnoreCase(seq.getName(), request.getSequence().getName()))
            .findFirst();
        sequence.ifPresent(seq -> {
          seq.setVisibilityCount(hidden);
          writes.setOnElement("sequences", show.getSequences(), Sequence::getName,
              seq.getName(), "visibilityCount", hidden);
        });
      }
    }
  }

  // ---- R3 (Season Prep S4): targeted sequence/sequenceGroup writes ----
  //
  // The play path used to $set the whole sequences / sequenceGroups arrays to
  // change one counter. Shows that embed data: URI artwork carry ~1 MB in
  // those arrays, so every dequeue/vote/play shipped and oplogged ~1 MB, and
  // the stale in-memory copy clobbered concurrent edits to other elements.
  // Element changes are now written with arrayFilters on the element's exact
  // stored name: the in-memory match is case-insensitive first-match, and the
  // stored name of that match identifies it. When the name cannot identify it
  // uniquely (null, or an exact duplicate where the old write changed only the
  // first), the whole array is written as before. These single-element
  // writes log small; updateWhatsPlaying, which changes several elements at
  // once, uses guarded index paths instead (see applyPlay).

  /** True when exactly one element of {@code elements} has this exact name. */
  private static <T> boolean isUniquelyNamed(List<T> elements, Function<T, String> nameOf, String name) {
    if (name == null || elements == null) {
      return false;
    }
    return elements.stream()
        .filter(Objects::nonNull)
        .filter(element -> name.equals(nameOf.apply(element)))
        .count() == 1;
  }

  /** Update operators plus the arrayFilters they reference, sent as one updateOne. */
  private static final class ElementWrites {
    private final List<Bson> updates = new ArrayList<>();
    private final List<Bson> arrayFilters = new ArrayList<>();
    private int nextId = 0;

    void add(Bson update) {
      updates.add(update);
    }

    /**
     * Sets {@code field} on the element of {@code arrayField} named
     * {@code name} (already mutated in {@code elements}), or rewrites the
     * whole array from {@code elements} when the name is not a unique key.
     */
    <T> void setOnElement(String arrayField, List<T> elements, Function<T, String> nameOf,
                          String name, String field, Object value) {
      if (isUniquelyNamed(elements, nameOf, name)) {
        updates.add(Updates.set(arrayField + ".$[" + this.filterOnName(name) + "]." + field, value));
      } else {
        updates.add(Updates.set(arrayField, elements));
      }
    }

    private String filterOnName(String name) {
      String id = "e" + nextId++;
      arrayFilters.add(Filters.eq(id + ".name", name));
      return id;
    }

    UpdateOptions options() {
      UpdateOptions options = new UpdateOptions();
      if (!arrayFilters.isEmpty()) {
        options.arrayFilters(arrayFilters);
      }
      return options;
    }

    void apply(String showToken) {
      Show.mongoCollection().updateOne(Filters.eq("showToken", showToken), Updates.combine(updates), this.options());
    }
  }

  // ---- #109 anti-consecutive category enforcement (PRD-009, ADR-3) ----
  //
  // Operators flag a Category as antiConsecutive so its songs don't play
  // back-to-back (the "non-Christmas songs play all night" complaint). At
  // play-selection time we skip a candidate whose category equals the
  // just-playing sequence's category when that category is flagged — but only
  // when an alternative is available; otherwise the rule yields rather than
  // stall the show. Enforced in both modes: nextPlaylistInQueue (jukebox) and
  // highestVotedPlaylist (voting).

  /** Names (lower-cased) of categories flagged antiConsecutive on this show. */
  private Set<String> antiConsecutiveCategories(Show show) {
    if (CollectionUtils.isEmpty(show.getCategories())) {
      return Collections.emptySet();
    }
    return show.getCategories().stream()
        .filter(Objects::nonNull)
        .filter(category -> Boolean.TRUE.equals(category.getAntiConsecutive()))
        .map(Category::getName)
        .filter(StringUtils::isNotEmpty)
        .map(name -> name.toLowerCase(Locale.ROOT))
        .collect(Collectors.toSet());
  }

  /**
   * Resolves a sequence name to its category via the FPP-synced sequence list
   * (the source of truth), not the embedded request/vote snapshot — which can
   * be partial. Returns null when the name is unknown or has no category.
   */
  private String categoryForSequenceName(Show show, String sequenceName) {
    if (StringUtils.isEmpty(sequenceName) || CollectionUtils.isEmpty(show.getSequences())) {
      return null;
    }
    return show.getSequences().stream()
        .filter(Objects::nonNull)
        .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), sequenceName))
        .map(Sequence::getCategory)
        .filter(StringUtils::isNotEmpty)
        .findFirst()
        .orElse(null);
  }

  /**
   * True when a candidate must be skipped to avoid playing two songs from the
   * same antiConsecutive category back-to-back: the candidate's category
   * matches the just-played one and that category is flagged.
   */
  private boolean isConsecutiveBlocked(String candidateCategory, String lastPlayedCategory,
                                       Set<String> antiConsecutiveCategories) {
    if (StringUtils.isEmpty(candidateCategory) || StringUtils.isEmpty(lastPlayedCategory)) {
      return false;
    }
    if (!StringUtils.equalsIgnoreCase(candidateCategory, lastPlayedCategory)) {
      return false;
    }
    return antiConsecutiveCategories.contains(candidateCategory.toLowerCase(Locale.ROOT));
  }

  /**
   * Jukebox play-selection: walk the queue in position order and return the
   * first request that doesn't violate the anti-consecutive rule. Operator
   * injections (owner requests and PSA/leader/override markers) are never
   * skipped. Yields to the head when no constraint applies or every queued
   * item is in the blocked category.
   */
  private Request selectNextRequest(Show show, List<Request> orderedByPosition) {
    String lastPlayedCategory = this.categoryForSequenceName(show, show.getPlayingNow());
    Set<String> antiConsecutive = this.antiConsecutiveCategories(show);
    Integer nightlyLimit = this.nightlyPlayLimit(show);
    boolean antiActive = !antiConsecutive.isEmpty() && StringUtils.isNotEmpty(lastPlayedCategory);
    // #163: bypass the nightly cap at a new night's first selection — playsToday
    // still holds last night's tallies until the first play records and resets
    // them (the reset lives in applyNightlyPlayCount, which runs on a play, not
    // on this read path). isNewShowNight matches that reset's gap test exactly.
    // #177: a show limit of 0/null no longer proves nothing is capped — a
    // category can set its own limit while the show sets none.
    boolean nightlyActive = NightlyPlayLimitHelper.anyLimitActive(nightlyLimit, show.getCategories())
        && !this.isNewShowNight(show);
    if (!antiActive && !nightlyActive) {
      return orderedByPosition.getFirst();
    }
    for (Request request : orderedByPosition) {
      // viewerRequested is null on genuine viewer requests after the per-poll
      // IP scrub in updateWhatsPlaying; guard before the null-hostile Set.of().
      String marker = request.getViewerRequested();
      if (Boolean.TRUE.equals(request.getOwnerRequested())
          || (marker != null && OPERATOR_INJECTION_MARKERS.contains(marker))) {
        return request;
      }
      String name = request.getSequence().getName();
      // #163 per-night cap: skip a song that's hit its nightly play limit.
      if (nightlyActive && this.isNightlyCapped(show, name, nightlyLimit)) {
        continue;
      }
      if (antiActive && this.isConsecutiveBlocked(this.categoryForSequenceName(show, name),
          lastPlayedCategory, antiConsecutive)) {
        continue;
      }
      return request;
    }
    return orderedByPosition.getFirst();
  }

  /**
   * Voting play-selection: pick the highest-priority vote that doesn't violate
   * the anti-consecutive rule. System-injected votes (PSA/leader/group/owner
   * override — see {@link Vote#isSystemInjected}), group votes, and any
   * sequence-less vote are never skipped. Yields to the top vote when no
   * constraint applies or every viewer vote is in the blocked category.
   * Preserves the original winner ordering (most votes, ties to earliest vote
   * time) for the no-constraint case.
   */
  private Optional<Vote> selectWinningVote(Show show) {
    if (CollectionUtils.isEmpty(show.getVotes())) {
      return Optional.empty();
    }
    Comparator<Vote> winningOrder = Comparator.comparing(Vote::getVotes)
        .thenComparing(Comparator.comparing(Vote::getLastVoteTime).reversed());
    List<Vote> ordered = show.getVotes().stream()
        .filter(Objects::nonNull)
        .sorted(winningOrder.reversed())
        .toList();
    if (ordered.isEmpty()) {
      return Optional.empty();
    }
    String lastPlayedCategory = this.categoryForSequenceName(show, show.getPlayingNow());
    Set<String> antiConsecutive = this.antiConsecutiveCategories(show);
    Integer nightlyLimit = this.nightlyPlayLimit(show);
    boolean antiActive = !antiConsecutive.isEmpty() && StringUtils.isNotEmpty(lastPlayedCategory);
    // #163: bypass the nightly cap at a new night's first selection — playsToday
    // still holds last night's tallies until the first play records and resets
    // them (the reset lives in applyNightlyPlayCount, which runs on a play, not
    // on this read path). isNewShowNight matches that reset's gap test exactly.
    // #177: a show limit of 0/null no longer proves nothing is capped — a
    // category can set its own limit while the show sets none.
    boolean nightlyActive = NightlyPlayLimitHelper.anyLimitActive(nightlyLimit, show.getCategories())
        && !this.isNewShowNight(show);
    if (!antiActive && !nightlyActive) {
      return Optional.of(ordered.getFirst());
    }
    for (Vote vote : ordered) {
      // Operator injections (PSA/leader/override) are never skipped.
      if (Vote.isSystemInjected(vote) || (vote.getSequenceGroup() == null && vote.getSequence() == null)) {
        return Optional.of(vote);
      }
      // #177: a group vote used to return here unconditionally, bypassing the
      // cap outright — the unofficial exemption operators relied on. Now that
      // a category can be exempted properly, a group is subject to the cap
      // like anything else: capped as soon as any member is, since winning
      // plays every member.
      if (vote.getSequenceGroup() != null) {
        if (nightlyActive && NightlyPlayLimitHelper.isGroupCapped(
            vote.getSequenceGroup().getName(), show.getSequences(), nightlyLimit, show.getCategories())) {
          continue;
        }
        return Optional.of(vote);
      }
      String name = vote.getSequence().getName();
      // #163 per-night cap: skip a song that's hit its nightly play limit.
      if (nightlyActive && this.isNightlyCapped(show, name, nightlyLimit)) {
        continue;
      }
      if (antiActive && this.isConsecutiveBlocked(this.categoryForSequenceName(show, name),
          lastPlayedCategory, antiConsecutive)) {
        continue;
      }
      return Optional.of(vote);
    }
    // Every viewer vote is blocked (capped or same-category) — yield to the top vote.
    return Optional.of(ordered.getFirst());
  }

  // ---- #163 per-night play cap (PRD-009, ADR-3) ----
  //
  // A show-level Preference.nightlyPlayLimit caps how many times any single
  // song may play per show-night. The per-sequence tally lives on
  // Sequence.playsToday, incremented on play in updateWhatsPlaying and reset
  // lazily at the first play of a new night. At play-selection a capped song is
  // skipped (combined with the #109 anti-consecutive rule).

  // A multi-hour gap since the last counted play marks a new show-night. 6h
  // cleanly separates nights (overnight is ~18-20h) while tolerating any
  // realistic mid-evening pause. A calendar reset would misfire — midnight UTC
  // is early evening for US operators, resetting counters mid-show. Tunable.
  private static final long NIGHTLY_RESET_GAP_HOURS = 6L;

  private Integer nightlyPlayLimit(Show show) {
    return show.getPreferences() == null ? null : show.getPreferences().getNightlyPlayLimit();
  }

  /**
   * True at the first selection of a new show-night, before any play has been
   * recorded for it. Mirrors the gap test in {@link #applyNightlyPlayCount}
   * (same bare {@code LocalDateTime.now()} clock + {@link #NIGHTLY_RESET_GAP_HOURS}
   * gap) so the read/selection path agrees with the lazy reset that the next
   * updateWhatsPlaying will persist. #163: the nightly reset runs only on a
   * recorded play, so at a new night's first selection playsToday still holds
   * last night's tallies — without this gate, songs capped last night would be
   * wrongly skipped until the first play resets them. Read-only: never mutates
   * or persists playsToday/lastPlayCountedAt (the reset stays in
   * applyNightlyPlayCount/updateWhatsPlaying).
   */
  private boolean isNewShowNight(Show show) {
    Preference prefs = show.getPreferences();
    LocalDateTime last = prefs == null ? null : prefs.getLastPlayCountedAt();
    return last == null || last.isBefore(LocalDateTime.now().minusHours(NIGHTLY_RESET_GAP_HOURS));
  }

  /** True when the named song has reached its nightly play limit. */
  private boolean isNightlyCapped(Show show, String sequenceName, Integer nightlyLimit) {
    if (StringUtils.isEmpty(sequenceName) || CollectionUtils.isEmpty(show.getSequences())) {
      return false;
    }
    // #177: the limit is resolved per sequence now, since its category may
    // override (or be exempt from) the show's. Shared with the viewer's
    // rejection and gray-out so all three agree on what's capped.
    return show.getSequences().stream()
        .filter(Objects::nonNull)
        .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), sequenceName))
        .findFirst()
        .map(seq -> NightlyPlayLimitHelper.isCapped(seq, nightlyLimit, show.getCategories()))
        .orElse(false);
  }

  /**
   * What {@link #applyNightlyPlayCount} changed in memory, so the caller can
   * persist it as targeted writes: whether every tally was reset, and which
   * sequence was counted (null if none).
   */
  private record NightlyCount(boolean reset, Sequence counted) {
    static final NightlyCount NONE = new NightlyCount(false, null);
  }

  /**
   * Maintains the #163 per-night counters on each play: lazily resets every
   * tally at the first play of a new show-night (gap-based), then counts this
   * play. Only song-like plays burn the cap — PSAs/leaders are operator-policy
   * interstitials (mirrors the isSongLike cadence rule). No-op (and no clock
   * maintained) when the cap is disabled.
   */
  private NightlyCount applyNightlyPlayCount(Show show, List<Sequence> sequences, String playlistName) {
    Preference prefs = show.getPreferences();
    Integer limit = prefs.getNightlyPlayLimit();
    // #177: this is the WRITE side of the cap, and it has to agree with the
    // read side about whether counting is worth doing. A show limit of
    // 0/null no longer means nothing is capped — a category can set its own
    // while the show sets none — and if this returned early there, playsToday
    // would never increment and a category-only limit could never fire.
    if (!NightlyPlayLimitHelper.anyLimitActive(limit, show.getCategories())) {
      return NightlyCount.NONE;
    }
    LocalDateTime now = LocalDateTime.now();
    LocalDateTime last = prefs.getLastPlayCountedAt();
    boolean reset = last == null || last.isBefore(now.minusHours(NIGHTLY_RESET_GAP_HOURS));
    if (reset) {
      for (Sequence sequence : sequences) {
        if (sequence != null) {
          sequence.setPlaysToday(0);
        }
      }
    }
    Sequence counted = null;
    if (PluginQueueHelper.isSongLike(show, playlistName)) {
      counted = sequences.stream()
          .filter(Objects::nonNull)
          .filter(seq -> StringUtils.equalsIgnoreCase(seq.getName(), playlistName))
          .findFirst()
          .orElse(null);
      if (counted != null) {
        Integer playsBefore = counted.getPlaysToday();
        counted.setPlaysToday((playsBefore == null ? 0 : playsBefore) + 1);
      }
    }
    prefs.setLastPlayCountedAt(now);
    return new NightlyCount(reset, counted);
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
    LOG.debugf("Received syncPlaylists request for %s. Playlist size: %s", show.getShowToken(),
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
    // Snapshot before the helpers below mutate the loaded sequences in place.
    List<Sequence> sequencesBefore = SyncPlaylistsDiff.snapshot(show.getSequences());

    Set<Sequence> updatedSequences = new HashSet<>();
    updatedSequences.addAll(this.getSequencesToDelete(request, show));
    updatedSequences.addAll(this.addNewSequences(request, show));
    List<Sequence> sequencesToWrite = updatedSequences.stream().sorted(SyncPlaylistsDiff.STORED_ORDER).toList();

    List<PsaSequence> updatedPsaSequences = this.updatePsaSequences(request, show);

    Boolean psaEnabled = show.getPreferences() != null ? show.getPreferences().getPsaEnabled() : null;
    if (SyncPlaylistsDiff.isNoOp(sequencesBefore, sequencesToWrite, show.getPsaSequences(), updatedPsaSequences, psaEnabled)) {
      // The plugin can call this in a tight loop: log the first no-op per show
      // per window at INFO, the rest at DEBUG.
      if (!SYNC_PLAYLISTS_NOOP_LOGGED.contains(show.getShowToken())) {
        SYNC_PLAYLISTS_NOOP_LOGGED.add(show.getShowToken());
        LOG.infof("syncPlaylists unchanged for %s, skipped write. Playlist size: %s (repeats logged at DEBUG for %s)",
            show.getShowToken(), playlists.size(), SYNC_PLAYLISTS_NOOP_LOG_WINDOW);
      } else {
        LOG.debugf("syncPlaylists unchanged for %s, skipped write", show.getShowToken());
      }
      return PluginResponse.builder().message("Success").build();
    }

    LOG.infof("syncPlaylists writing sequences for %s. Playlist size: %s, sequences: %s, psaSequences: %s",
        show.getShowToken(), playlists.size(), sequencesToWrite.size(), updatedPsaSequences.size());
    SYNC_PLAYLISTS_NOOP_LOGGED.remove(show.getShowToken());
    writeSyncedPlaylists(show.getShowToken(), sequencesToWrite, updatedPsaSequences);
    return PluginResponse.builder().message("Success").build();
  }

  // Atomic updates for sequences and PSA sequences. Package-private so unit
  // tests can observe writes without a Mongo instance.
  void writeSyncedPlaylists(String showToken, List<Sequence> sequences, List<PsaSequence> psaSequences) {
    List<Bson> updates = new ArrayList<>(List.of(
        Updates.set("sequences", sequences),
        Updates.set("psaSequences", psaSequences)));
    if (CollectionUtils.isEmpty(psaSequences)) {
      updates.add(Updates.set("preferences.psaEnabled", false));
    }
    Show.mongoCollection().updateOne(Filters.eq("showToken", showToken), Updates.combine(updates));
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

  /**
   * Guarded write attempts updateWhatsPlaying makes before it falls back to
   * an unguarded arrayFilters write. Each failed attempt re-reads the show.
   */
  static final int PLAY_WRITE_ATTEMPTS = 3;

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

    if (StringUtils.isEmpty(request.getPlaylist())) {
      show.setPlayingNow("");
      show.setPlayingNext("");
      show.setPlayingNextFromSchedule("");
      // Clear playing fields
      Show.mongoCollection().updateOne(
          Filters.eq("showToken", show.getShowToken()),
          Updates.combine(
              Updates.set("playingNow", ""),
              Updates.set("playingNext", ""),
              Updates.set("playingNextFromSchedule", "")
          )
      );
      return PluginResponse.builder().currentPlaylist(request.getPlaylist()).build();
    }

    // R3 (Season Prep S4): the play is written as index-path element updates
    // ("sequences.7.visibilityCount"), guarded in the filter by what this
    // request read at each touched index (its name, and for a decrement that
    // the count is still positive). Mongo logs an update that changes several
    // elements of one array through arrayFilters as the WHOLE array (~1 MB for
    // a show with inline artwork); index paths log one small diff per element.
    // If the array moved under us (syncPlaylists reorder, a concurrent
    // dequeue/vote/play), the guard matches nothing: re-read and redo the play
    // on the fresh show, then after PLAY_WRITE_ATTEMPTS fall back to the
    // unguarded arrayFilters write (counters evaluated at write time) with
    // whole requests/votes arrays.
    for (int attempt = 1; ; attempt++) {
      boolean guarded = attempt <= PLAY_WRITE_ATTEMPTS;
      PlayWrite write = this.applyPlay(show, request.getPlaylist(), guarded);
      UpdateResult result = Show.mongoCollection().updateOne(write.filter(), write.update(), write.options());
      if (!guarded || result.getMatchedCount() > 0) {
        break;
      }
      Optional<Show> fresh = showRepository.findByShowToken(show.getShowToken());
      if (fresh.isEmpty() || fresh.get().getPreferences() == null) {
        LOG.warnf("PLAY_WRITE_ABANDONED show=%s attempt=%d: guard missed and the re-read found %s; play not recorded",
            show.getShowSubdomain(), attempt, fresh.isEmpty() ? "no show" : "no preferences");
        break;
      }
      if (attempt == PLAY_WRITE_ATTEMPTS) {
        LOG.warnf("PLAY_WRITE_FALLBACK show=%s attempt=%d: element guard missed every attempt; writing unguarded",
            show.getShowSubdomain(), attempt);
      } else {
        LOG.infof("PLAY_WRITE_RETRY show=%s attempt=%d: element guard missed; re-reading", show.getShowSubdomain(), attempt);
      }
      show = fresh.get();
    }

    return PluginResponse.builder().currentPlaylist(request.getPlaylist()).build();
  }

  private static int countPositive(Integer[] counts) {
    int positive = 0;
    for (Integer count : counts) {
      if (count != null && count > 0) {
        positive++;
      }
    }
    return positive;
  }

  /** Filter: exactly {@code expected} elements of {@code arrayField} have visibilityCount > 0. */
  private static Bson positiveVisibilityCount(String arrayField, int expected) {
    Document positive = new Document("$filter", new Document("input", new Document("$ifNull", List.of("$" + arrayField, List.of())))
        .append("cond", new Document("$gt", List.of("$$this.visibilityCount", 0))));
    return Filters.expr(new Document("$eq", List.of(new Document("$size", positive), expected)));
  }

  /**
   * Adds the per-element writes (and their guards) for {@code arrayField},
   * plus a $push of anything appended past {@code readSize} in memory. $push
   * and an element path on the same array can't share an update, so when
   * both are needed the whole array is written instead.
   */
  private static <T> void addElementWrites(String arrayField, List<T> current, int readSize,
                                           List<Bson> elementUpdates, List<Bson> elementGuards,
                                           List<Bson> updates, List<Bson> filters) {
    List<T> queued = current.subList(readSize, current.size());
    if (!queued.isEmpty() && !elementUpdates.isEmpty()) {
      updates.add(Updates.set(arrayField, current));
    } else {
      updates.addAll(elementUpdates);
      filters.addAll(elementGuards);
      if (!queued.isEmpty()) {
        updates.add(Updates.pushEach(arrayField, new ArrayList<>(queued)));
      }
    }
  }

  /** The filter and update for one updateWhatsPlaying write attempt. */
  private record PlayWrite(Bson filter, Bson update, UpdateOptions options) {
    PlayWrite(Bson filter, Bson update) {
      this(filter, update, new UpdateOptions());
    }
  }

  /**
   * Applies a play of {@code playlist} to {@code show} in memory (counters,
   * nightly tally, managed PSA, viewer-IP scrub) and returns the write that
   * persists it: guarded index-path updates, or with {@code guarded} false an
   * unguarded arrayFilters write.
   */
  private PlayWrite applyPlay(Show show, String playlist, boolean guarded) {
    show.setPlayingNow(playlist);

    int sequencesPlayed = show.getPreferences().getSequencesPlayed() != null
        ? show.getPreferences().getSequencesPlayed()
        : 0;

    List<Sequence> sequences = show.getSequences() != null ? show.getSequences() : Collections.emptyList();
    List<PsaSequence> psaSequences = show.getPsaSequences() != null ? show.getPsaSequences() : Collections.emptyList();
    List<SequenceGroup> sequenceGroups = show.getSequenceGroups() != null ? show.getSequenceGroups() : Collections.emptyList();

    // What this request read, per array index, so the write can carry only
    // what changed and guard on what it read.
    Integer[] visibilityBefore = new Integer[sequences.size()];
    Integer[] playsBefore = new Integer[sequences.size()];
    for (int i = 0; i < sequences.size(); i++) {
      Sequence sequence = sequences.get(i);
      if (sequence != null) {
        visibilityBefore[i] = sequence.getVisibilityCount();
        playsBefore[i] = sequence.getPlaysToday();
      }
    }
    Integer[] groupVisibilityBefore = new Integer[sequenceGroups.size()];
    for (int i = 0; i < sequenceGroups.size(); i++) {
      SequenceGroup group = sequenceGroups.get(i);
      groupVisibilityBefore[i] = group == null ? null : group.getVisibilityCount();
    }
    List<Request> requestsRead = show.getRequests();
    int requestsReadSize = requestsRead == null ? 0 : requestsRead.size();
    String[] viewerRequestedBefore = new String[requestsReadSize];
    for (int i = 0; i < requestsReadSize; i++) {
      Request req = requestsRead.get(i);
      viewerRequestedBefore[i] = req == null ? null : req.getViewerRequested();
    }
    List<Vote> votesRead = show.getVotes();
    int votesReadSize = votesRead == null ? 0 : votesRead.size();
    boolean[] viewersVotedWasEmpty = new boolean[votesReadSize];
    for (int i = 0; i < votesReadSize; i++) {
      Vote vote = votesRead.get(i);
      viewersVotedWasEmpty[i] = vote != null && vote.getViewersVoted() != null && vote.getViewersVoted().isEmpty();
    }

    Optional<Sequence> whatsPlayingSequence = sequences.stream()
        .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), playlist))
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
    //
    // A sequence group counts as one song, on its highest-order (last)
    // member. Every member of a requested or winning group plays once, so
    // each group play counts exactly once, and counting on the last member
    // keeps a PSA from landing inside a group the FPP schedule plays in
    // order. Operators often keep PSAs in a sequence group too; those are
    // not song-like and never touch the counter.
    boolean countsAsSong = whatsPlayingSequence.isEmpty()
        || StringUtils.isEmpty(whatsPlayingSequence.get().getGroup())
        || this.isGroupCloser(show, sequences, whatsPlayingSequence.get());
    boolean counterAdvanced = PluginQueueHelper.isSongLike(show, playlist) && countsAsSong;
    if (counterAdvanced) {
      sequencesPlayed++;
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

    // #163 per-night play cap: lazy nightly reset + count this play.
    NightlyCount nightlyCount = this.applyNightlyPlayCount(show, sequences, playlist);

    Set<String> psaNamesLowerCase = psaSequences.stream()
        .filter(Objects::nonNull)
        .map(PsaSequence::getName)
        .filter(StringUtils::isNotEmpty)
        .map(StringUtils::lowerCase)
        .collect(Collectors.toSet());

    this.handleManagedPSA(sequencesPlayed, counterAdvanced, show, psaNamesLowerCase);

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

    // One atomic update for all the modified fields. nextPsaOverride is
    // included because handlePsaOverride clears it in memory after consuming
    // — without persisting that null, the pill on Special Roles would never
    // disappear after FPP fires the override (PSA-v2 PR-2 smoke-test bug).
    List<Bson> filters = new ArrayList<>();
    filters.add(Filters.eq("showToken", show.getShowToken()));
    List<Bson> updates = new ArrayList<>();
    updates.add(Updates.set("playingNow", playlist));
    updates.add(Updates.set("preferences.sequencesPlayed", sequencesPlayed));
    updates.add(Updates.set("preferences.lastPlayCountedAt", show.getPreferences().getLastPlayCountedAt()));
    updates.add(Updates.set("psaSequences", show.getPsaSequences() != null ? show.getPsaSequences() : new ArrayList<>()));
    updates.add(Updates.set("nextPsaOverride", show.getNextPsaOverride()));

    if (!guarded) {
      // Unguarded fallback: the counters as arrayFilters evaluated at write
      // time (correct under contention, but Mongo logs the whole array when
      // several elements change), requests/votes as whole arrays.
      List<Bson> arrayFilters = new ArrayList<>();
      Sequence counted = nightlyCount.counted();
      if (show.getSequences() == null || nightlyCount.reset()
          || (counted != null && !isUniquelyNamed(sequences, Sequence::getName, counted.getName()))) {
        updates.add(Updates.set("sequences", sequences));
      } else {
        updates.add(Updates.inc("sequences.$[p].visibilityCount", -1));
        arrayFilters.add(Filters.gt("p.visibilityCount", 0));
        if (counted != null) {
          int countedAt = 0;
          while (sequences.get(countedAt) != counted) {
            countedAt++;
          }
          if (playsBefore[countedAt] == null) {
            arrayFilters.add(Filters.eq("c.name", counted.getName()));
            updates.add(Updates.set("sequences.$[c].playsToday", 1));
          } else {
            // Only $inc a numeric tally: $inc on an explicit null is a Mongo
            // error. A tally nulled since the read is left alone, not a 500.
            arrayFilters.add(Filters.and(Filters.eq("c.name", counted.getName()),
                Filters.type("c.playsToday", "number")));
            updates.add(Updates.inc("sequences.$[c].playsToday", 1));
          }
        }
      }
      if (show.getSequenceGroups() == null) {
        updates.add(Updates.set("sequenceGroups", sequenceGroups));
      } else {
        updates.add(Updates.inc("sequenceGroups.$[g].visibilityCount", -1));
        arrayFilters.add(Filters.gt("g.visibilityCount", 0));
      }
      updates.add(Updates.set("requests", show.getRequests() != null ? show.getRequests() : new ArrayList<>()));
      updates.add(Updates.set("votes", show.getVotes() != null ? show.getVotes() : new ArrayList<>()));
      return new PlayWrite(Filters.and(filters), Updates.combine(updates), new UpdateOptions().arrayFilters(arrayFilters));
    }

    // sequences: the decrement and the nightly tally, per element. The
    // decrement applies to every element positive at write time, so besides
    // guarding each decremented index the filter pins how many elements are
    // positive: one that turned positive since the read (a concurrent
    // dequeue or vote win) makes the attempt miss and get redone.
    if (show.getSequences() == null) {
      updates.add(Updates.set("sequences", sequences));
    } else {
      filters.add(positiveVisibilityCount("sequences", countPositive(visibilityBefore)));
      for (int i = 0; i < sequences.size(); i++) {
        Sequence sequence = sequences.get(i);
        if (sequence == null) {
          continue;
        }
        String at = "sequences." + i + ".";
        boolean touched = false;
        if (visibilityBefore[i] != null && visibilityBefore[i] > 0) {
          updates.add(Updates.inc(at + "visibilityCount", -1));
          filters.add(Filters.gt(at + "visibilityCount", 0));
          touched = true;
        }
        Integer plays = sequence.getPlaysToday();
        if (!Objects.equals(playsBefore[i], plays)) {
          // $inc on the counted song so concurrent plays each count; a reset
          // or a first tally (explicit null, which $inc rejects) is a $set.
          if (sequence == nightlyCount.counted() && !nightlyCount.reset() && playsBefore[i] != null) {
            // $inc rejects an explicit null: if the stored tally isn't a
            // number any more the guard misses and the re-read takes the
            // $set path.
            updates.add(Updates.inc(at + "playsToday", 1));
            filters.add(Filters.type(at + "playsToday", "number"));
          } else {
            updates.add(Updates.set(at + "playsToday", plays));
          }
          touched = true;
        }
        if (touched) {
          filters.add(Filters.eq(at + "name", sequence.getName()));
        }
      }
    }

    // sequenceGroups: the decrement, per element.
    if (show.getSequenceGroups() == null) {
      updates.add(Updates.set("sequenceGroups", sequenceGroups));
    } else {
      filters.add(positiveVisibilityCount("sequenceGroups", countPositive(groupVisibilityBefore)));
      for (int i = 0; i < sequenceGroups.size(); i++) {
        SequenceGroup group = sequenceGroups.get(i);
        if (group != null && groupVisibilityBefore[i] != null && groupVisibilityBefore[i] > 0) {
          String at = "sequenceGroups." + i + ".";
          updates.add(Updates.inc(at + "visibilityCount", -1));
          filters.add(Filters.gt(at + "visibilityCount", 0));
          filters.add(Filters.eq(at + "name", group.getName()));
        }
      }
    }

    // requests: the viewer-IP scrub as $unset per scrubbed element (the codec
    // omits the nulled field, so the old whole-array write dropped the key),
    // plus any PSA the managed path queued.
    List<Request> requests = show.getRequests();
    if (requestsRead == null) {
      updates.add(Updates.set("requests", requests != null ? requests : new ArrayList<>()));
    } else {
      List<Bson> scrubs = new ArrayList<>();
      List<Bson> scrubGuards = new ArrayList<>();
      for (int i = 0; i < requestsReadSize; i++) {
        Request req = requests.get(i);
        if (viewerRequestedBefore[i] != null && req.getViewerRequested() == null) {
          String at = "requests." + i + ".";
          scrubs.add(Updates.unset(at + "viewerRequested"));
          scrubGuards.add(Filters.eq(at + "position", req.getPosition()));
          scrubGuards.add(Filters.eq(at + "sequence.name", req.getSequence() == null ? null : req.getSequence().getName()));
        }
      }
      addElementWrites("requests", requests, requestsReadSize, scrubs, scrubGuards, updates, filters);
    }

    // votes: viewersVoted -> [] on every vote not already stored empty, plus
    // any PSA vote the managed path queued.
    List<Vote> votes = show.getVotes();
    if (votesRead == null) {
      updates.add(Updates.set("votes", votes != null ? votes : new ArrayList<>()));
    } else {
      List<Bson> clears = new ArrayList<>();
      List<Bson> clearGuards = new ArrayList<>();
      for (int i = 0; i < votesReadSize; i++) {
        Vote vote = votes.get(i);
        if (!viewersVotedWasEmpty[i]) {
          String at = "votes." + i + ".";
          clears.add(Updates.set(at + "viewersVoted", new ArrayList<>()));
          // Guard on the name only: the viewer keys votes by name and stamps
          // lastVoteTime on every vote, so guarding on it would miss on any
          // concurrent vote. Clearing voters on a same-named vote is harmless.
          if (vote.getSequence() != null) {
            clearGuards.add(Filters.eq(at + "sequence.name", vote.getSequence().getName()));
          } else if (vote.getSequenceGroup() != null) {
            clearGuards.add(Filters.eq(at + "sequenceGroup.name", vote.getSequenceGroup().getName()));
          } else {
            clearGuards.add(Filters.exists("votes." + i));
          }
        }
      }
      addElementWrites("votes", votes, votesReadSize, clears, clearGuards, updates, filters);
    }

    return new PlayWrite(Filters.and(filters), Updates.combine(updates));
  }

  /**
   * True when {@code sequence} is the highest-order active song in its group
   * (ties broken by name, so exactly one member qualifies). Inactive members
   * (removed from FPP) and PSAs/leaders never play as the group's last song,
   * so they can't be the closer or the group would never count.
   */
  private boolean isGroupCloser(Show show, List<Sequence> sequences, Sequence sequence) {
    return sequences.stream()
        .filter(Objects::nonNull)
        .filter(seq -> StringUtils.equalsIgnoreCase(seq.getGroup(), sequence.getGroup()))
        .filter(seq -> !Boolean.FALSE.equals(seq.getActive()))
        .filter(seq -> PluginQueueHelper.isSongLike(show, seq.getName()))
        .max(Comparator
            .comparing((Sequence seq) -> seq.getOrder() != null ? seq.getOrder() : Integer.MIN_VALUE)
            .thenComparing(seq -> seq.getName() != null ? seq.getName() : ""))
        .map(closer -> StringUtils.equalsIgnoreCase(closer.getName(), sequence.getName()))
        .orElse(false);
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
  private void handleManagedPSA(int sequencesPlayed, boolean counterAdvanced, Show show, Set<String> psaNamesLowerCase) {
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
    // The window only opens on the play that moved the counter onto a
    // multiple: a non-advancing play (grouped song) leaves the counter on
    // the multiple and would otherwise fire again on every such play.
    if (!Boolean.TRUE.equals(show.getPreferences().getPsaEnabled())
        || !Boolean.TRUE.equals(show.getPreferences().getManagePsa())
        || show.getPreferences().getPsaFrequency() == null
        || show.getPreferences().getPsaFrequency() <= 0
        || !counterAdvanced
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
    HighestVotedPlaylistResponse response = HighestVotedPlaylistResponse.empty();
    //Get the sequence with the most votes. If there is a tie, get the sequence with the earliest vote time.
    //#109 anti-consecutive (PRD-009, ADR-3): selectWinningVote skips a viewer
    //vote whose category matches the just-played one when flagged, deferring it
    //to a later cycle. System-injected/group votes are never skipped.
    if (CollectionUtils.isNotEmpty(show.getVotes())) {
      Optional<Vote> winningVote = this.selectWinningVote(show);
      if (winningVote.isPresent()) {
        SequenceGroup winningSequenceGroup = winningVote.get().getSequenceGroup();
        if (winningSequenceGroup != null) {
          return this.processWinningGroup(winningVote.get(), show);
        } else {
          return this.processWinningVote(winningVote.get(), show, new ArrayList<>(), new ElementWrites());
        }
      }
    }

    return response;
  }

  private HighestVotedPlaylistResponse processWinningGroup(Vote winningVote, Show show) {
    SequenceGroup winningSequenceGroup = winningVote.getSequenceGroup();
    show.getVotes().remove(winningVote);
    List<Stat.VotingWin> newWins = new ArrayList<>();
    ElementWrites sequenceWrites = new ElementWrites();

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

        // Added to the in-memory list (voteWinsToday counts it downstream)
        // AND to newWins (the only part that gets written — see the $push
        // note in writeVotingResult).
        Stat.VotingWin groupWin = Stat.VotingWin.builder()
            .name(actualSequenceGroup.get().getName())
            .dateTime(LocalDateTime.now())
            .build();
        show.getStats().getVotingWin().add(groupWin);
        newWins.add(groupWin);

        //Set visibility counts. #210: written with the rest of the voting
        //result; it used to be set in memory only, so a winning group was
        //never hidden or grayed out.
        int hide = hideSequenceCount(show);
        if (hide != 0) {
          int hidden = hide + 1;
          actualSequenceGroup.get().setVisibilityCount(hidden);
          sequenceWrites.setOnElement("sequenceGroups", show.getSequenceGroups(), SequenceGroup::getName,
              actualSequenceGroup.get().getName(), "visibilityCount", hidden);
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
        return this.processWinningVote(updatedWinningVote, show, newWins, sequenceWrites);
      }
    }
    return null;
  }

  private HighestVotedPlaylistResponse processWinningVote(Vote winningVote, Show show, List<Stat.VotingWin> newWins,
                                                          ElementWrites sequenceWrites) {
    Sequence winningSequence = winningVote.getSequence();
    show.getVotes().remove(winningVote);

    if (winningSequence != null) {
      boolean winningSequenceIsPSA = show.getPsaSequences().stream()
          .anyMatch(psaSequence -> StringUtils.equalsIgnoreCase(psaSequence.getName(), winningSequence.getName()));
      // #167 — an owner force-to-top override is, like a PSA, a policy-injected
      // winner: stat-neutral (records no vote win) and not gilded with a leader
      // (it plays immediately). Folding both into one flag keeps the guards below
      // single-condition.
      boolean winnerIsPolicyInjected = winningSequenceIsPSA || Boolean.TRUE.equals(winningVote.getOwnerOverride());
      Optional<Sequence> actualSequence = show.getSequences().stream()
          .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), winningSequence.getName()))
          .findFirst();

      if (actualSequence.isPresent()) {
        boolean noGroupedSequencesHaveVotes = show.getVotes().stream()
            .noneMatch(vote -> vote.getSequence() == null || StringUtils.isNotEmpty(vote.getSequence().getGroup()));

        //Vote resets should only happen if there are no grouped sequences with active votes AND the winning sequence is not a PSA
        if (noGroupedSequencesHaveVotes && !winningSequenceIsPSA) {
          //Reset votes
          if (Boolean.TRUE.equals(show.getPreferences().getResetVotes())) {
            show.getVotes().clear();
          }
        }

        //Set visibility counts. R3: only this element is written (see
        //ElementWrites). Nothing else in show.getSequences() changes on this
        //path, so no other sequence write is needed. A group winner's
        //visibilityCount arrives already in sequenceWrites from
        //processWinningGroup.
        int hide = hideSequenceCount(show);
        if (hide != 0 && StringUtils.isEmpty(actualSequence.get().getGroup())) {
          int hidden = hide + 1;
          actualSequence.get().setVisibilityCount(hidden);
          sequenceWrites.setOnElement("sequences", show.getSequences(), Sequence::getName,
              actualSequence.get().getName(), "visibilityCount", hidden);
        }

        //Only save stats for non-grouped sequences. A policy-injected winner
        //(PSA or #167 owner override) records no vote win.
        if (StringUtils.isEmpty(actualSequence.get().getGroup()) && !winnerIsPolicyInjected) {
          Stat.VotingWin win = Stat.VotingWin.builder()
              .name(actualSequence.get().getName())
              .dateTime(LocalDateTime.now())
              .build();
          show.getStats().getVotingWin().add(win);
          newWins.add(win);
        }

        if (Boolean.TRUE.equals(show.getPreferences().getPsaEnabled())
            && !Boolean.TRUE.equals(show.getPreferences().getManagePsa())
            && CollectionUtils.isNotEmpty(show.getPsaSequences()) && StringUtils.isEmpty(actualSequence.get().getGroup()) && !winningSequenceIsPSA) {
          Integer voteWinsToday = show.getStats().getVotingWin().stream()
              .filter(stat -> stat.getDateTime().isAfter(LocalDateTime.now().withHour(0).withMinute(0).withSecond(0)))
              .toList()
              .size();
          boolean isPSAPlayingNow = show.getPsaSequences().stream()
              .anyMatch(psaSequence -> StringUtils.equalsIgnoreCase(show.getPlayingNow(), psaSequence.getName()));
          Integer psaFrequency = show.getPreferences().getPsaFrequency();
          if (psaFrequency != null && psaFrequency > 0
              && voteWinsToday % psaFrequency == 0 && !isPSAPlayingNow) {
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
            && !winnerIsPolicyInjected
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
          this.writeVotingResult(show, newWins, sequenceWrites);

          // Return the leader as this cycle's winner. The actual winner is
          // queued above and will be returned by the next call.
          return HighestVotedPlaylistResponse.builder()
              .winningPlaylist(leaderSequence.get().getName())
              .playlistIndex(leaderSequence.get().getIndex())
              .build();
        }

        // Atomic update for all changes
        this.writeVotingResult(show, newWins, sequenceWrites);

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
   * One atomic write for a voting cycle: the votes, this cycle's new wins,
   * the PSA list, and the winner's visibility count ({@code sequenceWrites}).
   */
  private void writeVotingResult(Show show, List<Stat.VotingWin> newWins, ElementWrites sequenceWrites) {
    sequenceWrites.add(Updates.set("votes", show.getVotes()));
    // $push only this cycle's new wins. The old whole-array $set raced the
    // nightly retention sweep (#154): a sweep landing between this method's read
    // and write got its prune undone by the stale in-memory copy. Wins are
    // append-only here, so pushing the delta can't resurrect pruned entries. An
    // empty $each is a Mongo no-op (PSA/override winners add no win).
    sequenceWrites.add(Updates.pushEach("stats.votingWin", newWins));
    sequenceWrites.add(Updates.set("psaSequences", show.getPsaSequences()));
    sequenceWrites.apply(show.getShowToken());
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
            Updates.set("votes", new ArrayList<>()),
            // Clear the persisted playingNext with the queue, or the viewer's
            // addSequenceToQueue keeps rejecting it as already requested.
            Updates.set("playingNext", "")
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
    Bson update = Updates.combine(
        Updates.set("preferences.viewerControlEnabled", newValue),
        Updates.set("preferences.sequencesPlayed", 0));
    if (newValue) {
      // #162 — enabling viewer control opens a fresh votes-left session window
      // (cap + countdown count votes since this instant). UTC-explicit so it
      // lines up with the viewer's UTC-stamped voteEvent.votedAt.
      update = Updates.combine(update,
          Updates.set("preferences.votingWindowStartedAt", LocalDateTime.now(ZoneOffset.UTC)));
    }
    Show.mongoCollection().updateOne(Filters.eq("showToken", show.getShowToken()), update);
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
    Bson update = Updates.set("preferences.viewerControlEnabled", enabled);
    if (enabled) {
      // #162 — enabling viewer control opens a fresh votes-left session window.
      update = Updates.combine(update,
          Updates.set("preferences.votingWindowStartedAt", LocalDateTime.now(ZoneOffset.UTC)));
    }
    Show.mongoCollection().updateOne(Filters.eq("showToken", show.getShowToken()), update);
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
  // 5 min of real silence plus the HEARTBEAT_MIN_INTERVAL_SECONDS write floor:
  // the stored heartbeat can trail the plugin's real last beat by up to ~150s,
  // so comparing against 5 min would record 2.5-min blips as gaps.
  // Must match control-panel's PluginHeartbeat.STALE_MINUTES.
  private static final long HEARTBEAT_GAP_THRESHOLD_MINUTES = 7L;
  private static final long HEARTBEAT_GAP_RETENTION_DAYS = 30L;
  // Write coalescing (Season Capacity Plan R3). The plugin beats every ~30s,
  // but the stored lastFppHeartbeat only has to answer "alive in the last
  // 5 min" (dashboard tile, pre-show checklist, control-panel alert task, gap
  // detection above). Every write dirties the whole Show document in the
  // WiredTiger cache, so at ~1,000 live plugins a per-beat write was ~33
  // big-doc writes/s. With a 120s floor a 30s-cadence plugin writes every
  // 120-150s (~8 writes/s fleet-wide).
  //
  // Staleness budget: the stored value lags the plugin's real last beat by
  // 0 to ~150s (floor + one 30s beat). Every reader compares the stored value
  // against 7 min (gap threshold here, and control-panel's
  // PluginHeartbeat.STALE_MINUTES, which drives both the FPP alert task and
  // dashboardLiveStats.pluginConnected; the UI no longer keeps its own copy),
  // so "Offline", the first alert and a
  // recorded gap all need between ~4.5 and 7 min of real silence (was 5 min,
  // give or take one beat). A healthy plugin can never read as offline.
  // Recovery is immediate: after any outage the stored value is older than
  // the floor, so the first beat back always writes. Changing this floor
  // means changing those thresholds.
  private static final long HEARTBEAT_MIN_INTERVAL_SECONDS = 120L;

  public void fppHeartbeat() {
    Show show = showContext.getShow();
    LocalDateTime now = LocalDateTime.now();
    LocalDateTime previous = show.getLastFppHeartbeat();

    // Coalesce: if the stored heartbeat is younger than the floor, accept the
    // request (controller returns 204) but skip the Mongo write. Caller
    // can't tell the difference and doesn't need to — fire-and-forget.
    if (previous != null && previous.isAfter(now.minusSeconds(HEARTBEAT_MIN_INTERVAL_SECONDS))) {
      return;
    }

    var filter = Filters.eq("showToken", show.getShowToken());

    // V17 — gap detection. If the previous heartbeat was more than the
    // threshold ago, we just came back from an outage; record the gap window.
    // `previous` is the last WRITTEN beat, which can trail the plugin's real
    // last beat by up to ~150s, so a recorded gap may start up to that much
    // early, and an outage of 4.5-7 min of real silence is recorded or not
    // depending on where it fell in the write cycle. Outages of 7+ min are
    // always recorded.
    if (previous == null || !previous.isBefore(now.minusMinutes(HEARTBEAT_GAP_THRESHOLD_MINUTES))) {
      // Normal beat: a bare $set. No per-beat $pull of heartbeatGaps; the
      // list only grows on the gap path below, so that is where it's pruned
      // (plus control-panel's nightly retention sweep).
      Show.mongoCollection().updateOne(filter, Updates.set("lastFppHeartbeat", now));
      return;
    }

    HeartbeatGap newGap = HeartbeatGap.builder().startedAt(previous).endedAt(now).build();
    Show.mongoCollection().updateOne(
        filter,
        Updates.combine(
            Updates.set("lastFppHeartbeat", now),
            Updates.push("heartbeatGaps", newGap)
        )
    );
    // Prune past the retention window. Separate update because Mongo rejects
    // $push and $pull on the same field path in one operation. Rare path:
    // only runs when the plugin comes back from a > 5 min outage.
    LocalDateTime cutoff = now.minusDays(HEARTBEAT_GAP_RETENTION_DAYS);
    Show.mongoCollection().updateOne(
        filter, Updates.pull("heartbeatGaps", Filters.lt("endedAt", cutoff)));
  }

  /**
   * List the show's viewer pages (PRD-016). Feeds the FPP command dropdown
   * for "Remote Falcon - Set Active Viewer Page".
   *
   * Both viewer-page methods re-fetch via findPagesMetaByShowToken: the
   * request-scoped Show from ShowTokenFilter is loaded with `pages`
   * projection-EXCLUDED (listener polls must not haul page HTML), so
   * showContext.getShow().getPages() is always null here.
   */
  public ViewerPagesResponse viewerPages() {
    Show show = this.showRepository.findPagesMetaByShowToken(showContext.getShow().getShowToken())
        .orElse(showContext.getShow());
    List<ViewerPageDetails> pages = Optional.ofNullable(show.getPages())
        .orElse(Collections.emptyList())
        .stream()
        .filter(Objects::nonNull)
        .filter(page -> StringUtils.isNotEmpty(page.getName()))
        .map(page -> ViewerPageDetails.builder()
            .name(page.getName())
            .active(Boolean.TRUE.equals(page.getActive()))
            .build())
        .toList();
    return ViewerPagesResponse.builder().pages(pages).build();
  }

  /**
   * Make the named viewer page the live one (PRD-016 / issue #68). Matches
   * case-insensitively (exact-case match preferred), then flips the active
   * flags in a single targeted update via arrayFilters — never a full-array
   * rewrite, so it can't clobber a concurrent control-panel updatePages or
   * external-API page write.
   */
  public PluginResponse setActiveViewerPage(SetActiveViewerPageRequest request) {
    String requested = request != null ? StringUtils.trimToEmpty(request.getPageName()) : "";
    if (StringUtils.isEmpty(requested)) {
      throw badRequest("pageName is required");
    }
    Show show = this.showRepository.findPagesMetaByShowToken(showContext.getShow().getShowToken())
        .orElse(showContext.getShow());
    List<ViewerPage> pages = Optional.ofNullable(show.getPages())
        .orElse(Collections.emptyList())
        .stream()
        .filter(Objects::nonNull)
        .filter(page -> StringUtils.isNotEmpty(page.getName()))
        .toList();
    if (pages.isEmpty()) {
      LOG.warnf("setActiveViewerPage rejected for showToken=%s: show has no viewer pages", show.getShowToken());
      throw badRequest("Show has no viewer pages");
    }
    ViewerPage match = pages.stream()
        .filter(page -> page.getName().equals(requested))
        .findFirst()
        .orElseGet(() -> pages.stream()
            .filter(page -> page.getName().equalsIgnoreCase(requested))
            .findFirst()
            .orElse(null));
    if (match == null) {
      String available = pages.stream().map(ViewerPage::getName).collect(Collectors.joining(", "));
      LOG.warnf("setActiveViewerPage rejected for showToken=%s: no page named '%s' (available: %s)",
          show.getShowToken(), requested, available);
      throw badRequest("No viewer page named '" + requested + "'. Available: " + available);
    }
    Show.mongoCollection().updateOne(
        Filters.eq("showToken", show.getShowToken()),
        Updates.combine(
            Updates.set("pages.$[match].active", true),
            Updates.set("pages.$[others].active", false)
        ),
        new com.mongodb.client.model.UpdateOptions().arrayFilters(List.of(
            Filters.eq("match.name", match.getName()),
            Filters.ne("others.name", match.getName())
        ))
    );
    Log.infof("setActiveViewerPage: '%s' is now the live page for %s", match.getName(), show.getShowToken());
    return PluginResponse.builder().message("Success").build();
  }

  private WebApplicationException badRequest(String message) {
    return new WebApplicationException(
        Response.status(Response.Status.BAD_REQUEST)
            .entity(PluginResponse.builder().message(message).build())
            .build()
    );
  }
}
