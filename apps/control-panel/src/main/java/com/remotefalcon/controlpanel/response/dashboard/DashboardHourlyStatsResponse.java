package com.remotefalcon.controlpanel.response.dashboard;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// Hourly viewer-engagement aggregation for the analytics page heatmap (V4)
// and active-hour distribution (V9). Returns a flat array of buckets so
// the client can pivot into a date × hour grid or sum into hour-of-night.
//
// Each Bucket: one (date, hour) pair with viewer counts.
//   date: epoch-millis at midnight in the show's timezone
//   hour: 0–23 in the show's timezone
//   total: total page-view events in that bucket
//   unique: distinct IPs in that bucket
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardHourlyStatsResponse {
    private List<Bucket> buckets;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Bucket {
        private Long date;
        private Integer hour;
        private Integer total;
        private Integer unique;
    }
}
