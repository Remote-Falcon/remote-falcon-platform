package com.remotefalcon.library.documents;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.models.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
// @NoArgsConstructor + @AllArgsConstructor brought in line with every other
// document and nested model in libs/schema (Notification, Wattson, Preference,
// Sequence, etc all carry both). Without an explicit no-args constructor here
// Jackson cannot deserialize a Show from JSON -- Lombok's @Builder generates a
// package-private all-args constructor which suppresses @Data's no-args
// generation, and Spring Data Mongo's mapper trips over it on read. Caught by
// the Phase C PR B schema round-trip test.
@NoArgsConstructor
@AllArgsConstructor
@Document
public class Show {
    @Id
    private String id;
    private String showToken;
    private String email;
    private String password;
    private String showName;
    private String showSubdomain;
    private Boolean emailVerified;
    private LocalDateTime createdDate;
    private LocalDateTime lastLoginDate;
    private LocalDateTime expireDate;
    private String pluginVersion;
    private String fppVersion;
    private String lastLoginIp;
    private ShowRole showRole;
    private String passwordResetLink;
    private LocalDateTime passwordResetExpiry;

    private ApiAccess apiAccess;
    private UserProfile userProfile;
    private Preference preferences;
    private List<Sequence> sequences;
    private List<SequenceGroup> sequenceGroups;
    private List<PsaSequence> psaSequences;
    private List<ViewerPage> pages;
    private Stat stats;
    private List<Request> requests;
    private List<Vote> votes;
    private List<ActiveViewer> activeViewers;
    private String playingNow;
    private String playingNext;
    private String playingNextFromSchedule;
    private Sequence playingNowSequence;
    private Sequence playingNextSequence;
    private LocalDateTime lastFppHeartbeat;

    private List<ShowNotification> showNotifications;

    @JsonIgnore
    private String serviceToken;
}
