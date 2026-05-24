package com.remotefalcon.controlpanel.util;

import com.remotefalcon.controlpanel.response.dashboard.DashboardStatsResponse;
import com.remotefalcon.controlpanel.response.dashboard.DashboardStatsResponse.SequenceStat;
import com.remotefalcon.controlpanel.response.dashboard.DashboardStatsResponse.Stat;
import com.remotefalcon.library.models.Sequence;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ExcelUtil} — the CSV builder used by the
 * "download stats" and "download sequences" features. Pure-logic
 * coverage (string concat, date formatting, escape rules); no Spring
 * context, no I/O. Pins the CSV header schema and the per-section
 * structure so a downstream consumer relying on column order doesn't
 * silently break.
 */
class ExcelUtilTest {

    private final ExcelUtil excelUtil = new ExcelUtil();

    private static long epochMillis(int y, int m, int d, String tz) {
        return ZonedDateTime.of(LocalDate.of(y, m, d).atStartOfDay(), ZoneId.of(tz))
                .toInstant().toEpochMilli();
    }

    private static String body(ResponseEntity<ByteArrayResource> r) {
        return new String(r.getBody().getByteArray(), StandardCharsets.UTF_8);
    }

    // ---- generateDashboardExcel ----

    @Test
    void generateDashboardExcel_emitsAllEightSectionHeaders_inFixedOrder() {
        DashboardStatsResponse dash = DashboardStatsResponse.builder()
                .page(List.of())
                .jukeboxByDate(List.of())
                .jukeboxBySequence(Stat.builder().sequences(List.of()).build())
                .votingByDate(List.of())
                .votingBySequence(Stat.builder().sequences(List.of()).build())
                .votingWinByDate(List.of())
                .votingWinBySequence(Stat.builder().sequences(List.of()).build())
                .build();

        String csv = body(excelUtil.generateDashboardExcel(dash, "America/Chicago"));

        // Each section header in the documented order.
        int u = csv.indexOf("Unique Page Visits by Date");
        int t = csv.indexOf("Total Page Visits by Date");
        int rd = csv.indexOf("Sequence Requests by Date");
        int rs = csv.indexOf("Sequence Requests by Sequence");
        int vd = csv.indexOf("Sequence Votes by Date");
        int vs = csv.indexOf("Sequence Votes by Sequence");
        int wd = csv.indexOf("Sequence Wins by Date");
        int ws = csv.indexOf("Sequence Wins by Sequence");

        assertThat(u).isGreaterThanOrEqualTo(0);
        assertThat(t).isGreaterThan(u);
        assertThat(rd).isGreaterThan(t);
        assertThat(rs).isGreaterThan(rd);
        assertThat(vd).isGreaterThan(rs);
        assertThat(vs).isGreaterThan(vd);
        assertThat(wd).isGreaterThan(vs);
        assertThat(ws).isGreaterThan(wd);
    }

