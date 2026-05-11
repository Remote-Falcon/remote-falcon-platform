package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDate;
import java.time.LocalDateTime;

// PRD A1 — viewer session history. One entry per (visitor, distinct
// dwell-window). Visitors are matched on viewerId (preferred) or IP
// (fallback for pre-A3 events / cleared localStorage).
//
// "Same dwell session" = events from the same identifier within 5 minutes
// of the last event. Crossing that threshold opens a new session entry.
//
// Persisted on Show.viewerSessions[]. Trimmed on the same 18-month purge
// cycle that handles raw stats.
@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ViewerSession {
    private String ip;
    private String viewerId;
    // Local date in show timezone — snapshotted at session-creation time
    // so cross-night queries don't have to re-resolve every event.
    private LocalDate nightDate;
    private LocalDateTime firstSeen;
    private LocalDateTime lastSeen;
    private Integer eventCount;
}
