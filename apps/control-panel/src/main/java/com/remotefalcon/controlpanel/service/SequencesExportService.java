package com.remotefalcon.controlpanel.service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.exception.SequencesCsvException;
import com.remotefalcon.controlpanel.exception.SequencesCsvException.ErrorType;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.controlpanel.util.ExcelUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.models.Sequence;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class SequencesExportService {
  private final AuthUtil jwtUtil;
  private final ShowRepository showRepository;
  private final ExcelUtil excelUtil;

  public ResponseEntity<ByteArrayResource> downloadSequencesToExcel() {
    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    Optional<Show> show = this.showRepository.findByShowToken(tokenDTO.getShowToken());
    if (show.isEmpty()) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    List<Sequence> sequences = show.get().getSequences();
    if (sequences == null || sequences.isEmpty()) {
      return ResponseEntity.status(204).build();
    }

    return excelUtil.generateSequencesExcel(sequences);
  }

  public ResponseEntity<Void> uploadSequencesFromCsv(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new SequencesCsvException(ErrorType.FILE_REQUIRED, "CSV file is required");
    }

    TokenDTO tokenDTO = this.jwtUtil.getJwtPayload();
    Optional<Show> showOptional = this.showRepository.findByShowToken(tokenDTO.getShowToken());
    if (showOptional.isEmpty()) {
      throw new SequencesCsvException(ErrorType.SHOW_NOT_FOUND, StatusResponse.SHOW_NOT_FOUND.name());
    }

    List<Sequence> parsedSequences = parseCsvToSequences(file);
    Show show = showOptional.get();
    updateSequences(show, parsedSequences);
    this.showRepository.save(show);

    return ResponseEntity.ok().build();
  }

  private List<Sequence> parseCsvToSequences(MultipartFile file) {
    List<Sequence> sequences = new ArrayList<>();
    try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
      String headerLine = reader.readLine();
      if (headerLine == null) {
        throw new SequencesCsvException(ErrorType.EMPTY_FILE, "CSV file is empty");
      }

      List<String> headers = trimTrailingEmpty(parseCsvLine(headerLine))
          .stream()
          .map(String::trim)
          .toList();
      if (headers.size() < ExcelUtil.SEQUENCE_CSV_HEADERS.size()
          || !headers.subList(0, ExcelUtil.SEQUENCE_CSV_HEADERS.size()).equals(ExcelUtil.SEQUENCE_CSV_HEADERS)) {
        throw new SequencesCsvException(ErrorType.INVALID_HEADERS, "CSV headers do not match expected format");
      }

      String line;
      while ((line = reader.readLine()) != null) {
        if (line.isBlank()) {
          continue;
        }
        List<String> columns = parseCsvLine(line);
        if (isRowEmpty(columns)) {
          continue;
        }
        if (columns.size() != ExcelUtil.SEQUENCE_CSV_HEADERS.size()) {
          throw new SequencesCsvException(ErrorType.INVALID_COLUMN_COUNT, "CSV row has incorrect column count");
        }

        Sequence sequence = Sequence.builder()
            .name(emptyToNull(columns.get(0)))
            .displayName(emptyToNull(columns.get(1)))
            .artist(emptyToNull(columns.get(2)))
            .group(emptyToNull(columns.get(3)))
            .imageUrl(emptyToNull(columns.get(4)))
            .category(emptyToNull(columns.get(5)))
            .build();
        if (sequence.getName() == null) {
          throw new SequencesCsvException(ErrorType.MISSING_SEQUENCE_NAME, "Sequence name is required");
        }
        sequences.add(sequence);
      }
    } catch (IOException e) {
      throw new SequencesCsvException(ErrorType.READ_FAILURE, "Unable to read CSV", e);
    }
    return sequences;
  }

  private List<String> parseCsvLine(String line) {
    List<String> values = new ArrayList<>();
    StringBuilder current = new StringBuilder();
    boolean inQuotes = false;

    for (int i = 0; i < line.length(); i++) {
      char c = line.charAt(i);
      if (c == '\"') {
        if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '\"') {
          current.append('\"');
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c == ',' && !inQuotes) {
        values.add(current.toString());
        current.setLength(0);
      } else {
        current.append(c);
      }
    }
    values.add(current.toString());
    return values;
  }

  private boolean isRowEmpty(List<String> columns) {
    return columns.stream().allMatch(value -> value == null || value.isBlank());
  }

  private List<String> trimTrailingEmpty(List<String> values) {
    List<String> trimmed = new ArrayList<>(values);
    while (!trimmed.isEmpty()) {
      String last = trimmed.get(trimmed.size() - 1);
      if (last == null || last.isBlank()) {
        trimmed.remove(trimmed.size() - 1);
      } else {
        break;
      }
    }
    return trimmed;
  }

  private void updateSequences(Show show, List<Sequence> incomingSequences) {
    // Upsert: existing sequences (matched by lowercased name) get their
    // CSV-editable fields refreshed; sequences not yet in the show get
    // appended with sane defaults so the user can bootstrap from a CSV
    // exported elsewhere. The FPP plugin's next push will fill in
    // playback-time fields (index, duration) for the new entries.
    List<Sequence> existing = show.getSequences() == null ? new ArrayList<>() : show.getSequences();
    Map<String, Sequence> existingByName = new java.util.HashMap<>();
    int maxOrder = -1;
    for (Sequence seq : existing) {
      if (seq != null && seq.getName() != null) {
        existingByName.put(seq.getName().toLowerCase(), seq);
        if (seq.getOrder() != null && seq.getOrder() > maxOrder) {
          maxOrder = seq.getOrder();
        }
      }
    }

    for (Sequence incoming : incomingSequences) {
      String key = incoming.getName().toLowerCase();
      Sequence target = existingByName.get(key);
      if (target != null) {
        target.setDisplayName(incoming.getDisplayName());
        target.setArtist(incoming.getArtist());
        target.setGroup(incoming.getGroup());
        target.setImageUrl(incoming.getImageUrl());
        target.setCategory(incoming.getCategory());
      } else {
        maxOrder++;
        Sequence created = Sequence.builder()
            .name(incoming.getName())
            .displayName(incoming.getDisplayName())
            .artist(incoming.getArtist())
            .group(incoming.getGroup())
            .imageUrl(incoming.getImageUrl())
            .category(incoming.getCategory())
            .duration(0)
            .visible(true)
            .index(0)
            .order(maxOrder)
            .active(false)
            .visibilityCount(0)
            .type("SEQUENCE")
            .build();
        existing.add(created);
        existingByName.put(key, created);
      }
    }

    show.setSequences(existing);
  }

  private String emptyToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

}
