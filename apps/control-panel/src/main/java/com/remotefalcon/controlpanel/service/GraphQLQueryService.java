package com.remotefalcon.controlpanel.service;

import java.time.LocalDateTime;
import java.util.*;

import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.enums.NotificationType;
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

    public List<ShowNotification> getNotifications() {
      return List.of(); // Temporarily disable notifications
        // Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        // if (show.isEmpty()) {
        //     throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
        // }

        // Show existingShow = show.get();

        // // Source of truth: repository notifications
        // List<Notification> repoNotifications = Optional.ofNullable(this.notificationRepository.findAll())
        //         .orElse(Collections.emptyList());

        // // User's current notification states (read/deleted)
        // List<ShowNotification> userNotifs = Optional.ofNullable(existingShow.getShowNotifications())
        //         .orElseGet(ArrayList::new);

        // // Index user's notifications by UUID (null-safe)
        // Map<String, ShowNotification> userByUuid = new HashMap<>();
        // for (ShowNotification sn : userNotifs) {
        //     if (sn == null) continue;
        //     NotificationModel n = sn.getNotification();
        //     String uuid = (n == null) ? null : n.getUuid();
        //     if (uuid != null) {
        //         userByUuid.put(uuid, sn);
        //     }
        // }

        // List<ShowNotification> merged = new ArrayList<>();

        // for (Notification repoNotif : repoNotifications) {
        //     if (repoNotif == null || repoNotif.getUuid() == null) continue;
        //     ShowNotification userSN = userByUuid.remove(repoNotif.getUuid());

        //     if (userSN == null) {
        //         // New to user → add default state
        //         merged.add(ShowNotification.builder()
        //                 .notification(NotificationModel.builder()
        //                   .type(repoNotif.getType())
        //                   .uuid(repoNotif.getUuid())
        //                   .createdDate(repoNotif.getCreatedDate())
        //                   .message(repoNotif.getMessage())
        //                   .preview(repoNotif.getPreview())
        //                   .subject(repoNotif.getSubject())
        //                   .build())
        //                 .read(false)
        //                 .deleted(false)
        //                 .build());
        //         continue;
        //     }

        //     // Existing in both places: honor user's deleted/read flags
        //     if (Boolean.TRUE.equals(userSN.getDeleted())) {
        //         NotificationType type = repoNotif.getType();
        //         // For ADMIN notifications: keep the deleted record so it is not re-added on next calls
        //         if (type == NotificationType.ADMIN) {
        //             userSN.setNotification(NotificationModel.builder()
        //                   .type(repoNotif.getType())
        //                   .uuid(repoNotif.getUuid())
        //                   .createdDate(repoNotif.getCreatedDate())
        //                   .message(repoNotif.getMessage())
        //                   .preview(repoNotif.getPreview())
        //                   .subject(repoNotif.getSubject())
        //                   .build());
        //             merged.add(userSN); // remains deleted; excluded from returned list but preserved in DB
        //         }
        //         // For USER and FPP_HEALTH: drop it completely
        //         continue;
        //     }

        //     // Keep, but update the master Notification details
        //     userSN.setNotification(NotificationModel.builder()
        //                   .type(repoNotif.getType())
        //                   .uuid(repoNotif.getUuid())
        //                   .createdDate(repoNotif.getCreatedDate())
        //                   .message(repoNotif.getMessage())
        //                   .preview(repoNotif.getPreview())
        //                   .subject(repoNotif.getSubject())
        //                   .build());
        //     // If marked read by user, keep it; otherwise leave as-is (default false)
        //     userSN.setRead(Boolean.TRUE.equals(userSN.getRead()));
        //     merged.add(userSN);
        // }

        // // Add any remaining user-only notifications (repo no longer has them)
        // for (ShowNotification leftover : userByUuid.values()) {
        //     if (leftover == null) continue;
        //     NotificationModel ln = leftover.getNotification();
        //     NotificationType lt = ln == null ? null : ln.getType();

        //     // If an ADMIN notification no longer exists in the repo,
        //     // delete it completely from the user's notifications (do not add to merged).
        //     if (lt == NotificationType.ADMIN) {
        //         continue;
        //     }

        //     // For USER and FPP_HEALTH: keep if not deleted
        //     if (!Boolean.TRUE.equals(leftover.getDeleted())) {
        //         merged.add(leftover);
        //     }
        // }

        // // Cleanup: age-out old FPP_HEALTH notifications and enforce deleted flag removal
        // LocalDateTime cutoff = LocalDateTime.now().minusDays(1);
        // merged.removeIf(sn -> {
        //     if (sn == null) return true; // drop null entries defensively
        //     NotificationModel n = sn.getNotification();
        //     NotificationType type = (n == null) ? null : n.getType();
        //     LocalDateTime created = (n == null) ? null : n.getCreatedDate();

        //     // Remove if user marked deleted: only for USER and FPP_HEALTH
        //     if (Boolean.TRUE.equals(sn.getDeleted())) {
        //         return type == NotificationType.USER || type == NotificationType.FPP_HEALTH;
        //     }

        //     // Remove stale health notifications
        //     return type == NotificationType.FPP_HEALTH && created != null && created.isBefore(cutoff);
        // });

        // // Persist merged state on user
        // existingShow.setShowNotifications(merged);
        // this.showRepository.save(existingShow);

        // // Return non-deleted sorted by createdDate desc (nulls last)
        // return merged.stream()
        //         .filter(sn -> sn != null && !Boolean.TRUE.equals(sn.getDeleted()))
        //         .sorted(Comparator.comparing(
        //                 (ShowNotification sn) -> Optional.ofNullable(sn.getNotification())
        //                         .map(NotificationModel::getCreatedDate)
        //                         .orElse(null),
        //                 Comparator.nullsLast(Comparator.reverseOrder())))
        //         .toList();
    }
}
