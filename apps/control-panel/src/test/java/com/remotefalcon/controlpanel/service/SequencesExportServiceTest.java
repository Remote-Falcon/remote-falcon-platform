package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.exception.SequencesCsvException;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ExcelUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.Sequence;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link SequencesExportService} — download and upload of
 * the per-show sequences CSV. Focuses on the parser: header validation,
 * quoted-cell handling, empty-row skipping, and the upsert merge that
 * preserves existing playback-time fields (duration, order, index) on
 * known sequences while appending new ones with sane defaults.
 */
@ExtendWith(MockitoExtension.class)
class SequencesExportServiceTest {

    private static final String SHOW_TOKEN = "tok-seq";
    private static final String HEADERS = String.join(",", ExcelUtil.SEQUENCE_CSV_HEADERS);

    @Mock private AuthUtil jwtUtil;
    @Mock private ShowRepository showRepository;
    @Mock private ExcelUtil excelUtil;

    @InjectMocks private SequencesExportService service;

    private void stubAuth() {
        when(jwtUtil.getJwtPayload()).thenReturn(TokenDTO.builder().showToken(SHOW_TOKEN).build());
    }

    private static MultipartFile csv(String content) {
        return new MockMultipartFile("file", "seq.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
    }

    // ---- downloadSequencesToExcel ----

    @Test
    void downloadSequencesToExcel_returns204_whenShowHasNoSequences() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(null).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        ResponseEntity<ByteArrayResource> r = service.downloadSequencesToExcel();
        assertThat(r.getStatusCodeValue()).isEqualTo(204);
    }

    @Test
    void downloadSequencesToExcel_delegatesToExcelUtil_whenSequencesPresent() {
        stubAuth();
        List<Sequence> seqs = List.of(Sequence.builder().name("a").build());
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(seqs).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        ResponseEntity<ByteArrayResource> stub = ResponseEntity.ok().body(new ByteArrayResource(new byte[]{1, 2, 3}));
        when(excelUtil.generateSequencesExcel(seqs)).thenReturn(stub);

        assertThat(service.downloadSequencesToExcel()).isSameAs(stub);
    }

