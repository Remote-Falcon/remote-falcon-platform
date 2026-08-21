package com.remotefalcon.controlpanel.util;

import com.remotefalcon.controlpanel.response.dashboard.DashboardStatsResponse;
import com.remotefalcon.library.models.Sequence;

 
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
public class ExcelUtil {
  public static final List<String> SEQUENCE_CSV_HEADERS = List.of(
      "name",
      "displayName",
      "artist",
      "group",
      "imageUrl",
      "category");

  public ResponseEntity<ByteArrayResource> generateDashboardExcel(DashboardStatsResponse dashboardStats,
      String timezone) {
    StringBuilder csvBuilder = new StringBuilder();

    this.appendUniquePageVisitsByDate(csvBuilder, dashboardStats, timezone);
    this.appendTotalPageVisitsByDate(csvBuilder, dashboardStats, timezone);
    this.appendSequenceRequestsByDate(csvBuilder, dashboardStats, timezone);
    this.appendSequenceRequestsBySequence(csvBuilder, dashboardStats);
    this.appendSequenceVotesByDate(csvBuilder, dashboardStats, timezone);
    this.appendSequenceVotesBySequence(csvBuilder, dashboardStats);
    this.appendSequenceWinsByDate(csvBuilder, dashboardStats, timezone);
    this.appendSequenceWinsBySequence(csvBuilder, dashboardStats);

    byte[] csvBytes = csvBuilder.toString().getBytes(StandardCharsets.UTF_8);
    ByteArrayResource resource = new ByteArrayResource(csvBytes);
    HttpHeaders httpHeaders = new HttpHeaders();
    httpHeaders.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=stats.csv");
    httpHeaders.add(HttpHeaders.CONTENT_LENGTH, String.valueOf(csvBytes.length));
    return ResponseEntity.ok().headers(httpHeaders)
        .contentType(MediaType.parseMediaType("text/csv"))
        .body(resource);
  }

  private void appendUniquePageVisitsByDate(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats,
      String timezone) {
    appendSectionHeader(csvBuilder, "Unique Page Visits by Date");
    appendRow(csvBuilder, List.of("Date", "Unique Visits", "Viewer IPs"));
    dashboardStats.getPage().forEach(visit -> {
      String viewerIps = String.join(" | ", visit.getViewerIps());
      appendRow(csvBuilder, List.of(
          formatDateColumn(visit.getDate(), timezone),
          visit.getUnique(),
          viewerIps));
    });
  }

  private void appendTotalPageVisitsByDate(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats,
      String timezone) {
    appendSectionHeader(csvBuilder, "Total Page Visits by Date");
    appendRow(csvBuilder, List.of("Date", "Total Visits"));
    dashboardStats.getPage().forEach(visit -> appendRow(csvBuilder, List.of(
        formatDateColumn(visit.getDate(), timezone),
        visit.getTotal())));
  }

  private void appendSequenceRequestsByDate(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats,
      String timezone) {
    appendSectionHeader(csvBuilder, "Sequence Requests by Date");
    appendRow(csvBuilder, List.of("Date", "Sequence Requests", "Total Requests"));
    dashboardStats.getJukeboxByDate().forEach(request -> {
      StringBuilder sequenceRequests = new StringBuilder();
      int sequenceRequestIndex = 1;
      for (DashboardStatsResponse.SequenceStat sequenceRequest : request.getSequences()) {
        sequenceRequests.append(String.format("%s: %s", sequenceRequest.getName(), sequenceRequest.getTotal()));
        if (request.getSequences().size() > sequenceRequestIndex) {
          sequenceRequests.append(" | ");
        }
        sequenceRequestIndex++;
      }
      appendRow(csvBuilder, List.of(
          formatDateColumn(request.getDate(), timezone),
          sequenceRequests.toString(),
          request.getTotal()));
    });
  }

  private void appendSequenceRequestsBySequence(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats) {
    appendSectionHeader(csvBuilder, "Sequence Requests by Sequence");
    appendRow(csvBuilder, List.of("Sequence Name", "Total Requests"));
    dashboardStats.getJukeboxBySequence().getSequences().forEach(sequence -> appendRow(csvBuilder, List.of(
        sequence.getName(),
        sequence.getTotal())));
  }

  private void appendSequenceVotesByDate(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats,
      String timezone) {
    appendSectionHeader(csvBuilder, "Sequence Votes by Date");
    appendRow(csvBuilder, List.of("Date", "Sequence Votes", "Total Votes"));
    dashboardStats.getVotingByDate().forEach(vote -> {
      StringBuilder sequenceVotes = new StringBuilder();
      int sequenceVoteIndex = 1;
      for (DashboardStatsResponse.SequenceStat sequenceVote : vote.getSequences()) {
        sequenceVotes.append(String.format("%s: %s", sequenceVote.getName(), sequenceVote.getTotal()));
        if (vote.getSequences().size() > sequenceVoteIndex) {
          sequenceVotes.append(" | ");
        }
        sequenceVoteIndex++;
      }
      appendRow(csvBuilder, List.of(
          formatDateColumn(vote.getDate(), timezone),
          sequenceVotes.toString(),
          vote.getTotal()));
    });
  }

