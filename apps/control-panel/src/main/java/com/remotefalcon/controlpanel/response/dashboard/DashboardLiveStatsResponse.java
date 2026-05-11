package com.remotefalcon.controlpanel.response.dashboard;

import lombok.Builder;
import lombok.Data;

@Builder
@Data
public class DashboardLiveStatsResponse {
    private Integer currentRequests;
    private Integer totalRequests;
    private Integer currentVotes;
    private Integer totalVotes;
    private String playingNow;
    private String playingNext;
    // V22 — feeds the floating "Right now" panel on the Analytics tab.
    // currentViewers = active viewers in the last 5 minutes (matches the
    // ActiveViewer 5-min freshness convention used in the viewer service).
    // medianDwellSecondsTonight = median of completed sessions started today
    // in the user's timezone. Returns null when there's no session data
    // yet — the frontend renders a soft "—" instead of "0 min".
    private Integer currentViewers;
    private Long medianDwellSecondsTonight;
    // V17 — FPP heartbeat health for the dashboard Health row.
    // lastHeartbeatMs: epoch millis of the most recent plugin heartbeat,
    //   or null if the plugin has never connected.
    // heartbeatGaps: rolling 30-day log of windows where heartbeats were
    //   absent for >5 minutes (drives the uptime strip).
    private Long lastHeartbeatMs;
    private java.util.List<HeartbeatGapDto> heartbeatGaps;
    // V18 — version-change history (last 365 days). Frontend uses this
    // to render "last upgraded N days ago" + a popover timeline under
    // the version chips on the Dashboard Health row.
    private java.util.List<VersionChangeDto> versionChanges;

    @lombok.Data
    @lombok.Builder
    @lombok.AllArgsConstructor
    @lombok.NoArgsConstructor
    public static class HeartbeatGapDto {
        private Long startedAtMs;
        private Long endedAtMs;
    }

    @lombok.Data
    @lombok.Builder
    @lombok.AllArgsConstructor
    @lombok.NoArgsConstructor
    public static class VersionChangeDto {
        private Long atMs;
        private String pluginVersion;
        private String fppVersion;
    }
}
