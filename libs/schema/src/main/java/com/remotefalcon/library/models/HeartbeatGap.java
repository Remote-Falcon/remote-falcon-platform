package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDateTime;

// PRD V17 — a window during which the FPP plugin was not heartbeating. The
// plugin sends a heartbeat every ~30s; if the gap between consecutive
// writes exceeds 5 minutes, we log a HeartbeatGap covering the lapse.
//
// Persisted on Show.heartbeatGaps[]. The plugins-api writer prunes anything
// older than 30 days on each successful heartbeat to keep the list tight.
@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HeartbeatGap {
    private LocalDateTime startedAt;
    private LocalDateTime endedAt;
}
