package com.remotefalcon.controlpanel.response.dashboard;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

// V15 — request → play conversion funnel for the Sequences analytics tab.
//
// "Played" we don't actually have an event for (the system logs accepted
// requests, not completed playback), so the funnel is two-step:
//   attempted → accepted (queued)
// with the rejection breakdown answering "where did the dropped attempts go?"
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class RequestConversionResponse {
    private Integer attempted;
    private Integer accepted;
    private Integer rejected;
    private Double conversionRate;       // 0.0 – 1.0; null when attempted=0
    private List<RejectionBucket> rejectionsByReason;

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class RejectionBucket {
        private String reason;            // e.g. QUEUE_FULL, ALREADY_REQUESTED
        private Integer count;
    }
}
