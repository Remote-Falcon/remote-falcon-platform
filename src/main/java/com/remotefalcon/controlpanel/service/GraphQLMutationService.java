package com.remotefalcon.controlpanel.service;

import com.mailersend.sdk.MailerSendResponse;
import com.remotefalcon.controlpanel.repository.NotificationRepository;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.repository.WattsonRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ClientUtil;
import com.remotefalcon.controlpanel.util.EmailUtil;
import com.remotefalcon.controlpanel.util.RandomUtil;
import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.documents.Wattson;
import com.remotefalcon.library.enums.NotificationType;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.enums.ViewerControlMode;
import com.remotefalcon.library.models.*;
import lombok.RequiredArgsConstructor;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GraphQLMutationService {
    private final EmailUtil emailUtil;
    private final AuthUtil authUtil;
    private final ShowRepository showRepository;
    private final NotificationRepository notificationRepository;
    private final WattsonRepository wattsonRepository;
    private final ClientUtil clientUtil;

    @Value("${auto-validate-email}")
    Boolean autoValidateEmail;

    public Boolean signUp(String firstName, String lastName, String showName) {
        String showSubdomain = showName.replaceAll("\\s", "").toLowerCase();
        var request = this.authUtil.getCurrentRequest();
        String[] basicAuthCredentials = this.authUtil.getBasicAuthCredentials(request);
        String ipAddress = this.clientUtil.getClientIp(request);
        if (basicAuthCredentials != null) {
            String email = basicAuthCredentials[0];
            String password = basicAuthCredentials[1];
            if (this.showRepository.findByEmailCollation(email).isPresent()
                    || this.showRepository.findByShowSubdomain(showSubdomain).isPresent()) {
                throw new RuntimeException(StatusResponse.SHOW_EXISTS.name());
            }
            String showToken = this.validateShowToken(RandomUtil.generateToken(25));
            BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
            String hashedPassword = passwordEncoder.encode(password);

            Show newShow = this.createDefaultShowDocument(firstName, lastName, showName, email,
                    hashedPassword, showToken, showSubdomain, ipAddress);

            if(!autoValidateEmail) {
                MailerSendResponse emailResponse = this.emailUtil.sendSignUpEmail(newShow);
                if(emailResponse.responseStatusCode != 202) {
                    throw new RuntimeException(StatusResponse.EMAIL_CANNOT_BE_SENT.name());
                }
            }

            this.showRepository.save(newShow);
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    private Show createDefaultShowDocument(String firstName, String lastName, String showName,
                                           String email, String password, String showToken,
                                           String showSubdomain, String ipAddress) {
        String defaultPageHtml = Optional.ofNullable(this.fetchDefaultPageHtml()).orElse("");
        return Show.builder()
                .showToken(showToken)
                .email(email)
                .password(password)
                .showName(showName)
                .showSubdomain(showSubdomain)
                .userProfile(UserProfile.builder()
                        .firstName(firstName)
                        .lastName(lastName)
                        .facebookUrl(null)
                        .youtubeUrl(null)
                        .build())
                .emailVerified(this.autoValidateEmail)
                .createdDate(LocalDateTime.now())
                .lastLoginDate(LocalDateTime.now())
                .lastLoginIp(ipAddress)
                .expireDate(LocalDateTime.now().plusYears(2))
                .showRole(ShowRole.USER)
                .preferences(Preference.builder()
                        .viewerControlEnabled(false)
                        .viewerControlMode(ViewerControlMode.JUKEBOX)
                        .resetVotes(false)
                        .jukeboxDepth(0)
                        .showLatitude(0.0F)
                        .showLongitude(0.0F)
                        .allowedRadius(1.0F)
                        .checkIfVoted(false)
                        .checkIfRequested(false)
                        .psaEnabled(false)
                        .jukeboxRequestLimit(0)
                        .hideSequenceCount(0)
                        .makeItSnow(false)
                        .managePsa(false)
                        .sequencesPlayed(0)
                        .pageTitle(showName)
                        .build())
                .requests(new ArrayList<>())
                .stats(Stat.builder()
                        .jukebox(new ArrayList<>())
                        .page(new ArrayList<>())
                        .voting(new ArrayList<>())
                        .votingWin(new ArrayList<>())
                        .build())
                .pages(new ArrayList<>(Collections.singletonList(ViewerPage.builder()
                        .name("Default")
                        .active(true)
                        .html(defaultPageHtml)
                        .build())))
                .sequences(new ArrayList<>())
                .sequenceGroups(new ArrayList<>())
                .psaSequences(new ArrayList<>())
                .build();
    }

    private String fetchDefaultPageHtml() {
        try {
            RestTemplate restTemplate = new RestTemplate();
            return restTemplate.getForObject(
                    "https://raw.githubusercontent.com/Remote-Falcon/remote-falcon-page-templates/main/templates/the-og.html",
                    String.class);
        } catch (Exception ex) {
            return "";
        }
    }

    private String validateShowToken(String showToken) {
        Optional<Show> show = this.showRepository.findByShowToken(showToken);
        if(show.isEmpty()) {
            return showToken;
        }else {
            validateShowToken(RandomUtil.generateToken(25));
        }
        return null;
    }

    public Boolean forgotPassword(String email) {
        Optional<Show> show = this.showRepository.findByEmailCollation(email);
        if(show.isPresent()) {
            String passwordResetLink = RandomUtil.generateToken(25);
            show.get().setPasswordResetLink(passwordResetLink);
            show.get().setPasswordResetExpiry(LocalDateTime.now().plusDays(1));
            this.showRepository.save(show.get());
            MailerSendResponse response = this.emailUtil.sendForgotPasswordEmail(show.get(), passwordResetLink);
            if(response.responseStatusCode != 202) {
                throw new RuntimeException(StatusResponse.EMAIL_CANNOT_BE_SENT.name());
            }
            return true;
        }
        throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
    }

    public Boolean verifyEmail(String showToken) {
        Optional<Show> show = this.showRepository.findByShowToken(showToken);
        if(show.isPresent()) {
            show.get().setEmailVerified(true);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
    }

    public Boolean resetPassword() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isEmpty()) {
            throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
        }
        String updatedPassword = this.authUtil.getPasswordFromHeader(this.authUtil.getCurrentRequest());
        if (updatedPassword != null) {
            BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
            String hashedPassword = passwordEncoder.encode(updatedPassword);
            show.get().setPassword(hashedPassword);
            show.get().setPasswordResetLink(null);
            show.get().setPasswordResetExpiry(null);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
    }

    public Boolean updatePassword() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            var request = this.authUtil.getCurrentRequest();
            String password = this.authUtil.getPasswordFromHeader(request);
            String updatedPassword = this.authUtil.getUpdatedPasswordFromHeader(request);
            if (updatedPassword != null) {
                BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
                boolean passwordsMatch = passwordEncoder.matches(password, show.get().getPassword());
                if(passwordsMatch) {
                    String hashedPassword = passwordEncoder.encode(updatedPassword);
                    show.get().setPassword(hashedPassword);
                    this.showRepository.save(show.get());
                    return true;
                }else {
                    throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
                }
            }
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean updateUserProfile(UserProfile userProfile) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().setUserProfile(userProfile);
            if(show.get().getUserProfile().getExpoPushToken() != null) {
                userProfile.setExpoPushToken(show.get().getUserProfile().getExpoPushToken());
            }
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean updateExpoPushToken(String expoPushToken) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().getUserProfile().setExpoPushToken(expoPushToken);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean requestApiAccess() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            if(show.get().getApiAccess() == null) {
                show.get().setApiAccess(ApiAccess.builder()
                        .apiAccessActive(false)
                        .build());
            }
            if(show.get().getApiAccess().getApiAccessActive()) {
                throw new RuntimeException(StatusResponse.API_ACCESS_REQUESTED.name());
            }
            String accessToken = RandomUtil.generateToken(20);
            String secretKey = RandomUtil.generateToken(20);
            show.get().getApiAccess().setApiAccessActive(true);
            show.get().getApiAccess().setApiAccessToken(accessToken);
            show.get().getApiAccess().setApiAccessSecret(secretKey);
            this.showRepository.save(show.get());
            MailerSendResponse response = this.emailUtil.sendRequestApiAccessEmail(show.get(), accessToken, secretKey);
            if(response.responseStatusCode != 202) {
                show.get().getApiAccess().setApiAccessActive(true);
                show.get().getApiAccess().setApiAccessToken(accessToken);
                show.get().getApiAccess().setApiAccessSecret(secretKey);
                this.showRepository.save(show.get());
                throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
            }
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean deleteAccount() {
        this.showRepository.deleteByShowToken(authUtil.getTokenDTO().getShowToken());
        return true;
    }

    public Boolean updateShow(String email, String showName) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            boolean changesMade = false;
            if(!StringUtils.equalsIgnoreCase(show.get().getEmail(), email)) {
                changesMade = true;
                show.get().setEmailVerified(false);
                show.get().setEmail(email);
                MailerSendResponse emailResponse = this.emailUtil.sendSignUpEmail(show.get());
                if(emailResponse.responseStatusCode != 202) {
                    show.get().setEmailVerified(true);
                    show.get().setEmail(show.get().getEmail());
                    throw new RuntimeException(StatusResponse.EMAIL_CANNOT_BE_SENT.name());
                }
            }
            if(!StringUtils.equalsIgnoreCase(show.get().getShowName(), showName)) {
                String showSubdomain = showName.replaceAll("\\s", "").toLowerCase();
                Optional<Show> showCheck = this.showRepository.findByShowSubdomain(showSubdomain);
                if(showCheck.isPresent()) {
                    throw new RuntimeException(StatusResponse.SHOW_EXISTS.name());
                }
                changesMade = true;
                show.get().setShowName(showName);
                show.get().setShowSubdomain(showSubdomain);
            }
            if(changesMade) {
                this.showRepository.save(show.get());
            }
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean updatePreferences(Preference preferences) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            if(preferences.getViewerControlEnabled() != show.get().getPreferences().getViewerControlEnabled()) {
                preferences.setSequencesPlayed(0);
            }
            show.get().setPreferences(preferences);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean updatePages(List<ViewerPage> pages) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().setPages(pages);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean updatePsaSequences(List<PsaSequence> psaSequences) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().setPsaSequences(psaSequences);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean updateSequences(List<Sequence> sequences) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            Set<Sequence> sequencesSet = new HashSet<>(sequences);
            show.get().setSequences(sequencesSet.stream().toList());
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean updateSequenceGroups(List<SequenceGroup> sequenceGroups) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().setSequenceGroups(sequenceGroups);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean playSequenceFromControlPanel(Sequence sequence) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            if(show.get().getPreferences().getViewerControlMode() == ViewerControlMode.JUKEBOX) {
                boolean hasOwnerRequest = show.get().getRequests().stream()
                        .anyMatch(Request::getOwnerRequested);
                if(hasOwnerRequest) {
                    throw new RuntimeException(StatusResponse.OWNER_REQUESTED.name());
                }
                show.get().getRequests().add(Request.builder()
                        .sequence(sequence)
                        .ownerRequested(true)
                        .position(0)
                        .build());
            }else {
                boolean hasOwnerVoted = show.get().getVotes().stream()
                        .anyMatch(Vote::getOwnerVoted);
                if(hasOwnerVoted) {
                    throw new RuntimeException(StatusResponse.OWNER_REQUESTED.name());
                }
                show.get().getVotes().add(Vote.builder()
                        .sequence(sequence)
                        .ownerVoted(true)
                        .lastVoteTime(LocalDateTime.now())
                        .votes(1000)
                        .build());
            }
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean deleteSingleRequest(Integer position) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            List<Request> updatedRequests = show.get().getRequests().stream()
                    .filter(request -> !Objects.equals(request.getPosition(), position))
                    .toList();
            int requestPosition = 1;
            for(Request request : updatedRequests) {
                request.setPosition(requestPosition);
                requestPosition++;
            }
            if(CollectionUtils.isEmpty(updatedRequests)) {
                show.get().setPlayingNext("");
            }else {
                show.get().setPlayingNext(updatedRequests.get(0).getSequence().getDisplayName());
            }
            show.get().setRequests(updatedRequests);
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean deleteNowPlaying() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().setPlayingNow("");
            show.get().setPlayingNext("");
            show.get().setPlayingNextFromSchedule("");
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean purgeStats() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            this.purgeStatsForShow(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public void purgeStatsForShow(Show show) {
        if(show.getStats() == null) {
            return;
        }
        LocalDateTime purgeStatsDate = LocalDateTime.now().minusMonths(18);
        boolean changed = false;
        if(show.getStats().getPage() != null) {
            changed |= show.getStats().getPage().removeIf(stat -> stat.getDateTime().isBefore(purgeStatsDate));
        }
        if(show.getStats().getJukebox() != null) {
            changed |= show.getStats().getJukebox().removeIf(stat -> stat.getDateTime().isBefore(purgeStatsDate));
        }
        if(show.getStats().getVoting() != null) {
            changed |= show.getStats().getVoting().removeIf(stat -> stat.getDateTime().isBefore(purgeStatsDate));
        }
        if(show.getStats().getVotingWin() != null) {
            changed |= show.getStats().getVotingWin().removeIf(stat -> stat.getDateTime().isBefore(purgeStatsDate));
        }
        if(changed) {
            this.showRepository.save(show);
        }
    }

    public Boolean deleteStatsWithinRange(Long startDate, Long endDate, String timezone) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isEmpty()) {
            throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
        }

        ZonedDateTime startDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startDate), ZoneId.of(timezone));
        ZonedDateTime endDateAtZone = ZonedDateTime.ofInstant(Instant.ofEpochMilli(endDate), ZoneId.of(timezone));

        show.get().getStats().getPage().removeIf(stat -> stat.getDateTime().isAfter(startDateAtZone.toLocalDateTime()) && stat.getDateTime().isBefore(endDateAtZone.toLocalDateTime()));
        show.get().getStats().getJukebox().removeIf(stat -> stat.getDateTime().isAfter(startDateAtZone.toLocalDateTime()) && stat.getDateTime().isBefore(endDateAtZone.toLocalDateTime()));
        show.get().getStats().getVoting().removeIf(stat -> stat.getDateTime().isAfter(startDateAtZone.toLocalDateTime()) && stat.getDateTime().isBefore(endDateAtZone.toLocalDateTime()));
        show.get().getStats().getVotingWin().removeIf(stat -> stat.getDateTime().isAfter(startDateAtZone.toLocalDateTime()) && stat.getDateTime().isBefore(endDateAtZone.toLocalDateTime()));

        this.showRepository.save(show.get());
        return true;
    }

    public Boolean resetAllVotes() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().setVotes(new ArrayList<>());
            Set<Sequence> sequenceSet = show.get().getSequences().stream()
                    .peek(sequence -> sequence.setVisibilityCount(0)).collect(Collectors.toSet());
            show.get().setSequences(sequenceSet.stream().toList());
            show.get().setSequenceGroups(show.get().getSequenceGroups().stream()
                    .peek(sequenceGroup -> sequenceGroup.setVisibilityCount(0)).toList());
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean adminUpdateShow(Show show) {
        Optional<Show> optionalShow = this.showRepository.findByShowToken(show.getShowToken());
        if(optionalShow.isPresent()) {
            show.setId(optionalShow.get().getId());
            show.setPassword(optionalShow.get().getPassword());
            this.showRepository.save(show);
        }
        return true;
    }

    public Boolean deleteAllRequests() {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            show.get().setRequests(new ArrayList<>());
            Set<Sequence> sequenceSet = show.get().getSequences().stream()
                    .peek(sequence -> sequence.setVisibilityCount(0)).collect(Collectors.toSet());
            show.get().setSequences(sequenceSet.stream().toList());
            show.get().setSequenceGroups(show.get().getSequenceGroups().stream()
                    .peek(sequenceGroup -> sequenceGroup.setVisibilityCount(0)).toList());
            this.showRepository.save(show.get());
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean markNotificationsAsRead(List<String> uuids) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            Show existingShow = show.get();
            Optional.ofNullable(existingShow.getShowNotifications())
                    .orElse(Collections.emptyList())
                    .forEach(showNotification -> {
                if(uuids.contains(showNotification.getNotification().getUuid())) {
                    showNotification.setRead(true);
                }
            });
            this.showRepository.save(existingShow);
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean deleteNotificationForUser(String uuid) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isPresent()) {
            Show existingShow = show.get();
            Optional.ofNullable(existingShow.getShowNotifications())
                    .orElse(Collections.emptyList())
                    .forEach(showNotification -> {
                if (Objects.equals(showNotification.getNotification().getUuid(), uuid)) {
                    showNotification.setDeleted(true);
                }
            });
            this.showRepository.save(existingShow);
            return true;
        }
        throw new RuntimeException(StatusResponse.UNEXPECTED_ERROR.name());
    }

    public Boolean createNotification(Notification notification) {
        notification.setUuid(UUID.randomUUID().toString());
        notification.setCreatedDate(LocalDateTime.now());
        notification.setType(NotificationType.ADMIN);
        this.notificationRepository.save(notification);
        return true;
    }

    public Boolean createNotificationForUser(Notification notification, String subdomain) {
        Optional<Show> show = this.showRepository.findByShowSubdomain(subdomain);
        if(show.isEmpty()) {
            return false;
        }
        buildShowNotification(notification, show.get(), NotificationType.USER);
        this.showRepository.save(show.get());
        return true;
    }

    public void buildShowNotification(Notification notification, Show show, NotificationType notificationType) {
        notification.setUuid(UUID.randomUUID().toString());
        notification.setCreatedDate(LocalDateTime.now());
        notification.setType(notificationType);
        ShowNotification showNotification = ShowNotification.builder()
                .notification(NotificationModel.builder()
                          .type(notification.getType())
                          .uuid(notification.getUuid())
                          .createdDate(notification.getCreatedDate())
                          .message(notification.getMessage())
                          .preview(notification.getPreview())
                          .subject(notification.getSubject())
                          .build())
                .read(false)
                .deleted(false)
                .build();
        if(show.getShowNotifications() == null) {
            show.setShowNotifications(new ArrayList<>());
        }
        show.getShowNotifications().add(showNotification);
    }

    public Boolean deleteNotification(String uuid) {
        this.notificationRepository.deleteByUuid(uuid);
        return true;
    }

    public Boolean wattsonFeedback(String responseId, String feedback) {
        Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
        if(show.isEmpty()) {
            return false;
        }
        
        Wattson wattson = this.wattsonRepository.findByResponseId(responseId);
        if(wattson != null) {
            wattson.setFeedback(feedback);
        }else {
            wattson = Wattson.builder()
                .showSubdomain(show.get().getShowSubdomain())
                .responseId(responseId)
                .feedback(feedback)
                .build();
        }
        this.wattsonRepository.save(wattson);
        return true;
    }
}

