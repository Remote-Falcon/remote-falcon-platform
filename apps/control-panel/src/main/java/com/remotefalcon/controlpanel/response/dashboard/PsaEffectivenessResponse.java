package com.remotefalcon.controlpanel.response.dashboard;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

// V16 — PSA effectiveness panel for the Sequences analytics tab.
//
// We only have `lastPlayed` per PSA (the system overwrites in place rather
// than logging history), so each PsaPlay record describes only the MOST
// RECENT play of that PSA — which is the most actionable sample anyway:
// "When was the most recent run, and what happened around it?"
//
// Viewers/requests are counted in a ±5-minute window around the lastPlayed
// timestamp (chosen to be wide enough to catch the lead-up and tail, narrow
// enough not to bleed into other PSA plays).
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class PsaEffectivenessResponse {
    private List<PsaPlay> psaPlays;

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class PsaPlay {
        private String name;
        private Long lastPlayedMs;            // null if never played
        private Integer viewersAround;         // unique IPs within ±5min of lastPlayed
        private Integer requestsBefore;        // jukebox events 5min before lastPlayed
        private Integer requestsAfter;         // jukebox events 5min after lastPlayed
    }
}
