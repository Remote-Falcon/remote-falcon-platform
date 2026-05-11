package com.remotefalcon.controlpanel.response.dashboard;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// PRD A1 view-model for control-panel consumption. Returns viewer
// sessions in the requested date range, scoped to the authenticated show.
//
// Each Session: a single dwell window (firstSeen → lastSeen) for a single
// visitor, identified by viewerId (preferred) or IP (fallback).
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ViewerSessionsResponse {
    private List<Session> sessions;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Session {
        private String viewerId;       // null for legacy / cleared-storage events
        private String ipHash;         // SHA-256 of IP, never raw IP
        private Long nightDate;        // epoch-millis at midnight in show-tz
        private Long firstSeen;        // epoch-millis
        private Long lastSeen;         // epoch-millis
        private Integer eventCount;
        private Long durationSeconds;  // lastSeen - firstSeen, in seconds
    }
}
