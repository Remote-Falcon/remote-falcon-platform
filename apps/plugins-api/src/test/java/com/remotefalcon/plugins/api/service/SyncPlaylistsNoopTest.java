package com.remotefalcon.plugins.api.service;

import com.remotefalcon.library.models.Preference;
import com.remotefalcon.library.models.PsaSequence;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.quarkus.entity.Show;
import com.remotefalcon.plugins.api.context.ShowContext;
import com.remotefalcon.plugins.api.model.PluginResponse;
import com.remotefalcon.plugins.api.model.SyncPlaylistDetails;
import com.remotefalcon.plugins.api.model.SyncPlaylistRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Season Prep S3 / R1: syncPlaylists skips the full-array rewrite when the
 * plugin re-sends what is already stored. Plain JUnit (no Quarkus, no Mongo):
 * the Mongo write is replaced by a recorder that also simulates the round
 * trip, so the next call sees exactly what the previous one stored. The REST
 * + Testcontainers version of these checks is
 * SyncPlaylistsNoopIntegrationTest.
 */
class SyncPlaylistsNoopTest {

  /** Captures writes instead of calling Mongo, and feeds them back as the stored show. */
  static class RecordingPluginService extends PluginService {
    final List<List<Sequence>> sequenceWrites = new ArrayList<>();
    final List<List<PsaSequence>> psaWrites = new ArrayList<>();
    Show stored;

    @Override
    void writeSyncedPlaylists(String showToken, List<Sequence> sequences, List<PsaSequence> psaSequences) {
      sequenceWrites.add(sequences);
      psaWrites.add(psaSequences);
      stored.setSequences(new ArrayList<>(sequences.stream().map(SyncPlaylistsDiff::copyOf).toList()));
      stored.setPsaSequences(new ArrayList<>(psaSequences));
      if (psaSequences.isEmpty()) {
        stored.getPreferences().setPsaEnabled(false);
      }
    }
  }

  private RecordingPluginService service;

  @BeforeEach
  void setUp() {
    service = new RecordingPluginService();
    service.sequenceLimit = 500;
    service.showContext = new ShowContext();
    Show show = new Show();
    show.setShowToken("noop-token");
    show.setSequences(new ArrayList<>());
    show.setPsaSequences(new ArrayList<>());
    show.setPreferences(Preference.builder().psaEnabled(false).build());
    service.stored = show;
  }