  private void appendSequenceVotesBySequence(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats) {
    appendSectionHeader(csvBuilder, "Sequence Votes by Sequence");
    appendRow(csvBuilder, List.of("Sequence Name", "Total Votes"));
    dashboardStats.getVotingBySequence().getSequences().forEach(sequence -> appendRow(csvBuilder, List.of(
        sequence.getName(),
        sequence.getTotal())));
  }

  private void appendSequenceWinsByDate(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats,
      String timezone) {
    appendSectionHeader(csvBuilder, "Sequence Wins by Date");
    appendRow(csvBuilder, List.of("Date", "Sequence Wins", "Total Wins"));
    dashboardStats.getVotingWinByDate().forEach(win -> {
      StringBuilder sequenceWins = new StringBuilder();
      int sequenceWinIndex = 1;
      for (DashboardStatsResponse.SequenceStat sequenceWin : win.getSequences()) {
        sequenceWins.append(String.format("%s: %s", sequenceWin.getName(), sequenceWin.getTotal()));
        if (win.getSequences().size() > sequenceWinIndex) {
          sequenceWins.append(" | ");
        }
        sequenceWinIndex++;
      }
      appendRow(csvBuilder, List.of(
          formatDateColumn(win.getDate(), timezone),
          sequenceWins.toString(),
          win.getTotal()));
    });
  }

  private void appendSequenceWinsBySequence(StringBuilder csvBuilder, DashboardStatsResponse dashboardStats) {
    appendSectionHeader(csvBuilder, "Sequence Wins by Sequence");
    appendRow(csvBuilder, List.of("Sequence Name", "Total Wins"));
    dashboardStats.getVotingWinBySequence().getSequences().forEach(sequence -> appendRow(csvBuilder, List.of(
        sequence.getName(),
        sequence.getTotal())));
  }

  private void appendSectionHeader(StringBuilder csvBuilder, String header) {
    if (csvBuilder.length() > 0) {
      csvBuilder.append("\n");
    }
    csvBuilder.append(header).append("\n");
  }

  private void appendRow(StringBuilder csvBuilder, List<Object> values) {
    List<String> escapedValues = values.stream()
        .map(this::escapeCsvValue)
        .toList();
    csvBuilder.append(String.join(",", escapedValues)).append("\n");
  }

  private String formatDateColumn(Long date, String timezone) {
    return ZonedDateTime
        .ofInstant(Instant.ofEpochMilli(date), ZoneId.of(timezone == null ? "America/Chicago" : timezone))
        .format(DateTimeFormatter.ISO_LOCAL_DATE);
  }

  public ResponseEntity<ByteArrayResource> generateSequencesExcel(List<Sequence> sequences) {
    if (sequences == null || sequences.isEmpty()) {
      return ResponseEntity.status(204).build();
    }

    sequences.sort((s1, s2) -> {
      if (s1.getName() == null && s2.getName() == null) {
        return 0;
      } else if (s1.getName() == null) {
        return 1;
      } else if (s2.getName() == null) {
        return -1;
      } else {
        return s1.getName().compareToIgnoreCase(s2.getName());
      }
    });

    StringBuilder csvBuilder = new StringBuilder();
    csvBuilder.append(String.join(",", SEQUENCE_CSV_HEADERS)).append("\n");

    sequences.forEach(sequence -> csvBuilder.append(String.join(",",
        escapeCsvValue(sequence.getName()),
        escapeCsvValue(sequence.getDisplayName()),
        escapeCsvValue(sequence.getArtist()),
        escapeCsvValue(sequence.getGroup()),
        escapeCsvValue(sequence.getImageUrl()),
        escapeCsvValue(sequence.getCategory()))).append("\n"));

    byte[] csvBytes = csvBuilder.toString().getBytes(StandardCharsets.UTF_8);
    ByteArrayResource resource = new ByteArrayResource(csvBytes);
    HttpHeaders httpHeaders = new HttpHeaders();
    httpHeaders.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=sequences.csv");
    httpHeaders.add(HttpHeaders.CONTENT_LENGTH, String.valueOf(csvBytes.length));
    return ResponseEntity.ok()
        .headers(httpHeaders)
        .contentType(MediaType.parseMediaType("text/csv"))
        .body(resource);
  }

  private String escapeCsvValue(Object value) {
    if (value == null) {
      return "\"\"";
    }
    String stringValue = String.valueOf(value).replace("\"", "\"\"");
    return "\"" + stringValue + "\"";
  }
}
