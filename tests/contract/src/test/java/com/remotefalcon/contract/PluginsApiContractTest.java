package com.remotefalcon.contract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.InputStream;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Black-box contract test between the FPP plugin (producer) and
 * remote-falcon-plugins-api (consumer). Each fixture under
 * src/test/resources/fixtures/plugin-requests/ models a real plugin POST
 * body. We assert: (a) deserializes via Jackson, (b) contains exactly the
 * expected key set with non-null values, (c) round-trips back to an
 * equivalent JSON tree.
 *
 * Required-key sets are derived from the DTO classes in
 * apps/plugins-api/src/main/java/com/remotefalcon/plugins/api/model/.
 * Update fixtures + this test together when a DTO changes.
 */
class PluginsApiContractTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  static Stream<Arguments> fixtures() {
    return Stream.of(
        Arguments.of(
            "syncPlaylists.json",
            Set.of("playlists"),
            // Each playlist entry must carry the full SyncPlaylistDetails shape.
            Set.of("playlistName", "playlistDuration", "playlistIndex",
                "playlistType", "mediaTitle", "mediaArtist", "mediaAlbumUrl")),
        Arguments.of("updateWhatsPlaying.json", Set.of("playlist"), Set.<String>of()),
        Arguments.of("updateNextScheduledSequence.json", Set.of("sequence"), Set.<String>of()),
        Arguments.of("pluginVersion.json", Set.of("pluginVersion", "fppVersion"), Set.<String>of()),
        Arguments.of("updateViewerControl.json", Set.of("viewerControlEnabled"), Set.<String>of()),
        Arguments.of("updateManagedPsa.json", Set.of("managedPsaEnabled"), Set.<String>of()));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("fixtures")
  void fixtureMatchesDtoContract(String fixture, Set<String> requiredTopKeys,
      Set<String> requiredNestedKeys) throws Exception {
    String path = "fixtures/plugin-requests/" + fixture;
    JsonNode root;
    try (InputStream in = getClass().getClassLoader().getResourceAsStream(path)) {
      assertNotNull(in, "fixture missing on classpath: " + path);
      root = MAPPER.readTree(in);
    }

    // (a) deserializes as a JSON object
    assertTrue(root.isObject(), fixture + " must be a JSON object");

    // (b) top-level required keys present, non-null, exact set (no extras)
    Set<String> actualTop = MAPPER.convertValue(root, Map.class).keySet();
    assertEquals(requiredTopKeys, actualTop,
        fixture + " top-level keys drifted from DTO");
    for (String key : requiredTopKeys) {
      assertFalse(root.get(key).isNull(), fixture + "." + key + " is null");
    }

    // syncPlaylists: each element must satisfy SyncPlaylistDetails shape.
    if (!requiredNestedKeys.isEmpty()) {
      JsonNode list = root.get("playlists");
      assertTrue(list.isArray() && list.size() > 0,
          "playlists must be a non-empty array");
      for (JsonNode item : list) {
        Set<String> itemKeys = MAPPER.convertValue(item, Map.class).keySet();
        assertEquals(requiredNestedKeys, itemKeys,
            "SyncPlaylistDetails keys drifted: " + itemKeys);
      }
    }

    // (c) round-trip: parse -> Map -> serialize -> parse yields equal tree.
    Object asObject = MAPPER.treeToValue(root, Object.class);
    String reserialized = MAPPER.writeValueAsString(asObject);
    JsonNode roundTripped = MAPPER.readTree(reserialized);
    assertEquals(root, roundTripped, fixture + " did not round-trip cleanly");
  }
}
