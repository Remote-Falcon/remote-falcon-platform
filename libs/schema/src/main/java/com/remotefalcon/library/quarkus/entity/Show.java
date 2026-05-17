package com.remotefalcon.library.quarkus.entity;

import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.models.*;
import io.quarkus.mongodb.panache.common.MongoEntity;
import lombok.*;
import io.quarkus.mongodb.panache.PanacheMongoEntity;
import org.bson.codecs.pojo.annotations.BsonIgnore;
import org.eclipse.microprofile.graphql.Description;
import org.eclipse.microprofile.graphql.Ignore;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@EqualsAndHashCode(callSuper = true)
@Type
@Description("Top level Show details")
@MongoEntity(collection = "show")
@NoArgsConstructor
@AllArgsConstructor
public class Show extends PanacheMongoEntity {
    private String showToken;
    private String email;
    @Ignore
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
    // PRD A1 — viewer session history (see ViewerSession + Show.java).
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

    @BsonIgnore
    private String serviceToken;
}