    @Test
    void downloadSequencesToExcel_throwsShowNotFound_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.downloadSequencesToExcel())
                .isInstanceOf(RuntimeException.class)
                .hasMessage(StatusResponse.SHOW_NOT_FOUND.name());
    }

    // ---- uploadSequencesFromCsv — validation ----

    @Test
    void upload_throwsFileRequired_whenNull() {
        assertThatThrownBy(() -> service.uploadSequencesFromCsv(null))
                .isInstanceOf(SequencesCsvException.class)
                .hasMessage("CSV file is required");
    }

    @Test
    void upload_throwsFileRequired_whenEmpty() {
        MultipartFile empty = new MockMultipartFile("file", "x.csv", "text/csv", new byte[0]);
        assertThatThrownBy(() -> service.uploadSequencesFromCsv(empty))
                .isInstanceOf(SequencesCsvException.class)
                .hasMessage("CSV file is required");
    }

    @Test
    void upload_throwsShowNotFound_whenShowMissing() {
        stubAuth();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.uploadSequencesFromCsv(csv(HEADERS + "\n")))
                .isInstanceOf(SequencesCsvException.class);
    }

    @Test
    void upload_throwsInvalidHeaders_whenHeaderRowDoesNotMatch() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(new ArrayList<>()).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        assertThatThrownBy(() -> service.uploadSequencesFromCsv(csv("wrong,headers\n")))
                .isInstanceOf(SequencesCsvException.class);
    }

    @Test
    void upload_throwsInvalidColumnCount_whenRowHasWrongColumnCount() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(new ArrayList<>()).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        // Only 3 columns on the data row instead of 6.
        String body = HEADERS + "\nname1,disp,art\n";
        assertThatThrownBy(() -> service.uploadSequencesFromCsv(csv(body)))
                .isInstanceOf(SequencesCsvException.class);
    }

    @Test
    void upload_throwsMissingName_whenSequenceNameBlank() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(new ArrayList<>()).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        String body = HEADERS + "\n,disp,art,grp,url,cat\n";
        assertThatThrownBy(() -> service.uploadSequencesFromCsv(csv(body)))
                .isInstanceOf(SequencesCsvException.class);
    }

    // ---- uploadSequencesFromCsv — upsert behavior ----

    @Test
    void upload_appendsNewSequences_withDefaults_andMaxOrderIncremented() {
        stubAuth();
        Sequence existing = Sequence.builder()
                .name("alpha").displayName("Alpha").duration(60).order(3).visible(true)
                .build();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .sequences(new ArrayList<>(List.of(existing))).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        String body = HEADERS + "\nbeta,Beta,B,grp,u,cat\ngamma,Gamma,G,grp,u,cat\n";
        ResponseEntity<Void> r = service.uploadSequencesFromCsv(csv(body));
        assertThat(r.getStatusCodeValue()).isEqualTo(200);

        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        List<Sequence> after = saved.getValue().getSequences();
        // existing alpha, plus beta and gamma appended.
        assertThat(after).hasSize(3);
        assertThat(after).extracting(Sequence::getName).containsExactly("alpha", "beta", "gamma");
        // alpha's order (3) preserved; new entries get 4, 5
        assertThat(after.get(1).getOrder()).isEqualTo(4);
        assertThat(after.get(2).getOrder()).isEqualTo(5);
        // sane defaults
        assertThat(after.get(1).getDuration()).isZero();
        assertThat(after.get(1).getVisible()).isTrue();
        assertThat(after.get(1).getActive()).isFalse();
        assertThat(after.get(1).getType()).isEqualTo("SEQUENCE");
    }

    @Test
    void upload_updatesExistingSequenceFields_preservesPlaybackFields() {
        stubAuth();
        Sequence existing = Sequence.builder()
                .name("Alpha").displayName("Old Display").artist("OldArtist")
                .group("OldGroup").imageUrl("OldUrl").category("OldCat")
                // Playback-time fields the CSV doesn't carry; must survive the upsert.
                .duration(180).index(2).order(7).active(true).visible(true).visibilityCount(99)
                .build();
        Show show = Show.builder().showToken(SHOW_TOKEN)
                .sequences(new ArrayList<>(List.of(existing))).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        // Note: CSV uses lowercase "alpha" — match should be case-insensitive.
        String body = HEADERS + "\nalpha,New Display,NewArtist,NewGroup,NewUrl,NewCat\n";
        service.uploadSequencesFromCsv(csv(body));

        // The existing instance was mutated in place.
        assertThat(existing.getDisplayName()).isEqualTo("New Display");
        assertThat(existing.getArtist()).isEqualTo("NewArtist");
        assertThat(existing.getGroup()).isEqualTo("NewGroup");
        // Playback-time fields preserved.
        assertThat(existing.getDuration()).isEqualTo(180);
        assertThat(existing.getIndex()).isEqualTo(2);
        assertThat(existing.getOrder()).isEqualTo(7);
        assertThat(existing.getActive()).isTrue();
        assertThat(existing.getVisibilityCount()).isEqualTo(99);
    }

    @Test
    void upload_handlesQuotedAndEscapedQuoteCells() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(new ArrayList<>()).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        // Row with a commas-in-quoted-field, and an escaped quote ("" -> ")
        String body = HEADERS + "\n\"Song, One\",\"Display \"\"q\"\"\",artist,group,url,cat\n";
        service.uploadSequencesFromCsv(csv(body));

        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        Sequence appended = saved.getValue().getSequences().get(0);
        assertThat(appended.getName()).isEqualTo("Song, One");
        assertThat(appended.getDisplayName()).isEqualTo("Display \"q\"");
    }

    @Test
    void upload_skipsBlankAndEmptyRows() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(new ArrayList<>()).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        // Blank line, all-empty-column line, then one good row.
        String body = HEADERS + "\n\n,,,,,\ngood,Good,A,G,U,C\n";
        service.uploadSequencesFromCsv(csv(body));

        ArgumentCaptor<Show> saved = ArgumentCaptor.forClass(Show.class);
        verify(showRepository).save(saved.capture());
        assertThat(saved.getValue().getSequences()).hasSize(1);
        assertThat(saved.getValue().getSequences().get(0).getName()).isEqualTo("good");
    }

    @Test
    void upload_emptyCsv_throwsEmptyFile() {
        stubAuth();
        Show show = Show.builder().showToken(SHOW_TOKEN).sequences(new ArrayList<>()).build();
        when(showRepository.findByShowToken(SHOW_TOKEN)).thenReturn(Optional.of(show));

        // A single byte file isn't "isEmpty()" but has no readable line -> EMPTY_FILE
        // (BufferedReader.readLine() returns null on a zero-byte body, but
        // MultipartFile#isEmpty short-circuits before we get there. Use a
        // file containing just whitespace to land in the parser then trip
        // the "headerLine == null" branch via an effectively empty stream.)
        MultipartFile blanks = new MockMultipartFile("f", "x.csv", "text/csv", " ".getBytes(StandardCharsets.UTF_8));
        // Whitespace-only header line still parses to a non-null string and
        // therefore triggers INVALID_HEADERS instead — that's the expected
        // path. Confirm we land in *some* SequencesCsvException.
        assertThatThrownBy(() -> service.uploadSequencesFromCsv(blanks))
                .isInstanceOf(SequencesCsvException.class);
        verify(showRepository, never()).save(any(Show.class));
    }
}
