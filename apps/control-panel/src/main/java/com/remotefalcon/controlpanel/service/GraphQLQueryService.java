package com.remotefalcon.controlpanel.service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Stream;

import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.models.*;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.ShowsOnAMap;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.enums.ViewerControlMode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class GraphQLQueryService {
    private final AuthUtil authUtil;
    private final ClientUtil clientUtil;
    private final ShowRepository showRepository;
    private final NotificationRepository notificationRepository;
    private final ViewerPageService viewerPageService;
    private final MongoTemplate mongoTemplate;

    public Show signIn() {
        var request = this.authUtil.getCurrentRequest();
        String[] basicAuthCredentials = this.authUtil.getBasicAuthCredentials(request);
        if (basicAuthCredentials != null) {
            String ipAddress = this.clientUtil.getClientIp(request);
            String email = basicAuthCredentials[0];
            String password = basicAuthCredentials[1];
            Optional<Show> optionalShow = this.showRepository.findByEmailCollationForAuth(email);
            if (optionalShow.isEmpty()) {
                throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
            }
            Show show = optionalShow.get();
            BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
            boolean passwordsMatch = passwordEncoder.matches(password, show.getPassword());
            if (passwordsMatch) {
                if (!show.getEmailVerified()) {
                    throw new RuntimeException(StatusResponse.EMAIL_NOT_VERIFIED.name());
                }
                LocalDateTime now = LocalDateTime.now();
                LocalDateTime expireDate = now.plusYears(2);
                // Atomic field update instead of save(show). signIn now loads a
                // PROJECTED Show (findByEmailCollationForAuth excludes stats +
                // viewerSessions), so a full-document save() would WIPE those
                // arrays. updateFirst also avoids the lost-update race where a
                // login clobbers concurrent viewer/plugin writes to the same
                // doc during a live show.
                this.mongoTemplate.updateFirst(
                        Query.query(Criteria.where("showToken").is(show.getShowToken())),
                        new Update()
                                .set("lastLoginDate", now)
                                .set("expireDate", expireDate)
                                .set("lastLoginIp", ipAddress),
                        Show.class);
                // Mirror the persisted values onto the response object and
                // normalize it for the client (checkFields defaults preferences
                // + empty collections). Not persisted beyond the update above.
                show.setLastLoginDate(now);
                show.setExpireDate(expireDate);
                show.setLastLoginIp(ipAddress);
                this.checkFields(show);
                show.setServiceToken(this.authUtil.signJwt(show));
                return show;
            }
        }
        throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
    }

    public Show impersonateShow(String showSubdomain) {
        Optional<Show> optionalShow = this.showRepository.findByShowSubdomain(showSubdomain);
        if (optionalShow.isEmpty()) {
            throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
        }
        Show show = optionalShow.get();
        show.setServiceToken(this.authUtil.signJwt(show));
        return show;
    }

    public List<String> getShowsAutoSuggest(String showName) {
        if (StringUtils.isBlank(showName)) {
            return Collections.emptyList();
        }
        // Build the anchored regex in Java. Spring Data MongoDB's ?N
        // placeholder substitutes outside string literals only, so we
        // can't put the ^ inside the @Query string -- the caller has to
        // hand the repository the full pattern. Pattern.quote escapes
        // regex metacharacters in the user input so a typed "(test)"
        // doesn't break the regex. The repository @Query adds
        // $options: 'i' so the match is case-insensitive against the
        // plain idx_showName btree index.
        String anchored = "^" + java.util.regex.Pattern.quote(showName);
        return this.showRepository
                .findByShowNameStartingWith(
                        anchored, org.springframework.data.domain.PageRequest.of(0, 25))
                .stream()
                .map(show -> show.getShowName())
                .toList();
    }

    private void checkFields(Show show) {
        if(show.getPreferences().getViewerControlMode() == null) {
            show.getPreferences().setViewerControlMode(ViewerControlMode.JUKEBOX);
        }
        if(show.getStats() == null) {
            show.setStats(Stat.builder()
                    .jukebox(new ArrayList<>())
                    .page(new ArrayList<>())
                    .voting(new ArrayList<>())
                    .votingWin(new ArrayList<>())
                    .build());
        }
        if(CollectionUtils.isEmpty(show.getRequests())) {
            show.setRequests(new ArrayList<>());
        }
        if(CollectionUtils.isEmpty(show.getVotes())) {
            show.setVotes(new ArrayList<>());
        }
    }

    public Show verifyPasswordResetLink(String passwordResetLink) {
        Optional<Show> show = this.showRepository.findByPasswordResetLinkAndPasswordResetExpiryGreaterThan(passwordResetLink, LocalDateTime.now());
        if(show.isPresent()) {
            String jwt = this.authUtil.signJwt(show.get());
            show.get().setServiceToken(jwt);
            return show.get();
        }
        throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
    }

    public Show getShow() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            Show s = show.get();
            LocalDateTime now = LocalDateTime.now();
            s.setLastLoginDate(now);
            boolean psaBackfilled = checkPsaSequences(s);
            // Lazy-backfill pageId + updatedAt on legacy viewer pages.
            boolean pagesBackfilled = this.viewerPageService.normalizeAndBackfill(s);

            // Atomic field update instead of save(s). getShow still loads the full
            // Show for the response, but a full-document save() here clobbered
            // concurrent viewer/plugin writes (votes/requests/stats/viewerSessions/
            // activeViewers) that landed during a live-show dashboard open/refresh —
            // the most common operator action while a show is running. Persist ONLY
            // the fields getShow owns: lastLoginDate always, and the two lazy
            // backfills only when they actually changed something (steady state
            // writes just lastLoginDate and touches none of the hot arrays).
            Update update = new Update().set("lastLoginDate", now);
            if (psaBackfilled) {
                update.set("psaSequences", s.getPsaSequences());
            }
            if (pagesBackfilled) {
                update.set("pages", s.getPages());
            }
            this.mongoTemplate.updateFirst(
                    Query.query(Criteria.where("showToken").is(s.getShowToken())), update, Show.class);

            List<Sequence> sequences = s.getSequences();
            sequences.sort(Comparator.comparing(Sequence::getActive)
                            .reversed()
                    .thenComparing(Sequence::getOrder));
            s.setSequences(sequences);

            List<Request> jukeboxRequests = s.getRequests();
            if(CollectionUtils.isNotEmpty(jukeboxRequests)) {
                jukeboxRequests.sort(Comparator.comparing(Request::getPosition));
            }
            s.setRequests(jukeboxRequests);

            return s;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    // Backfills a lastPlayed on any PSA that has none. Returns true if it changed
    // anything, so getShow only persists psaSequences when there's a real change
    // (avoids a needless full-array write that could clobber a concurrent viewer
    // PSA-cadence update).
    private boolean checkPsaSequences(Show show) {
      if (show.getPsaSequences() == null) {
        return false;
      }
      boolean changed = false;
      for(PsaSequence psaSequence : show.getPsaSequences()) {
        if(psaSequence.getLastPlayed() == null) {
          psaSequence.setLastPlayed(LocalDateTime.now());
          changed = true;
        }
      }
      return changed;
    }

    public List<ShowsOnAMap> showsOnAMap() {
        List<Show> allShows = this.showRepository.getShowsOnMap();
        List<ShowsOnAMap> showsOnAMapList = new ArrayList<>();
        allShows.forEach(show -> {
            if(show.getPreferences() != null
                    && show.getPreferences().getShowOnMap()) {
                showsOnAMapList.add(ShowsOnAMap.builder()
                                .showName(show.getShowName())
                                .showLatitude(show.getPreferences().getShowLatitude())
                                .showLongitude(show.getPreferences().getShowLongitude())
                        .build());
            }
        });
        return showsOnAMapList;
    }

    public Show getShowByShowName(String showName) {
        Optional<Show> show = this.showRepository.findByShowName(showName);
        return show.orElse(null);
    }

    public List<NotificationModel> getNotifications() {
        Stream<NotificationModel> globalStream = Optional.ofNullable(this.notificationRepository.findAll())
                .orElseGet(List::of)
                .stream()
                .filter(Objects::nonNull)
                .map(n -> NotificationModel.builder()
                        .uuid(n.getUuid())
                        .type(n.getType())
                        .subject(n.getSubject())
                        .preview(n.getPreview())
                        .message(n.getMessage())
                        .link(n.getLink())
                        .createdDate(n.getCreatedDate())
                        .build());

        Show show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken())
                .orElseThrow(() -> new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name()));

        Stream<NotificationModel> showStream = Optional.ofNullable(show.getShowNotifications())
                .orElseGet(List::of)
                .stream()
                .filter(Objects::nonNull)
                .map(ShowNotification::getNotification)
                .filter(Objects::nonNull);

        return Stream.concat(globalStream, showStream)
                .sorted(Comparator.comparing(
                        NotificationModel::getCreatedDate,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(20)
                .toList();
    }

    // Admin-only paginated list of ADMIN-type broadcasts for the
    // Broadcast Manager tab (PRD-004). Defaults to offset=0, limit=10,
    // and caps limit at 100 so a misbehaving client can't ask for the
    // whole collection in one shot.
    public NotificationPage listAdminNotifications(Integer offset, Integer limit) {
        int safeOffset = offset == null || offset < 0 ? 0 : offset;
        int safeLimit = limit == null || limit <= 0 ? 10 : Math.min(limit, 100);
        int pageIndex = safeOffset / safeLimit;
        Page<Notification> page = this.notificationRepository
                .findByTypeOrderByCreatedDateDesc(NotificationType.ADMIN, PageRequest.of(pageIndex, safeLimit));
        List<NotificationModel> items = page.getContent().stream()
                .map(n -> NotificationModel.builder()
                        .uuid(n.getUuid())
                        .type(n.getType())
                        .subject(n.getSubject())
                        .preview(n.getPreview())
                        .message(n.getMessage())
                        .link(n.getLink())
                        .createdDate(n.getCreatedDate())
                        .build())
                .toList();
        return NotificationPage.builder()
                .items(items)
                .total((int) page.getTotalElements())
                .build();
    }
}
