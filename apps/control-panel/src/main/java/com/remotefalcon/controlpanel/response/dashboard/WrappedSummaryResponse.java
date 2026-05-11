package com.remotefalcon.controlpanel.response.dashboard;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// PRD V21 — End-of-Season Wrapped public summary.
//
// Pre-aggregated card-stack stats for a single show + season window.
// PUBLIC endpoint (no auth required) — returns only these high-level
// rolled-up numbers, never raw stats / IPs / sequences. Powered by the
// existing dashboard data plus session-derived dwell stats.
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WrappedSummaryResponse {
    private String showName;
    private String season;             // e.g. "christmas", "halloween"
    private Integer year;
    private Long startDate;            // epoch-millis at season start, in show timezone
    private Long endDate;              // epoch-millis at season end, in show timezone
    private Boolean seasonComplete;    // false → frontend shows "Wrapped opens after season ends"

    // Headline stats (cards)
    private Integer activeNights;             // count of nights with any viewer activity
    private Integer uniqueViewers;            // distinct identityKey across the season
    private Integer totalPageHits;
    private Long medianDwellSeconds;          // median session duration
    private Long longestDwellSeconds;         // longest single session
    private Integer mostLoyalRegularNights;   // max nights-attended across all viewers
    private Integer regularsCount;            // viewers with >= 2 night attendance

    private String topRequestedSequence;
    private Integer topRequestedCount;
    private Long topRequestedTotalPlaySeconds; // request count × sequence duration

    private String topVotedSequence;
    private Integer topVotedCount;

    private Long peakNightDate;               // epoch-millis at midnight, show-tz
    private Integer peakNightViewers;
    private Integer peakHour;                 // 0-23
    private String peakDayOfWeek;             // e.g. "Saturday"
    private Integer peakDayOfWeekAvg;
}
