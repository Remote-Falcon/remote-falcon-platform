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
// document and nested model in libs/schema (Notification, Preference,
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
    // PRD A1 — viewer session history. Maintained by the viewer service on
    // every page-stat / active-viewer write via 5-min dwell-window upsert.
    // Powers dwell-time, returning-visitor, and "regulars" analytics.
    private List<ViewerSession> viewerSessions;
    private String playingNow;
    private String playingNext;
    private String playingNextFromSchedule;
    private Sequence playingNowSequence;
    private Sequence playingNextSequence;
    private LocalDateTime lastFppHeartbeat;
    // PRD V17 — rolling 30-day log of windows where heartbeats were absent
    // for >5 minutes. Maintained by plugins-api on each fppHeartbeat write
    // (gap detection + prune-older-than-30-days in the same call).
    private List<HeartbeatGap> heartbeatGaps;
    // PRD V18 — rolling 365-day log of plugin/FPP version transitions.
    // Maintained by plugins-api on every pluginVersion call when the
    // reported version differs from the current stored value.
    private List<VersionChange> versionChanges;

    private List<ShowNotification> showNotifications;

    // PSA-v2 Q6 — optional leader sequence played immediately before a
    // viewer-requested song (jukebox mode). Null/empty = no leader.
    private String requestLeaderSequence;
    // PSA-v2 Q6 — optional leader sequence played immediately before a
    // vote-winner song (voting mode). Null/empty = no leader.
    private String voteLeaderSequence;
    // PSA-v2 Q7 — operator-picked next PSA, fires once at the next sequence
    // boundary (out-of-band from cadence) and then clears. Null = no override.
    private String nextPsaOverride;

    @JsonIgnore
    private String serviceToken;
}
