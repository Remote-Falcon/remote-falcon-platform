package com.remotefalcon.controlpanel.service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Stream;

import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.models.*;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
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

    public Show signIn() {
        var request = this.authUtil.getCurrentRequest();
        String[] basicAuthCredentials = this.authUtil.getBasicAuthCredentials(request);
        if (basicAuthCredentials != null) {
            String ipAddress = this.clientUtil.getClientIp(request);
            String email = basicAuthCredentials[0];
            String password = basicAuthCredentials[1];
            Optional<Show> optionalShow = this.showRepository.findByEmailCollation(email);
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
                show.setLastLoginDate(LocalDateTime.now());
                show.setExpireDate(LocalDateTime.now().plusYears(2));
                show.setLastLoginIp(ipAddress);
                this.checkFields(show);
                this.showRepository.save(show);
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
        return this.showRepository.findTop25ByShowNameContainingIgnoreCase(showName)
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
            show.get().setLastLoginDate(LocalDateTime.now());
            checkPsaSequences(show.get());
            this.showRepository.save(show.get());

            List<Sequence> sequences = show.get().getSequences();
            sequences.sort(Comparator.comparing(Sequence::getActive)
                            .reversed()
                    .thenComparing(Sequence::getOrder));
            show.get().setSequences(sequences);

            List<Request> jukeboxRequests = show.get().getRequests();
            if(CollectionUtils.isNotEmpty(jukeboxRequests)) {
                jukeboxRequests.sort(Comparator.comparing(Request::getPosition));
            }
            show.get().setRequests(jukeboxRequests);

            return show.get();
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    private void checkPsaSequences(Show show) {
      for(PsaSequence psaSequence : show.getPsaSequences()) {
        if(psaSequence.getLastPlayed() == null) {
          psaSequence.setLastPlayed(LocalDateTime.now());
        }
      }
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
}
