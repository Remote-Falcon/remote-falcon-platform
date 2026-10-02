package com.remotefalcon.controlpanel.response.dashboard;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Builder
@Data
public class DashboardStatsResponse {
  private List<Stat> page;
  private List<Stat> jukeboxByDate;
  private Stat jukeboxBySequence;
  private List<Stat> votingByDate;
  private Stat votingBySequence;
  private List<Stat> votingWinByDate;
  private Stat votingWinBySequence;
  // Issue #189: page views tagged utm_source=qr (the QR Code page's print
  // campaign toggle) within the selected range. Range-level, not a daily
  // sum: unique is distinct viewers across the whole range. The compare
  // badge fetches the prior range with a second dashboardStats call, the
  // same way the other hero tiles do.
  private SourceVisits qrVisits;
  // Issue #189: page views grouped by date + utm source/medium, for the CSV
  // export only (not in the GraphQL schema). Untagged visits have null
  // source and medium.
  private List<SourceStat> pageBySource;

  @Data
  @Builder
  public static class Stat {
    private Long date;
    private Integer total;
    private Integer unique;
    private List<SequenceStat> sequences;
  }

  @Data
  @Builder
  public static class SequenceStat {
    private String name;
    private Integer total;
  }

  @Data
  @Builder
  public static class SourceVisits {
    private Integer unique;
    private Integer total;
  }

  @Data
  @Builder
  public static class SourceStat {
    private Long date;
    private String source;
    private String medium;
    private Integer total;
    private Integer unique;
  }
}
