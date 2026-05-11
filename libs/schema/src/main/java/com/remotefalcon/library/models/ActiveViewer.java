package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDateTime;

@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ActiveViewer {
    private String ipAddress;
    // Anonymous browser-local UUID (PRD A3). Generated client-side in the
    // viewer page's localStorage and passed on every mutation. Nullable
    // for legacy events that pre-date the viewer-id rollout.
    private String viewerId;
    private LocalDateTime visitDateTime;
}
