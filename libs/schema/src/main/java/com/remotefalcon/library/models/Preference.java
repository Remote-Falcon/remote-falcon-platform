package com.remotefalcon.library.models;

import com.remotefalcon.library.enums.LocationCheckMethod;
import com.remotefalcon.library.enums.ViewerControlMode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.util.Set;

@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Preference {
    private Boolean viewerControlEnabled;
    private Boolean viewerPageViewOnly;
    private ViewerControlMode viewerControlMode;
    private Boolean resetVotes;
    private Integer jukeboxDepth;
    private LocationCheckMethod locationCheckMethod;
    private Float showLatitude;
    private Float showLongitude;
    private Float allowedRadius;
    private Boolean checkIfVoted;
    private Boolean checkIfRequested;
    private Boolean psaEnabled;
    private Integer psaFrequency;
    private Integer jukeboxRequestLimit;
    private Integer locationCode;
    private Integer hideSequenceCount;
    private Boolean makeItSnow;
    private Boolean managePsa;
    // PSA-v2 Q4 — when true, the cadence-tick PSA injection bursts ALL enabled
    // PSAs in `order` ascending instead of picking one round-robin. Default
    // false preserves the existing single-PSA-per-tick behavior on first deploy.
    private Boolean playAllPsas;
    private Integer sequencesPlayed;
    private String pageTitle;
    private String pageIconUrl;
    private Boolean showOnMap;
    private String selfHostedRedirectUrl;
    private Set<String> blockedViewerIps;
    private NotificationPreference notificationPreferences;
    // PRD Phase 1 — beta opt-in for the experimental analytics views
    // (Audience tab Concurrent/Dwell/Returning/Regulars + future P2 work).
    // Defaults to false; owners flip it from Account Settings → Notifications.
    private Boolean analyticsBetaOptIn;
    // Security — opt-in flag that gates the public `wrappedSummary` query.
    // Defaults to false (treated as null == false at the resolver).
    private Boolean wrappedPublic;

    // Capability-URL share token for the public Wrapped page. Generated
    // server-side on the transition wrappedPublic=null/false → true; the
    // public URL becomes /wrapped/<token> and the token IS the credential
    // — no other auth required. Subdomain enumeration can't reach Wrapped
    // data because tokens are CSPRNG-random URL-safe strings. Regenerating
    // (or clearing) revokes the share link.
    private String wrappedShareToken;
}
