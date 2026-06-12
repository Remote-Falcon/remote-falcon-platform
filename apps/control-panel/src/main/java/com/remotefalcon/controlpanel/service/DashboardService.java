package com.remotefalcon.controlpanel.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

import com.remotefalcon.library.models.*;
import org.apache.commons.lang3.StringUtils;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.repository.StatsRepository;
import com.remotefalcon.controlpanel.request.DownloadStatsToExcelRequest;
import com.remotefalcon.controlpanel.response.dashboard.DashboardHourlyStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.DashboardLiveStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.DashboardStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.ViewerSessionsResponse;
import com.remotefalcon.controlpanel.response.dashboard.WrappedSummaryResponse;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.ExcelUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.util.PluginQueueHelper;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class DashboardService {
  private final AuthUtil jwtUtil;
  private final ExcelUtil excelUtil;
  private final ShowRepository showRepository;
  private final StatsRepository statsRepository;
  private final ClientUtil clientUtil;

  // Sliding-window rate limit for the public, unauth wrappedSummary
  // resolver. Keyed on caller IP. 30 requests per 60 seconds is enough
  // for a normal browser polling the page a few times during the season
  // teaser; scrapers iterating the whole subdomain space will hit the
  // limit immediately.
  private static final int WRAPPED_RATE_LIMIT_REQUESTS = 30;
  private static final long WRAPPED_RATE_LIMIT_WINDOW_MS = 60_000L;
  private final ConcurrentHashMap<String, ConcurrentLinkedDeque<Long>> wrappedRateLimitBuckets =
          new ConcurrentHashMap<>();

  public DashboardStatsResponse dashboardStats(Long startDate, Long endDate, String timezone) {
    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    String showToken = tokenDTO.getShowToken();

    // statsPresent reproduces the legacy "stats == null -> empty response"
    // branch; if it's false we still must distinguish a real show (empty
    // buckets) from a missing one (SHOW_NOT_FOUND). Both checks are cheap
    // index probes — the multi-MB Show document is never loaded here.
    boolean statsPresent = this.statsRepository.hasStatsByShowToken(showToken);
    if (!statsPresent && !this.statsRepository.existsByShowToken(showToken)) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    ZonedDateTime startDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startDate), ZoneId.of(timezone));
    ZonedDateTime endDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(endDate), ZoneId.of(timezone)).plusDays(2);

    // Pull only the in-range stat slices from Mongo (window widened ±1 day; the
    // helpers' unchanged Java filter trims to exact — see StatsRepository).
    Date lower = statsWindowLower(startDateAtZone);
    Date upper = statsWindowUpper(endDateAtZone);
    List<Stat.Page> pageInRange = this.statsRepository.pageStatsInRange(showToken, lower, upper);
    List<Stat.Jukebox> jukeboxInRange = this.statsRepository.jukeboxStatsInRange(showToken, lower, upper);
    List<Stat.Voting> votingInRange = this.statsRepository.votingStatsInRange(showToken, lower, upper);
    List<Stat.VotingWin> votingWinInRange = this.statsRepository.votingWinStatsInRange(showToken, lower, upper);

    List<DashboardStatsResponse.Stat> pageStats = this.buildPageStats(startDateAtZone, endDateAtZone, timezone, pageInRange, statsPresent);
    List<DashboardStatsResponse.Stat> jukeboxStatsByDate = this.buildJukeboxStatsByDate(startDateAtZone, endDateAtZone, timezone, jukeboxInRange, statsPresent);
    DashboardStatsResponse.Stat jukeboxStatsBySequence = this.buildJukeboxStatsBySequence(startDateAtZone, endDateAtZone, timezone, jukeboxInRange, statsPresent);
    List<DashboardStatsResponse.Stat> voteStatsByDate = this.buildVoteStatsByDate(startDateAtZone, endDateAtZone, timezone, votingInRange, statsPresent);
    DashboardStatsResponse.Stat voteStatsBySequence = this.buildVoteStatsBySequence(startDateAtZone, endDateAtZone, timezone, votingInRange, statsPresent);
    List<DashboardStatsResponse.Stat> voteWinStatsByDate = this.buildVoteWinStatsByDate(startDateAtZone, endDateAtZone, timezone, votingWinInRange, statsPresent);
    DashboardStatsResponse.Stat voteWinStatsBySequence = this.buildVoteWinStatsBySequence(startDateAtZone, endDateAtZone, timezone, votingWinInRange, statsPresent);

    return DashboardStatsResponse.builder()
            .page(pageStats)
            .jukeboxByDate(jukeboxStatsByDate)
            .jukeboxBySequence(jukeboxStatsBySequence)
            .votingByDate(voteStatsByDate)
            .votingBySequence(voteStatsBySequence)
            .votingWinByDate(voteWinStatsByDate)
            .votingWinBySequence(voteWinStatsBySequence)
            .build();
  }

  // V15 — request → play conversion funnel for the Sequences analytics tab.
  // Compares accepted requests (Stat.jukebox) against rejected attempts
  // (Stat.rejectedRequests) within the date range, broken down by reason.
  public com.remotefalcon.controlpanel.response.dashboard.RequestConversionResponse requestConversion(
          Long startDate, Long endDate, String timezone) {
    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    String showToken = tokenDTO.getShowToken();
    // No statsPresent distinction needed: this method only COUNTS in-range
    // entries, so a missing/empty stats sub-array and an empty in-range slice
    // both yield 0 — identical to the old null-stats branch.
    if (!this.statsRepository.existsByShowToken(showToken)) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    ZoneId userZone = ZoneId.of(timezone);
    ZonedDateTime startDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startDate), userZone);
    ZonedDateTime endDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(endDate), userZone).plusDays(2);
    Date lower = statsWindowLower(startDateAtZone);
    Date upper = statsWindowUpper(endDateAtZone);

    int accepted = (int) this.statsRepository.jukeboxStatsInRange(showToken, lower, upper).stream()
            .filter(j -> j.getDateTime() != null)
            .filter(j -> {
              ZonedDateTime t = j.getDateTime().atZone(userZone);
              return t.isAfter(startDateAtZone) && t.isBefore(endDateAtZone);
            })
            .count();

    java.util.Map<String, Long> byReason = new java.util.HashMap<>();
    var inRange = this.statsRepository.rejectedRequestsInRange(showToken, lower, upper).stream()
            .filter(r -> r.getDateTime() != null)
            .filter(r -> {
              ZonedDateTime t = r.getDateTime().atZone(userZone);
              return t.isAfter(startDateAtZone) && t.isBefore(endDateAtZone);
            })
            .collect(Collectors.toList());
    int rejected = inRange.size();
    for (var r : inRange) {
      String reason = r.getReason() != null ? r.getReason() : "UNKNOWN";
      byReason.merge(reason, 1L, Long::sum);
    }

    int attempted = accepted + rejected;
    Double rate = attempted > 0 ? ((double) accepted) / attempted : null;
    var buckets = byReason.entrySet().stream()
            .sorted(java.util.Map.Entry.<String, Long>comparingByValue().reversed())
            .map(e -> com.remotefalcon.controlpanel.response.dashboard.RequestConversionResponse.RejectionBucket.builder()
                    .reason(e.getKey())
                    .count(e.getValue().intValue())
                    .build())
            .collect(Collectors.toList());

    return com.remotefalcon.controlpanel.response.dashboard.RequestConversionResponse.builder()
            .attempted(attempted)
            .accepted(accepted)
            .rejected(rejected)
            .conversionRate(rate)
            .rejectionsByReason(buckets)
            .build();
  }

  // V16 — PSA effectiveness. For each configured PSA, returns the most
  // recent play and what happened in a ±5-minute window: how many unique
  // viewers were active, and how many requests came in before vs after
  // the play (so an owner can see if requesting dipped — bad — or held
  // steady — good — through the PSA).
  public com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse psaEffectiveness(String timezone) {
    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    String showToken = tokenDTO.getShowToken();
    // Load only psaSequences (small, top-level) via projection; the stats arrays
    // are fetched per-PSA below, so the multi-MB Show document is never loaded.
    Show s = this.showRepository.findByShowTokenForPsaConfig(showToken)
            .orElseThrow(() -> new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name()));

    if (s.getPsaSequences() == null || s.getPsaSequences().isEmpty()) {
      return com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse.builder()
              .psaPlays(java.util.Collections.emptyList())
              .build();
    }

    final long WINDOW_MIN = 5L;
    java.util.List<com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse.PsaPlay> plays =
            new java.util.ArrayList<>();

    for (var psa : s.getPsaSequences()) {
      if (psa.getName() == null) continue;
      if (psa.getLastPlayed() == null) {
        plays.add(com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse.PsaPlay.builder()
                .name(psa.getName())
                .lastPlayedMs(null)
                .viewersAround(0)
                .requestsBefore(0)
                .requestsAfter(0)
                .build());
        continue;
      }

      java.time.LocalDateTime lp = psa.getLastPlayed();
      java.time.LocalDateTime windowStart = lp.minusMinutes(WINDOW_MIN);
      java.time.LocalDateTime windowEnd = lp.plusMinutes(WINDOW_MIN);

      // Fetch only this PSA's window slice (widened ±1 day for encoding
      // robustness; the raw-LocalDateTime filters below trim to exact ±5 min).
      Date lower = Date.from(windowStart.minusDays(1).toInstant(ZoneOffset.UTC));
      Date upper = Date.from(windowEnd.plusDays(1).toInstant(ZoneOffset.UTC));

      int viewers = (int) this.statsRepository.pageStatsInRange(showToken, lower, upper).stream()
              .filter(p -> p.getDateTime() != null && p.getIp() != null)
              .filter(p -> !p.getDateTime().isBefore(windowStart) && p.getDateTime().isBefore(windowEnd))
              .map(com.remotefalcon.library.models.Stat.Page::getIp)
              .distinct()
              .count();

      int reqsBefore = 0;
      int reqsAfter = 0;
      for (var j : this.statsRepository.jukeboxStatsInRange(showToken, lower, upper)) {
        if (j.getDateTime() == null) continue;
        if (!j.getDateTime().isBefore(windowStart) && j.getDateTime().isBefore(lp)) reqsBefore++;
        else if (!j.getDateTime().isBefore(lp) && j.getDateTime().isBefore(windowEnd)) reqsAfter++;
      }

      plays.add(com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse.PsaPlay.builder()
              .name(psa.getName())
              .lastPlayedMs(lp.toInstant(java.time.ZoneOffset.UTC).toEpochMilli())
              .viewersAround(viewers)
              .requestsBefore(reqsBefore)
              .requestsAfter(reqsAfter)
              .build());
    }

    // Most recently played first so the actionable PSA is at the top.
    plays.sort((a, b) -> {
      Long am = a.getLastPlayedMs(), bm = b.getLastPlayedMs();
      if (am == null && bm == null) return 0;
      if (am == null) return 1;
      if (bm == null) return -1;
      return Long.compare(bm, am);
    });

    return com.remotefalcon.controlpanel.response.dashboard.PsaEffectivenessResponse.builder()
            .psaPlays(plays)
            .build();
  }

  // PRD A1 — viewer session retrieval for the audience-tab views (V5/V6/V7/V8).
  //
  // Returns sessions in the requested date range, with IPs converted to
  // a stable per-show hash so the frontend never sees raw addresses.
  // Identity grouping for "regulars" / "returning" uses
  // `viewerId || ipHash` on the client side.
  public ViewerSessionsResponse viewerSessions(Long startDate, Long endDate, String timezone) {
    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    Optional<Show> show = this.showRepository.findByShowTokenForViewerSessions(tokenDTO.getShowToken());
    if (show.isEmpty()) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    Show existingShow = show.get();
    if (existingShow.getViewerSessions() == null || existingShow.getViewerSessions().isEmpty()) {
      return ViewerSessionsResponse.builder().sessions(new ArrayList<>()).build();
    }

    ZoneId userZone = ZoneId.of(timezone);
    ZonedDateTime startDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startDate), userZone);
    ZonedDateTime endDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(endDate), userZone).plusDays(2);

    String saltSeed = existingShow.getShowToken() == null ? existingShow.getShowSubdomain() : existingShow.getShowToken();

    List<ViewerSessionsResponse.Session> sessions = existingShow.getViewerSessions().stream()
            .filter(s -> s.getLastSeen() != null && s.getFirstSeen() != null)
            .filter(s -> {
              ZonedDateTime first = s.getFirstSeen().atZone(userZone);
              return first.isAfter(startDateAtZone) && first.isBefore(endDateAtZone);
            })
            .map(s -> ViewerSessionsResponse.Session.builder()
                    .viewerId(s.getViewerId())
                    .ipHash(hashIpForShow(s.getIp(), saltSeed))
                    .nightDate(s.getNightDate() == null ? null
                            : s.getNightDate().atStartOfDay(userZone).toInstant().toEpochMilli())
                    .firstSeen(s.getFirstSeen().atZone(userZone).toInstant().toEpochMilli())
                    .lastSeen(s.getLastSeen().atZone(userZone).toInstant().toEpochMilli())
                    .eventCount(s.getEventCount())
                    .durationSeconds(java.time.Duration.between(s.getFirstSeen(), s.getLastSeen()).getSeconds())
                    .build())
            .sorted(Comparator.comparing(ViewerSessionsResponse.Session::getFirstSeen))
            .collect(Collectors.toList());

    return ViewerSessionsResponse.builder().sessions(sessions).build();
  }

  private static String hashIpForShow(String ip, String salt) {
    if (ip == null) return null;
    try {
      java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
      byte[] digest = md.digest((salt + ":" + ip).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      // First 16 hex chars is plenty of identity space for a per-show
      // bucket; full 64 chars is overkill in the network payload.
      StringBuilder sb = new StringBuilder();
      for (int i = 0; i < 8; i++) sb.append(String.format("%02x", digest[i]));
      return sb.toString();
    } catch (java.security.NoSuchAlgorithmException e) {
      return null;
    }
  }

  // PRD V21 — End-of-Season Wrapped public summary.
  //
  // Public endpoint (NO auth) — looked up by showSubdomain, scoped to a
  // built-in season window for the given year. Returns only aggregate
  // stats; never raw events, IPs, or sequence-level details beyond the
  // top-1 names.
  //
  // Hardened (security pass):
  //  1. Capability-URL access: lookup is by a CSPRNG-random
  //     `preferences.wrappedShareToken`. Subdomains are enumerable via
  //     `showsOnAMap`; tokens aren't. The token IS the credential.
  //  2. Mongo projection (findByWrappedShareTokenForWrapped) keeps password,
  //     apiAccess, showToken, lastLoginIp out of the JVM heap on the
  //     public path.
  //  3. Owner opt-in (`preferences.wrappedPublic`) — defaults false; the
  //     resolver returns null until the owner flips it (which also
  //     auto-generates the share token).
  //  4. Per-IP sliding-window rate limit as defense-in-depth against
  //     token brute-force (CSPRNG randomness already makes this infeasible
  //     but the cap protects ingestion quota / mongo throughput regardless).
  public WrappedSummaryResponse wrappedSummary(String token, String season, Integer year, String timezone) {
    // Rate limit BEFORE Mongo — this is the cheap path.
    String callerIp = resolveCallerIp();
    if (!checkWrappedRateLimit(callerIp)) {
      throw new RuntimeException("RATE_LIMITED");
    }

    if (token == null || token.isEmpty()) {
      return null;
    }

    Optional<Show> showOpt = this.showRepository.findByWrappedShareTokenForWrapped(token);
    if (showOpt.isEmpty()) {
      return null;
    }
    Show show = showOpt.get();

    // Owner opt-in gate. Treat null as false. Returning null (vs throwing
    // SHOW_NOT_FOUND) makes opt-in/revoked/token-not-found look identical
    // to the caller so enumeration via error-string sniffing is closed.
    boolean optedIn = show.getPreferences() != null
            && Boolean.TRUE.equals(show.getPreferences().getWrappedPublic());
    if (!optedIn) {
      return null;
    }

    // Resolve season window. Built-in: halloween (Oct 1 – Nov 7) and
    // christmas (Nov 15 – Jan 7, wraps to next year). Bad season strings
    // throw — let the frontend show a friendly fallback.
    //
    // Show.timezone isn't stored on the document — clients pass their
    // browser-detected timezone. For Wrapped we accept the same arg and
    // fall back to America/New_York when callers don't provide one.
    String tz = (timezone != null && !timezone.isEmpty()) ? timezone : "America/New_York";
    ZoneId userZone = ZoneId.of(tz);
    LocalDate startLocal;
    LocalDate endLocal;
    String seasonLower = season == null ? "" : season.toLowerCase();
    if (seasonLower.equals("halloween")) {
      startLocal = LocalDate.of(year, 10, 1);
      endLocal = LocalDate.of(year, 11, 7);
    } else if (seasonLower.equals("christmas")) {
      startLocal = LocalDate.of(year, 11, 15);
      endLocal = LocalDate.of(year + 1, 1, 7);
    } else {
      throw new RuntimeException("UNKNOWN_SEASON");
    }

    ZonedDateTime startZdt = startLocal.atStartOfDay(userZone);
    ZonedDateTime endZdt = endLocal.plusDays(1).atStartOfDay(userZone);
    long startMs = startZdt.toInstant().toEpochMilli();
    long endMs = endZdt.toInstant().toEpochMilli();
    boolean seasonComplete = ZonedDateTime.now(userZone).isAfter(endZdt);

    WrappedSummaryResponse.WrappedSummaryResponseBuilder b = WrappedSummaryResponse.builder()
            .showName(show.getShowName())
            .season(seasonLower)
            .year(year)
            .startDate(startMs)
            .endDate(endMs)
            .seasonComplete(seasonComplete);

    // Page stats — active nights, unique viewers (page-IP-based), peak night,
    // total page hits.
    if (show.getStats() != null && show.getStats().getPage() != null) {
      List<Stat.Page> pageInRange = show.getStats().getPage().stream()
              .filter(p -> p.getDateTime() != null)
              .filter(p -> {
                ZonedDateTime t = p.getDateTime().atZone(userZone);
                return !t.isBefore(startZdt) && t.isBefore(endZdt);
              })
              .collect(Collectors.toList());

      Map<LocalDate, List<Stat.Page>> byDate = pageInRange.stream()
              .collect(Collectors.groupingBy(p -> p.getDateTime().atZone(userZone).toLocalDate()));

      int activeNights = (int) byDate.values().stream().filter(l -> !l.isEmpty()).count();
      int totalPageHits = pageInRange.size();

      // Peak night by unique IPs that day
      Map.Entry<LocalDate, Long> peakEntry = byDate.entrySet().stream()
              .map(e -> Map.entry(e.getKey(),
                      e.getValue().stream().map(Stat.Page::getIp).filter(Objects::nonNull).distinct().count()))
              .max(Map.Entry.comparingByValue())
              .orElse(null);

      b.activeNights(activeNights).totalPageHits(totalPageHits);
      if (peakEntry != null) {
        b.peakNightDate(peakEntry.getKey().atStartOfDay(userZone).toInstant().toEpochMilli())
                .peakNightViewers(peakEntry.getValue().intValue());
      }

      // Peak hour-of-day across the season (most viewers in any hour bucket)
      Map<Integer, Long> hourBuckets = pageInRange.stream()
              .collect(Collectors.groupingBy(p -> p.getDateTime().atZone(userZone).getHour(),
                      Collectors.counting()));
      hourBuckets.entrySet().stream()
              .max(Map.Entry.comparingByValue())
              .ifPresent(e -> b.peakHour(e.getKey()));

      // Day-of-week with highest avg viewers
      Map<java.time.DayOfWeek, List<Long>> dowGroups = byDate.entrySet().stream()
              .collect(Collectors.groupingBy(
                      e -> e.getKey().getDayOfWeek(),
                      Collectors.mapping(
                              e -> e.getValue().stream().map(Stat.Page::getIp).filter(Objects::nonNull).distinct().count(),
                              Collectors.toList())));
      dowGroups.entrySet().stream()
              .map(e -> Map.entry(e.getKey(),
                      (int) Math.round(e.getValue().stream().mapToLong(Long::longValue).average().orElse(0))))
              .max(Map.Entry.comparingByValue())
              .ifPresent(e -> {
                b.peakDayOfWeek(e.getKey().toString().substring(0, 1)
                        + e.getKey().toString().substring(1).toLowerCase());
                b.peakDayOfWeekAvg(e.getValue());
              });
    }

    // Session-derived stats — dwell, regulars, unique-by-identity.
    if (show.getViewerSessions() != null) {
      List<com.remotefalcon.library.models.ViewerSession> sessionsInRange = show.getViewerSessions().stream()
              .filter(s -> s.getFirstSeen() != null && s.getLastSeen() != null)
              .filter(s -> {
                ZonedDateTime t = s.getFirstSeen().atZone(userZone);
                return !t.isBefore(startZdt) && t.isBefore(endZdt);
              })
              .collect(Collectors.toList());

      // Unique viewers by identityKey (viewerId or "ip:" prefix)
      java.util.Set<String> identities = sessionsInRange.stream()
              .map(s -> s.getViewerId() != null ? "vid:" + s.getViewerId() : "ip:" + s.getIp())
              .collect(Collectors.toSet());
      b.uniqueViewers(identities.size());

      // Dwell — median + max
      List<Long> durationsSec = sessionsInRange.stream()
              .map(s -> java.time.Duration.between(s.getFirstSeen(), s.getLastSeen()).getSeconds())
              .filter(d -> d >= 0)
              .sorted()
              .collect(Collectors.toList());
      if (!durationsSec.isEmpty()) {
        b.medianDwellSeconds(durationsSec.get(durationsSec.size() / 2));
        b.longestDwellSeconds(durationsSec.get(durationsSec.size() - 1));
      }

      // Regulars — count distinct nights per identity
      Map<String, java.util.Set<LocalDate>> nightsPerIdentity = new HashMap<>();
      sessionsInRange.forEach(s -> {
        String id = s.getViewerId() != null ? "vid:" + s.getViewerId() : "ip:" + s.getIp();
        nightsPerIdentity.computeIfAbsent(id, k -> new HashSet<>())
                .add(s.getFirstSeen().atZone(userZone).toLocalDate());
      });
      int loyalNights = nightsPerIdentity.values().stream().mapToInt(java.util.Set::size).max().orElse(0);
      int regulars = (int) nightsPerIdentity.values().stream().filter(set -> set.size() >= 2).count();
      b.mostLoyalRegularNights(loyalNights).regularsCount(regulars);
    }

    // Top requested + total play time (request count × sequence duration)
    if (show.getStats() != null && show.getStats().getJukebox() != null) {
      Map<String, Long> requestsByName = show.getStats().getJukebox().stream()
              .filter(j -> j.getDateTime() != null)
              .filter(j -> {
                ZonedDateTime t = j.getDateTime().atZone(userZone);
                return !t.isBefore(startZdt) && t.isBefore(endZdt);
              })
              .filter(j -> j.getName() != null)
              .collect(Collectors.groupingBy(Stat.Jukebox::getName, Collectors.counting()));

      requestsByName.entrySet().stream()
              .max(Map.Entry.comparingByValue())
              .ifPresent(top -> {
                b.topRequestedSequence(top.getKey()).topRequestedCount(top.getValue().intValue());
                // Find the duration on Show.sequences for this name
                if (show.getSequences() != null) {
                  show.getSequences().stream()
                          .filter(seq -> top.getKey().equalsIgnoreCase(seq.getName()))
                          .findFirst()
                          .ifPresent(seq -> {
                            int dur = seq.getDuration() != null ? seq.getDuration() : 0;
                            b.topRequestedTotalPlaySeconds((long) dur * top.getValue());
                          });
                }
              });
    }

    // Top voted
    if (show.getStats() != null && show.getStats().getVoting() != null) {
      Map<String, Long> votesByName = show.getStats().getVoting().stream()
              .filter(v -> v.getDateTime() != null)
              .filter(v -> {
                ZonedDateTime t = v.getDateTime().atZone(userZone);
                return !t.isBefore(startZdt) && t.isBefore(endZdt);
              })
              .filter(v -> v.getName() != null)
              .collect(Collectors.groupingBy(Stat.Voting::getName, Collectors.counting()));

      votesByName.entrySet().stream()
              .max(Map.Entry.comparingByValue())
              .ifPresent(top ->
                      b.topVotedSequence(top.getKey()).topVotedCount(top.getValue().intValue()));
    }

    return b.build();
  }

  // Hourly engagement aggregation for the analytics page (heatmap V4 +
  // active-hour distribution V9). Returns one bucket per (date, hour)
  // pair where there was at least one page event — empty hours are
  // omitted to keep the payload small. Client pivots / fills gaps.
  public DashboardHourlyStatsResponse dashboardStatsByHour(Long startDate, Long endDate, String timezone) {
    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    String showToken = tokenDTO.getShowToken();
    // No statsPresent distinction needed: this method only groups present
    // events (no gap-fill), so a missing/empty stats.page and an empty in-range
    // slice both yield zero buckets — identical to the old null-page branch.
    if (!this.statsRepository.existsByShowToken(showToken)) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    ZoneId userZone = ZoneId.of(timezone);
    ZonedDateTime startDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startDate), userZone);
    ZonedDateTime endDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(endDate), userZone).plusDays(2);

    // Group events by (LocalDate, hour) pair, deduping IPs within each pair.
    Map<String, List<Stat.Page>> grouped = this.statsRepository
            .pageStatsInRange(showToken, statsWindowLower(startDateAtZone), statsWindowUpper(endDateAtZone))
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .filter(stat -> stat.getKey().getIp() != null)
            .collect(Collectors.groupingBy(
                    e -> e.getValue().toLocalDate() + "|" + e.getValue().getHour(),
                    Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    List<DashboardHourlyStatsResponse.Bucket> buckets = grouped.entrySet().stream()
            .map(entry -> {
                String[] parts = entry.getKey().split("\\|");
                LocalDate date = LocalDate.parse(parts[0]);
                int hour = Integer.parseInt(parts[1]);
                List<Stat.Page> events = entry.getValue();
                long dateMillis = ZonedDateTime.of(date, date.atStartOfDay().toLocalTime(), userZone).toInstant().toEpochMilli();
                return DashboardHourlyStatsResponse.Bucket.builder()
                        .date(dateMillis)
                        .hour(hour)
                        .total(events.size())
                        .unique(events.stream().collect(Collectors.groupingBy(Stat.Page::getIp)).size())
                        .build();
            })
            .sorted(Comparator.comparing(DashboardHourlyStatsResponse.Bucket::getDate)
                    .thenComparing(DashboardHourlyStatsResponse.Bucket::getHour))
            .collect(Collectors.toList());

    return DashboardHourlyStatsResponse.builder().buckets(buckets).build();
  }

  public DashboardLiveStatsResponse dashboardLiveStats(Long startDate, Long endDate, String timezone) {
    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    Optional<Show> show = this.showRepository.findByShowTokenForLiveStats(tokenDTO.getShowToken());
    if(show.isEmpty()) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    Show existingShow = show.get();
    ZoneId userZone = ZoneId.of(timezone);
    // Only return stats for the current day in the user's timezone.
    ZonedDateTime startDateAtZone = ZonedDateTime.now(userZone).toLocalDate().atStartOfDay(userZone);
    ZonedDateTime endDateAtZone = startDateAtZone.plusDays(1);

    // V22 — current viewer count (deduped by viewerId-or-IP, last 5 min)
    Integer currentViewers = null;
    if (existingShow.getActiveViewers() != null) {
      java.time.LocalDateTime cutoff = java.time.LocalDateTime.now().minusMinutes(5);
      java.util.Set<String> liveIdentities = existingShow.getActiveViewers().stream()
              .filter(av -> av.getVisitDateTime() != null && av.getVisitDateTime().isAfter(cutoff))
              .map(av -> av.getViewerId() != null ? "vid:" + av.getViewerId() : "ip:" + av.getIpAddress())
              .collect(Collectors.toSet());
      currentViewers = liveIdentities.size();
    }

    // V22 — median dwell among sessions started today in the user's tz.
    // Returns null when there's nothing to median (frontend renders "—").
    Long medianDwellTonight = null;
    if (existingShow.getViewerSessions() != null) {
      List<Long> tonightDurations = existingShow.getViewerSessions().stream()
              .filter(s -> s.getFirstSeen() != null && s.getLastSeen() != null)
              .filter(s -> {
                ZonedDateTime t = s.getFirstSeen().atZone(userZone);
                return !t.isBefore(startDateAtZone) && t.isBefore(endDateAtZone);
              })
              .map(s -> java.time.Duration.between(s.getFirstSeen(), s.getLastSeen()).getSeconds())
              .filter(d -> d >= 0)
              .sorted()
              .collect(Collectors.toList());
      if (!tonightDurations.isEmpty()) {
        medianDwellTonight = tonightDurations.get(tonightDurations.size() / 2);
      }
    }

    // V17 — heartbeat health. lastFppHeartbeat is written as LocalDateTime
    // by plugins-api on a UTC JVM, so interpret it as UTC for the round-trip
    // back to epoch ms. heartbeatGaps mirror the same convention.
    Long lastHeartbeatMs = null;
    if (existingShow.getLastFppHeartbeat() != null) {
      lastHeartbeatMs = existingShow.getLastFppHeartbeat().toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
    }
    java.util.List<DashboardLiveStatsResponse.HeartbeatGapDto> gapDtos = null;
    if (existingShow.getHeartbeatGaps() != null) {
      gapDtos = existingShow.getHeartbeatGaps().stream()
              .filter(g -> g.getStartedAt() != null && g.getEndedAt() != null)
              .map(g -> DashboardLiveStatsResponse.HeartbeatGapDto.builder()
                      .startedAtMs(g.getStartedAt().toInstant(java.time.ZoneOffset.UTC).toEpochMilli())
                      .endedAtMs(g.getEndedAt().toInstant(java.time.ZoneOffset.UTC).toEpochMilli())
                      .build())
              .collect(Collectors.toList());
    }

    // V18 — version-change history (most recent first)
    java.util.List<DashboardLiveStatsResponse.VersionChangeDto> versionChangeDtos = null;
    if (existingShow.getVersionChanges() != null) {
      versionChangeDtos = existingShow.getVersionChanges().stream()
              .filter(v -> v.getAt() != null)
              .map(v -> DashboardLiveStatsResponse.VersionChangeDto.builder()
                      .atMs(v.getAt().toInstant(java.time.ZoneOffset.UTC).toEpochMilli())
                      .pluginVersion(v.getPluginVersion())
                      .fppVersion(v.getFppVersion())
                      .build())
              .sorted((a, b) -> Long.compare(b.getAtMs(), a.getAtMs()))
              .collect(Collectors.toList());
    }

    return DashboardLiveStatsResponse.builder()
            // PSA-v2 Q3 — display only viewer-initiated requests in the
            // operator's "current requests" tile to stay consistent with the
            // jukeboxDepth cap that now also excludes PSAs/leaders. Otherwise
            // an operator sees "5 of 5" while the cap predicate sees "3 of 5"
            // and accepts a new request, which is confusing.
            .currentRequests(PluginQueueHelper.countViewerRequests(show.get()))
            .totalRequests(this.buildTotalRequestsLiveStat(startDateAtZone, endDateAtZone, timezone, show.get(), false))
            // Count only viewer-cast votes. PSA cadence/override, leader-promoted
            // winners, and grouped-winner ordering are injected into show.votes
            // with a priority sentinel so they win playback selection — they are
            // not audience actions and must not inflate the "Active Votes" tile.
            .currentVotes(show.get().getVotes() != null
                    ? show.get().getVotes().stream().filter(v -> !Vote.isSystemInjected(v)).mapToInt(Vote::getVotes).sum()
                    : 0)
            .totalVotes(this.buildTotalVotesLiveStat(startDateAtZone, endDateAtZone, timezone, show.get(), false))
            .playingNow(getPlayingNow(existingShow))
            .playingNext(getPlayingNext(existingShow))
            .currentViewers(currentViewers)
            .medianDwellSecondsTonight(medianDwellTonight)
            .lastHeartbeatMs(lastHeartbeatMs)
            .heartbeatGaps(gapDtos)
            .versionChanges(versionChangeDtos)
            .build();
  }

  private String getPlayingNow(Show show) {
    Optional<Sequence> playingNowSequence = show.getSequences().stream()
            .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), show.getPlayingNow()))
            .findFirst();
    return playingNowSequence.map(Sequence::getDisplayName).orElse(show.getPlayingNow());
  }

  private String getPlayingNext(Show show) {
    // Report whatever is *actually* next from the operator's POV — including
    // PSAs and leader sequences. The operator dashboard is NOT the same
    // surface as the viewer's NEXT_PLAYLIST: the viewer should be insulated
    // from operator-policy interstitials (handled in viewer's
    // GraphQLQueryService.updatePlayingNext), but the operator wants to
    // know exactly what FPP will play next so they aren't surprised when a
    // PSA fires. The PSA/Leader chip on the NowPlayingCard already
    // classifies the item visually; the operator gets both the name and
    // the type.
    Optional<Request> nextRequest = show.getRequests() == null
            ? Optional.empty()
            : show.getRequests().stream()
                    .filter(r -> r != null && r.getSequence() != null)
                    .min(Comparator.comparing(Request::getPosition));

    if(nextRequest.isPresent()) {
      return nextRequest.get().getSequence().getDisplayName();
    }else {
      String fromSchedule = show.getPlayingNextFromSchedule();
      if (StringUtils.isEmpty(fromSchedule)) {
        return "";
      }
      Optional<Sequence> playingNextScheduledSequence = show.getSequences().stream()
              .filter(sequence -> StringUtils.equalsIgnoreCase(sequence.getName(), fromSchedule))
              .findFirst();
      return playingNextScheduledSequence.map(Sequence::getDisplayName).orElse(fromSchedule);
    }
  }

  public ResponseEntity<ByteArrayResource> downloadStatsToExcel(DownloadStatsToExcelRequest downloadStatsToExcelRequest) {
    DashboardStatsResponse dashboardStats = this.dashboardStats(downloadStatsToExcelRequest.getDateFilterStart(), downloadStatsToExcelRequest.getDateFilterEnd(), downloadStatsToExcelRequest.getTimezone());
    if(dashboardStats != null) {
      return excelUtil.generateDashboardExcel(dashboardStats, downloadStatsToExcelRequest.getTimezone());
    }
    return ResponseEntity.status(204).build();
  }

  private List<DashboardStatsResponse.Stat> buildPageStats(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, List<Stat.Page> inRange, boolean statsPresent) {
    List<DashboardStatsResponse.Stat> pageStats = new ArrayList<>();
    if(!statsPresent) {
      return pageStats;
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<LocalDate, List<Stat.Page>> pageStatsGroupedByDate = inRange
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .filter(stat -> stat.getKey().getIp() != null)
            .collect(Collectors.groupingBy(stat -> stat.getValue().toLocalDate(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    this.fillStatDateGaps(startDateAtZone, endDateAtZone, pageStatsGroupedByDate);

    pageStatsGroupedByDate.forEach((date, stat) -> pageStats.add(DashboardStatsResponse.Stat.builder()
            .date(ZonedDateTime.of(date, date.atStartOfDay().toLocalTime(), userZone).toInstant().toEpochMilli())
            .total(stat.size())
            .unique(stat.stream().collect(Collectors.groupingBy(Stat.Page::getIp)).size())
            .viewerIps(stat.stream().map(Stat.Page::getIp).collect(Collectors.toSet()))
            .build()));

    pageStats.sort(Comparator.comparing(DashboardStatsResponse.Stat::getDate));

    return pageStats;
  }

  private List<DashboardStatsResponse.Stat> buildJukeboxStatsByDate(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, List<Stat.Jukebox> inRange, boolean statsPresent) {
    List<DashboardStatsResponse.Stat> jukeboxStats = new ArrayList<>();
    if(!statsPresent) {
      return jukeboxStats;
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<LocalDate, List<Stat.Jukebox>> jukeboxStatsGroupedByDate = inRange
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getValue().toLocalDate(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    this.fillStatDateGaps(startDateAtZone, endDateAtZone, jukeboxStatsGroupedByDate);

    jukeboxStatsGroupedByDate.forEach((date, stat) -> {
      List<DashboardStatsResponse.SequenceStat> sequences = new ArrayList<>();
      Map<String, List<Stat.Jukebox>> requests = stat.stream()
              .collect(Collectors.groupingBy(Stat.Jukebox::getName));
      requests.forEach((sequence, request) -> sequences.add(DashboardStatsResponse.SequenceStat.builder()
              .total(request.size())
              .name(sequence)
              .build()));
      jukeboxStats.add(DashboardStatsResponse.Stat.builder()
              .sequences(sequences.stream()
                      .sorted(Comparator.comparing(DashboardStatsResponse.SequenceStat::getTotal).reversed())
                      .toList())
              .date(ZonedDateTime.of(date, date.atStartOfDay().toLocalTime(), userZone).toInstant().toEpochMilli())
              .total(stat.size())
              .build());
    });

    jukeboxStats.sort(Comparator.comparing(DashboardStatsResponse.Stat::getDate));

    return jukeboxStats;
  }

  private DashboardStatsResponse.Stat buildJukeboxStatsBySequence(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, List<Stat.Jukebox> inRange, boolean statsPresent) {
    List<DashboardStatsResponse.SequenceStat> sequences = new ArrayList<>();
    if(!statsPresent) {
      return DashboardStatsResponse.Stat.builder()
              .sequences(sequences)
              .build();
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<String, List<Stat.Jukebox>> jukeboxStatsGroupedBySequence = inRange
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getKey().getName(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    jukeboxStatsGroupedBySequence.forEach((sequence, stat) -> sequences.add(DashboardStatsResponse.SequenceStat.builder()
            .total(stat.size())
            .name(sequence)
            .build()));

    sequences.sort(Comparator.comparing(DashboardStatsResponse.SequenceStat::getTotal).reversed());

    return DashboardStatsResponse.Stat.builder()
            .sequences(sequences)
            .build();
  }

  private List<DashboardStatsResponse.Stat> buildVoteStatsByDate(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, List<Stat.Voting> inRange, boolean statsPresent) {
    List<DashboardStatsResponse.Stat> votingStats = new ArrayList<>();
    if(!statsPresent) {
      return votingStats;
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<LocalDate, List<Stat.Voting>> votingStatsGroupedByDate = inRange
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getValue().toLocalDate(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    this.fillStatDateGaps(startDateAtZone, endDateAtZone, votingStatsGroupedByDate);

    votingStatsGroupedByDate.forEach((date, stat) -> {
      List<DashboardStatsResponse.SequenceStat> sequences = new ArrayList<>();
      Map<String, List<Stat.Voting>> votes = stat.stream()
              .collect(Collectors.groupingBy(Stat.Voting::getName));
      votes.forEach((sequence, vote) -> sequences.add(DashboardStatsResponse.SequenceStat.builder()
              .total(vote.size())
              .name(sequence)
              .build()));
      votingStats.add(DashboardStatsResponse.Stat.builder()
              .sequences(sequences.stream()
                      .sorted(Comparator.comparing(DashboardStatsResponse.SequenceStat::getTotal).reversed())
                      .toList())
              .date(ZonedDateTime.of(date, date.atStartOfDay().toLocalTime(), userZone).toInstant().toEpochMilli())
              .total(stat.size())
              .build());
    });

    votingStats.sort(Comparator.comparing(DashboardStatsResponse.Stat::getDate));

    return votingStats;
  }

  private DashboardStatsResponse.Stat buildVoteStatsBySequence(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, List<Stat.Voting> inRange, boolean statsPresent) {
    List<DashboardStatsResponse.SequenceStat> sequences = new ArrayList<>();
    if(!statsPresent) {
      return DashboardStatsResponse.Stat.builder()
              .sequences(sequences)
              .build();
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<String, List<Stat.Voting>> voteStatsGroupedBySequence = inRange
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getKey().getName(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    voteStatsGroupedBySequence.forEach((sequence, stat) -> sequences.add(DashboardStatsResponse.SequenceStat.builder()
            .total(stat.size())
            .name(sequence)
            .build()));

    sequences.sort(Comparator.comparing(DashboardStatsResponse.SequenceStat::getTotal).reversed());

    return DashboardStatsResponse.Stat.builder()
            .sequences(sequences)
            .build();
  }

  private List<DashboardStatsResponse.Stat> buildVoteWinStatsByDate(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, List<Stat.VotingWin> inRange, boolean statsPresent) {
    List<DashboardStatsResponse.Stat> votingWinStats = new ArrayList<>();
    if(!statsPresent) {
      return votingWinStats;
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<LocalDate, List<Stat.VotingWin>> votingWinStatsGroupedByDate = inRange
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .sorted(Comparator.comparing(entry -> entry.getValue().toLocalDateTime()))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getValue().toLocalDate(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    this.fillStatDateGaps(startDateAtZone, endDateAtZone, votingWinStatsGroupedByDate);

    votingWinStatsGroupedByDate.forEach((date, stat) -> {
      List<DashboardStatsResponse.SequenceStat> sequences = new ArrayList<>();
      Map<String, List<Stat.VotingWin>> voteWins = stat.stream()
              .collect(Collectors.groupingBy(Stat.VotingWin::getName));
      voteWins.forEach((sequence, win) -> sequences.add(DashboardStatsResponse.SequenceStat.builder()
              .total(win.size())
              .name(sequence)
              .build()));
      votingWinStats.add(DashboardStatsResponse.Stat.builder()
              .sequences(sequences.stream()
                      .sorted(Comparator.comparing(DashboardStatsResponse.SequenceStat::getTotal).reversed())
                      .toList())
              .date(ZonedDateTime.of(date, date.atStartOfDay().toLocalTime(), userZone).toInstant().toEpochMilli())
              .total(stat.size())
              .build());
    });

    votingWinStats.sort(Comparator.comparing(DashboardStatsResponse.Stat::getDate));

    return votingWinStats;
  }

  private DashboardStatsResponse.Stat buildVoteWinStatsBySequence(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, List<Stat.VotingWin> inRange, boolean statsPresent) {
    List<DashboardStatsResponse.SequenceStat> sequences = new ArrayList<>();
    if(!statsPresent) {
      return DashboardStatsResponse.Stat.builder()
              .sequences(sequences)
              .build();
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<String, List<Stat.VotingWin>> voteWinStatsGroupedBySequence = inRange
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getKey().getName(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    voteWinStatsGroupedBySequence.forEach((sequence, stat) -> sequences.add(DashboardStatsResponse.SequenceStat.builder()
            .total(stat.size())
            .name(sequence)
            .build()));

    sequences.sort(Comparator.comparing(DashboardStatsResponse.SequenceStat::getTotal).reversed());

    return DashboardStatsResponse.Stat.builder()
            .sequences(sequences)
            .build();
  }

  private Integer buildTotalRequestsLiveStat(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, Show show, Boolean fillDays) {
    List<DashboardStatsResponse.Stat> jukeboxStats = new ArrayList<>();
    if(show.getStats() == null) {
      return 0;
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<LocalDate, List<Stat.Jukebox>> jukeboxStatsGroupedByDate = show.getStats().getJukebox()
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getValue().toLocalDate(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    if(fillDays) {
      this.fillStatDateGaps(startDateAtZone, endDateAtZone, jukeboxStatsGroupedByDate);
    }

    jukeboxStatsGroupedByDate.forEach((date, stat) -> jukeboxStats.add(DashboardStatsResponse.Stat.builder()
            .date(ZonedDateTime.of(date, date.atStartOfDay().toLocalTime(), userZone).toInstant().toEpochMilli())
            .total(stat.size())
            .unique(stat.stream().collect(Collectors.groupingBy(Stat.Jukebox::getName)).size())
            .build()));

    return jukeboxStats.stream()
            .mapToInt(DashboardStatsResponse.Stat::getTotal)
            .sum();
  }

  private Integer buildTotalVotesLiveStat(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, String timezone, Show show, Boolean fillDays) {
    List<DashboardStatsResponse.Stat> voteStats = new ArrayList<>();
    if(show.getStats() == null) {
      return 0;
    }
    ZoneId userZone = ZoneId.of(timezone);
    Map<LocalDate, List<Stat.Voting>> voteStatsGroupedByDate = show.getStats().getVoting()
            .stream()
            .filter(stat -> stat.getDateTime() != null)
            .map(stat -> Map.entry(stat, convertStatDateTime(stat.getDateTime(), userZone)))
            .filter(stat -> stat.getValue().isAfter(startDateAtZone))
            .filter(stat -> stat.getValue().isBefore(endDateAtZone))
            .collect(Collectors.groupingBy(stat -> stat.getValue().toLocalDate(), Collectors.mapping(Map.Entry::getKey, Collectors.toList())));

    if(fillDays) {
      this.fillStatDateGaps(startDateAtZone, endDateAtZone, voteStatsGroupedByDate);
    }

    voteStatsGroupedByDate.forEach((date, stat) -> voteStats.add(DashboardStatsResponse.Stat.builder()
            .date(ZonedDateTime.of(date, date.atStartOfDay().toLocalTime(), userZone).toInstant().toEpochMilli())
            .total(stat.size())
            .unique(stat.stream().collect(Collectors.groupingBy(Stat.Voting::getName)).size())
            .build()));

    return voteStats.stream()
            .mapToInt(DashboardStatsResponse.Stat::getTotal)
            .sum();
  }

  @SuppressWarnings("unchecked")
  private <V> void fillStatDateGaps(ZonedDateTime startDateAtZone, ZonedDateTime endDateAtZone, Map<LocalDate, V> statMap) {
    List<LocalDate> datesInRange = startDateAtZone.toLocalDate().datesUntil(endDateAtZone.toLocalDate()).toList();
    datesInRange.forEach(date -> {
      if(!statMap.containsKey(date)) {
        statMap.put(date, (V) new ArrayList<>());
      }
    });
  }

  // Mongo-side stat window bounds. The precise wall-clock range filter still
  // lives in the build*Stats helpers (convertStatDateTime + isAfter/isBefore);
  // these widen that range by a day on each side so StatsRepository returns a
  // guaranteed SUPERSET regardless of LocalDateTime<->BSON-date encoding, and
  // the helpers trim to exact. Stored Stat.dateTime is naive wall-clock, so the
  // zoned bounds' local time is reinterpreted as a UTC instant to match it.
  private static Date statsWindowLower(ZonedDateTime startDateAtZone) {
    return Date.from(startDateAtZone.toLocalDateTime().minusDays(1).toInstant(ZoneOffset.UTC));
  }

  private static Date statsWindowUpper(ZonedDateTime endDateAtZone) {
    return Date.from(endDateAtZone.toLocalDateTime().plusDays(1).toInstant(ZoneOffset.UTC));
  }

  private ZonedDateTime convertStatDateTime(LocalDateTime statDateTime, ZoneId userZone) {
    // Stat.*.dateTime is written as naive viewer-browser wall-clock time
    // (apps/ui/.../externalViewer/index.jsx — moment().format(...)). Attach
    // the user's zone without shifting; other call sites in this file
    // assume the same convention. Long-term redesign: issue-tracker #135.
    return statDateTime.atZone(userZone);
  }

  // Best-effort caller-IP lookup for the public wrappedSummary path. The
  // request scope is set up by Spring on every controller hit; if a future
  // caller invokes wrappedSummary outside that scope we degrade to a
  // shared "unknown" bucket rather than failing the request.
  private String resolveCallerIp() {
    try {
      return this.clientUtil.getClientIp(
              ((org.springframework.web.context.request.ServletRequestAttributes)
                      org.springframework.web.context.request.RequestContextHolder.currentRequestAttributes())
                      .getRequest());
    } catch (IllegalStateException ex) {
      return "unknown";
    }
  }

  // Sliding-window rate limit. Stores recent request timestamps per IP
  // in a bounded deque; on each call we evict entries older than the
  // window before deciding. Concurrent deque + computeIfAbsent gives us
  // thread safety without an explicit lock.
  private boolean checkWrappedRateLimit(String callerIp) {
    if (callerIp == null || callerIp.isEmpty()) {
      callerIp = "unknown";
    }
    long now = System.currentTimeMillis();
    long windowStart = now - WRAPPED_RATE_LIMIT_WINDOW_MS;
    ConcurrentLinkedDeque<Long> bucket =
            wrappedRateLimitBuckets.computeIfAbsent(callerIp, k -> new ConcurrentLinkedDeque<>());
    // Evict expired entries.
    while (true) {
      Long oldest = bucket.peekFirst();
      if (oldest == null || oldest >= windowStart) {
        break;
      }
      bucket.pollFirst();
    }
    if (bucket.size() >= WRAPPED_RATE_LIMIT_REQUESTS) {
      return false;
    }
    bucket.addLast(now);
    return true;
  }
}
