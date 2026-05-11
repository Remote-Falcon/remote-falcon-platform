package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

import java.time.LocalDateTime;
import java.util.List;

// Anonymous browser-local UUID (PRD A3) is captured on every event type
// alongside the IP. Always nullable: legacy events without it fall back
// to IP for "returning visitor" analysis.
@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Stat {
    private List<Jukebox> jukebox;
    private List<Voting> voting;
    private List<VotingWin> votingWin;
    private List<Page> page;
    // PRD V15 — request → play conversion. Logged when the viewer service
    // refuses an addSequenceToQueue call (queue full / already requested /
    // location check / blocked IP). Powers the conversion funnel on the
    // Sequences analytics tab and informs whether the queue depth limit
    // is calibrated correctly.
    private List<RejectedRequest> rejectedRequests;

    @Type
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Jukebox {
        private String name;
        private String viewerId;
        private LocalDateTime dateTime;
    }

    @Type
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Page {
        private String ip;
        private String viewerId;
        private LocalDateTime dateTime;
    }

    @Type
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Voting {
        private String name;
        private String viewerId;
        private LocalDateTime dateTime;
    }

    @Type
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class VotingWin {
        private String name;
        private Integer total;
        private LocalDateTime dateTime;
    }

    @Type
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RejectedRequest {
        private String name;
        private String viewerId;
        // Mirrors viewer-service StatusResponse names: QUEUE_FULL,
        // ALREADY_REQUESTED, INVALID_LOCATION, NAUGHTY (blocked IP).
        private String reason;
        private LocalDateTime dateTime;
    }
}