    @Test
    void generateDashboardExcel_setsContentDispositionAndCsvMediaType() {
        DashboardStatsResponse dash = DashboardStatsResponse.builder()
                .page(List.of())
                .jukeboxByDate(List.of())
                .jukeboxBySequence(Stat.builder().sequences(List.of()).build())
                .votingByDate(List.of())
                .votingBySequence(Stat.builder().sequences(List.of()).build())
                .votingWinByDate(List.of())
                .votingWinBySequence(Stat.builder().sequences(List.of()).build())
                .build();

        ResponseEntity<ByteArrayResource> resp = excelUtil.generateDashboardExcel(dash, "America/Chicago");

        assertThat(resp.getStatusCodeValue()).isEqualTo(200);
        assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
                .isEqualTo("attachment; filename=stats.csv");
        assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.parseMediaType("text/csv"));
        assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_LENGTH))
                .isEqualTo(String.valueOf(resp.getBody().getByteArray().length));
    }

    @Test
    void generateDashboardExcel_includesPageStatsAndFormatsDateAsLocalDate() {
        long oct31 = epochMillis(2025, 10, 31, "America/Chicago");
        Stat page = Stat.builder()
                .date(oct31)
                .total(9)
                .unique(7)
                .viewerIps(Set.of("1.1.1.1", "2.2.2.2"))
                .build();
        DashboardStatsResponse dash = DashboardStatsResponse.builder()
                .page(List.of(page))
                .jukeboxByDate(List.of())
                .jukeboxBySequence(Stat.builder().sequences(List.of()).build())
                .votingByDate(List.of())
                .votingBySequence(Stat.builder().sequences(List.of()).build())
                .votingWinByDate(List.of())
                .votingWinBySequence(Stat.builder().sequences(List.of()).build())
                .build();

        String csv = body(excelUtil.generateDashboardExcel(dash, "America/Chicago"));

        assertThat(csv).contains("\"2025-10-31\"");
        assertThat(csv).contains("\"7\"");
        // IPs may appear in either order due to Set iteration; assert each.
        assertThat(csv).contains("1.1.1.1").contains("2.2.2.2").contains(" | ");
    }

    @Test
    void generateDashboardExcel_nullTimezone_fallsBackToAmericaChicago() {
        long oct31 = epochMillis(2025, 10, 31, "America/Chicago");
        Stat page = Stat.builder().date(oct31).total(1).unique(1).viewerIps(Set.of("1.1.1.1")).build();
        DashboardStatsResponse dash = DashboardStatsResponse.builder()
                .page(List.of(page))
                .jukeboxByDate(List.of())
                .jukeboxBySequence(Stat.builder().sequences(List.of()).build())
                .votingByDate(List.of())
                .votingBySequence(Stat.builder().sequences(List.of()).build())
                .votingWinByDate(List.of())
                .votingWinBySequence(Stat.builder().sequences(List.of()).build())
                .build();

        String csv = body(excelUtil.generateDashboardExcel(dash, null));
        assertThat(csv).contains("\"2025-10-31\"");
    }

    @Test
    void generateDashboardExcel_includesSequenceRowsWithPipeSeparator() {
        long when = epochMillis(2025, 11, 1, "America/Chicago");
        Stat req = Stat.builder()
                .date(when)
                .total(5)
                .sequences(List.of(
                        SequenceStat.builder().name("Carol of the Bells").total(3).build(),
                        SequenceStat.builder().name("Wizards in Winter").total(2).build()))
                .build();
        DashboardStatsResponse dash = DashboardStatsResponse.builder()
                .page(List.of())
                .jukeboxByDate(List.of(req))
                .jukeboxBySequence(Stat.builder().sequences(List.of(
                        SequenceStat.builder().name("Carol of the Bells").total(3).build())).build())
                .votingByDate(List.of())
                .votingBySequence(Stat.builder().sequences(List.of()).build())
                .votingWinByDate(List.of())
                .votingWinBySequence(Stat.builder().sequences(List.of()).build())
                .build();

        String csv = body(excelUtil.generateDashboardExcel(dash, "America/Chicago"));

        assertThat(csv).contains("Carol of the Bells: 3");
        assertThat(csv).contains("Wizards in Winter: 2");
        assertThat(csv).contains(" | "); // separator between two sequences
    }

    // ---- generateSequencesExcel ----

    @Test
    void generateSequencesExcel_returns204_whenSequencesNullOrEmpty() {
        assertThat(excelUtil.generateSequencesExcel(null).getStatusCodeValue()).isEqualTo(204);
        assertThat(excelUtil.generateSequencesExcel(Collections.emptyList()).getStatusCodeValue()).isEqualTo(204);
    }

    @Test
    void generateSequencesExcel_writesExpectedHeaderRow_andOnePerSequence() {
        List<Sequence> seqs = new ArrayList<>(List.of(
                Sequence.builder().name("alpha").displayName("Alpha").artist("A").group("g").imageUrl("u1").category("c").build(),
                Sequence.builder().name("beta").displayName("Beta").artist("B").group("g").imageUrl("u2").category("c").build()));

        ResponseEntity<ByteArrayResource> resp = excelUtil.generateSequencesExcel(seqs);

        assertThat(resp.getStatusCodeValue()).isEqualTo(200);
        assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
                .isEqualTo("attachment; filename=sequences.csv");

        String csv = body(resp);
        String[] lines = csv.split("\n");
        // header + 2 rows
        assertThat(lines).hasSize(3);
        assertThat(lines[0]).isEqualTo(String.join(",", ExcelUtil.SEQUENCE_CSV_HEADERS));
    }

    @Test
    void generateSequencesExcel_sortsByNameCaseInsensitively() {
        List<Sequence> seqs = new ArrayList<>(List.of(
                Sequence.builder().name("Beta").build(),
                Sequence.builder().name("alpha").build(),
                Sequence.builder().name("gamma").build()));

        String csv = body(excelUtil.generateSequencesExcel(seqs));

        int aIdx = csv.indexOf("\"alpha\"");
        int bIdx = csv.indexOf("\"Beta\"");
        int gIdx = csv.indexOf("\"gamma\"");
        assertThat(aIdx).isLessThan(bIdx);
        assertThat(bIdx).isLessThan(gIdx);
    }

    @Test
    void generateSequencesExcel_sortsNullNamesToTheEnd() {
        List<Sequence> seqs = new ArrayList<>(List.of(
                Sequence.builder().name(null).displayName("Null One").build(),
                Sequence.builder().name("alpha").displayName("Alpha").build(),
                Sequence.builder().name(null).displayName("Null Two").build()));

        String csv = body(excelUtil.generateSequencesExcel(seqs));
        String[] lines = csv.split("\n");
        // header + 3 rows; "alpha" should be the first data row.
        assertThat(lines[1]).contains("\"alpha\"");
    }

    @Test
    void generateSequencesExcel_escapesQuotesByDoubling() {
        List<Sequence> seqs = new ArrayList<>(List.of(
                Sequence.builder().name("name").displayName("with \"quote\" inside").build()));

        String csv = body(excelUtil.generateSequencesExcel(seqs));
        // RFC4180 — inner quotes become "" and the whole value is wrapped in "..."
        assertThat(csv).contains("\"with \"\"quote\"\" inside\"");
    }

    @Test
    void generateSequencesExcel_nullFieldsRenderAsEmptyQuotedString() {
        List<Sequence> seqs = new ArrayList<>(List.of(
                Sequence.builder()
                        .name("named")
                        .displayName(null).artist(null).group(null).imageUrl(null).category(null)
                        .build()));

        String csv = body(excelUtil.generateSequencesExcel(seqs));
        // 5 null fields after the name -> 5 empty quoted columns
        assertThat(csv).contains("\"named\",\"\",\"\",\"\",\"\",\"\"");
    }
}