  @Test
  void unchangedPayload_doesNotWrite() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("A", 1), playlist("B", 2), playlist("C", 3));
    sync(playlists);
    assertEquals(1, service.sequenceWrites.size());

    sync(playlists);
    sync(playlists);

    assertEquals(1, service.sequenceWrites.size(), "re-sending the stored playlist must not write");
  }

  @Test
  void noOpStillReturnsSuccess() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("A", 1));
    sync(playlists);
    assertEquals("Success", sync(playlists).getMessage());
  }

  @Test
  void severalInactiveSequences_settleToNoWrite() {
    sync(List.of(playlist("A", 1), playlist("B", 2), playlist("C", 3),
        playlist("D", 4), playlist("E", 5), playlist("F", 6), playlist("G", 7)));
    List<SyncPlaylistDetails> reduced = List.of(playlist("A", 1));
    sync(reduced);
    int writesAfterChange = service.sequenceWrites.size();

    for (int i = 0; i < 5; i++) {
      sync(reduced);
    }

    assertEquals(writesAfterChange, service.sequenceWrites.size(),
        "removed sequences are renumbered from their array position; the stored order must be stable");
  }

  @Test
  void requestOrderOnlyDifference_doesNotWrite() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("A", 1), playlist("B", 2), playlist("C", 3));
    sync(playlists);
    List<SyncPlaylistDetails> reversed = new ArrayList<>(playlists);
    Collections.reverse(reversed);

    sync(reversed);

    assertEquals(1, service.sequenceWrites.size());
  }

  @Test
  void storedArrayOrderOnlyDifference_doesNotWrite() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("A", 1), playlist("B", 2), playlist("C", 3));
    sync(playlists);
    Collections.reverse(service.stored.getSequences());

    sync(playlists);

    assertEquals(1, service.sequenceWrites.size());
  }

  @Test
  void addedSequence_writes() {
    sync(List.of(playlist("A", 1)));
    sync(List.of(playlist("A", 1), playlist("B", 2)));
    assertEquals(2, service.sequenceWrites.size());
  }

  @Test
  void removedSequence_writes() {
    sync(List.of(playlist("A", 1), playlist("B", 2)));
    sync(List.of(playlist("A", 1)));
    assertEquals(2, service.sequenceWrites.size());
    assertTrue(service.stored.getSequences().stream()
        .anyMatch(s -> "B".equals(s.getName()) && Boolean.FALSE.equals(s.getActive())));
  }

  @Test
  void renamedSequence_writes() {
    sync(List.of(playlist("A", 1)));
    sync(List.of(playlist("A (remix)", 1)));
    assertEquals(2, service.sequenceWrites.size());
  }

  @Test
  void caseOnlyRename_isNoOp() {
    // Names match case-insensitively and the stored name is kept, so the
    // computed result is identical to what is stored.
    sync(List.of(playlist("Song", 1)));
    sync(List.of(playlist("SONG", 1)));
    sync(List.of(playlist("SONG", 1)));
    assertEquals(1, service.sequenceWrites.size());
  }

  @Test
  void changedIndexDurationOrType_writes() {
    sync(List.of(playlist("A", 1)));
    sync(List.of(playlist("A", 9)));
    assertEquals(2, service.sequenceWrites.size());

    SyncPlaylistDetails longer = playlist("A", 9);
    longer.setPlaylistDuration(999);
    sync(List.of(longer));
    assertEquals(3, service.sequenceWrites.size());

    SyncPlaylistDetails media = playlist("A", 9);
    media.setPlaylistDuration(999);
    media.setPlaylistType("MEDIA");
    sync(List.of(media));
    assertEquals(4, service.sequenceWrites.size());
  }

  @Test
  void changedMediaMetadata_writes() {
    sync(List.of(playlist("A", 1)));
    SyncPlaylistDetails titled = playlist("A", 1);
    titled.setMediaTitle("A - Live");
    titled.setMediaArtist("Band");
    titled.setMediaAlbumUrl("https://img/a.png");
    sync(List.of(titled));
    assertEquals(2, service.sequenceWrites.size());

    // Blank media fields never clear stored ones, so re-sending without them is a no-op.
    sync(List.of(playlist("A", 1)));
    assertEquals(2, service.sequenceWrites.size());
  }

  @Test
  void psaChanges_write_andUnchangedPsa_doesNot() {
    List<SyncPlaylistDetails> withPsa = List.of(playlist("A", 1), playlist("PSA 1", 2));
    sync(withPsa);
    service.stored.setPsaSequences(new ArrayList<>(List.of(
        PsaSequence.builder().name("PSA 1").order(1).enabled(true).lastPlayed(LocalDateTime.of(2026, 11, 1, 20, 0)).build())));
    service.stored.getPreferences().setPsaEnabled(true);

    sync(withPsa);
    assertEquals(1, service.sequenceWrites.size(), "PSA list unchanged: no write");

    sync(List.of(playlist("A", 1)));
    assertEquals(2, service.sequenceWrites.size(), "PSA dropped from the playlist: write");
    assertTrue(service.psaWrites.getLast().isEmpty());
    assertFalse(service.stored.getPreferences().getPsaEnabled());
  }

  @Test
  void psaEnabledWithNoPsaSequences_writesToDisableIt() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("A", 1));
    sync(playlists);
    service.stored.getPreferences().setPsaEnabled(true);

    sync(playlists);

    assertEquals(2, service.sequenceWrites.size());
    assertFalse(service.stored.getPreferences().getPsaEnabled());
  }

  @Test
  void missingSequencesOrPsaArray_writesOnceToNormalise() {
    service.stored.setSequences(null);
    service.stored.setPsaSequences(null);
    sync(List.of());
    assertEquals(1, service.sequenceWrites.size());
    sync(List.of());
    assertEquals(1, service.sequenceWrites.size());
  }

  @Test
  void nullAndDuplicateStoredEntries_writeOnceThenSettle() {
    Sequence a = Sequence.builder().name("A").displayName("A").index(1).duration(10).type("SEQUENCE")
        .active(true).order(0).visible(true).visibilityCount(0).imageUrl("").artist("").build();
    List<Sequence> dirty = new ArrayList<>();
    dirty.add(a);
    dirty.add(null);
    dirty.add(SyncPlaylistsDiff.copyOf(a));
    service.stored.setSequences(dirty);

    sync(List.of(playlist("A", 1)));
    assertEquals(1, service.sequenceWrites.size(), "nulls and duplicates are cleaned up by one write");
    sync(List.of(playlist("A", 1)));
    assertEquals(1, service.sequenceWrites.size());
  }

  @Test
  void unmanagedFieldsDoNotForceAWrite() {
    List<SyncPlaylistDetails> playlists = List.of(playlist("A", 1), playlist("B", 2));
    sync(playlists);
    Sequence a = service.stored.getSequences().stream().filter(s -> "A".equals(s.getName())).findFirst().orElseThrow();
    a.setVisibilityCount(3);
    a.setPlaysToday(2);
    a.setCategory("Classics");
    a.setGroup("G1");
    a.setVisible(false);

    sync(playlists);

    assertEquals(1, service.sequenceWrites.size());
  }

  @Test
  void copyOf_copiesEveryField() throws IllegalAccessException {
    // Guards the snapshot: a Sequence field added later but not copied would
    // read as a change on every call (writes resume), never as a skipped write.
    Sequence original = new Sequence();
    int n = 1;
    for (Field field : Sequence.class.getDeclaredFields()) {
      if (Modifier.isStatic(field.getModifiers())) {
        continue;
      }
      field.setAccessible(true);
      Class<?> type = field.getType();
      if (type == String.class) {
        field.set(original, "v" + n);
      } else if (type == Integer.class) {
        field.set(original, n);
      } else if (type == Boolean.class) {
        field.set(original, Boolean.TRUE);
      } else {
        throw new AssertionError("copyOf_copiesEveryField does not know how to populate " + field);
      }
      n++;
    }

    Sequence copy = SyncPlaylistsDiff.copyOf(original);

    assertNotSame(original, copy);
    assertEquals(original, copy);
  }

  private PluginResponse sync(List<SyncPlaylistDetails> playlists) {
    // Fresh load each call, like ShowTokenFilter does per request.
    Show loaded = new Show();
    Show stored = service.stored;
    loaded.setShowToken(stored.getShowToken());
    loaded.setSequences(stored.getSequences() == null ? null
        : new ArrayList<>(stored.getSequences().stream().map(s -> s == null ? null : SyncPlaylistsDiff.copyOf(s)).toList()));
    loaded.setPsaSequences(stored.getPsaSequences() == null ? null : new ArrayList<>(stored.getPsaSequences()));
    loaded.setPreferences(Preference.builder().psaEnabled(stored.getPreferences().getPsaEnabled()).build());
    service.showContext.setShow(loaded);
    return service.syncPlaylists(SyncPlaylistRequest.builder().playlists(playlists).build());
  }

  private static SyncPlaylistDetails playlist(String name, int index) {
    return SyncPlaylistDetails.builder()
        .playlistName(name)
        .playlistIndex(index)
        .playlistDuration(100)
        .playlistType("SEQUENCE")
        .build();
  }
}
