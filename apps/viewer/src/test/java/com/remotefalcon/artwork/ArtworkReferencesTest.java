package com.remotefalcon.artwork;

import com.remotefalcon.library.models.Request;
import com.remotefalcon.library.models.Sequence;
import com.remotefalcon.library.models.Vote;
import com.remotefalcon.library.quarkus.entity.Show;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class ArtworkReferencesTest {

  private static final String SUB = "myshow";

  private static String dataUri(String mediaType, byte... bytes) {
    return "data:" + mediaType + ";base64," + Base64.getEncoder().encodeToString(bytes);
  }

  private static final String ART_A = dataUri("image/png", (byte) 1, (byte) 2, (byte) 3);
  private static final String ART_B = dataUri("image/jpeg", (byte) 4, (byte) 5, (byte) 6);

  private static ArtworkReferences relative() {
    return new ArtworkReferences(new ArtworkHashes(), Optional.empty(), "/remote-falcon-viewer");
  }

  @Test
  @DisplayName("an inline data URI becomes a short URL under the viewer root path")
  void dataUriBecomesReference() {
    String ref = relative().reference(SUB, ART_A);

    assertNotNull(ref);
    assertTrue(ref.matches("/remote-falcon-viewer/artwork/myshow/[0-9a-f]{32}\\.png"), ref);
  }

  @Test
  @DisplayName("a configured public URL makes the reference absolute")
  void configuredPublicUrl() {
    ArtworkReferences refs = new ArtworkReferences(new ArtworkHashes(),
        Optional.of("https://remotefalcon.com/remote-falcon-viewer/"), "/remote-falcon-viewer");

    String ref = refs.reference(SUB, ART_B);

    assertTrue(ref.matches("https://remotefalcon\\.com/remote-falcon-viewer/artwork/myshow/[0-9a-f]{32}\\.jpg"), ref);
  }

  @Test
  @DisplayName("a blank public URL falls back to the root path")
  void blankPublicUrl() {
    ArtworkReferences refs = new ArtworkReferences(new ArtworkHashes(), Optional.of("  "), "/remote-falcon-viewer");

    assertTrue(refs.reference(SUB, ART_A).startsWith("/remote-falcon-viewer/artwork/"));
  }

  @Test
  @DisplayName("http(s) URLs, blanks and nulls pass through unchanged")
  void passthrough() {
    ArtworkReferences refs = relative();
    assertEquals("https://example.com/a.png", refs.reference(SUB, "https://example.com/a.png"));
    assertEquals("", refs.reference(SUB, ""));
    assertNull(refs.reference(SUB, null));
    assertEquals("data:text/plain,hi", refs.reference(SUB, "data:text/plain,hi"));
    assertEquals("data:image/png;base64,***", refs.reference(SUB, "data:image/png;base64,***"));
  }

  @Test
  @DisplayName("the URL is stable for the same art and changes when the art changes")
  void hashTracksContent() {
    ArtworkReferences refs = relative();
    String first = refs.reference(SUB, ART_A);
    // A fresh String instance with the same content (as a new Mongo decode would give)
    String again = refs.reference(SUB, new String(ART_A.toCharArray()));
    String other = refs.reference(SUB, dataUri("image/png", (byte) 1, (byte) 2, (byte) 4));

    assertEquals(first, again);
    assertNotEquals(first, other);
  }

  @Test
  @DisplayName("the hash matches a cold computation, so the endpoint can verify it")
  void hashMatchesCold() {
    String ref = relative().reference(SUB, ART_A);
    String hash = ref.substring(ref.lastIndexOf('/') + 1, ref.lastIndexOf('.'));

    assertEquals(ArtworkHashes.sha(ART_A), hash);
    assertEquals(Optional.of(hash), new ArtworkHashes().hashOf(SUB, ART_A));
  }

  @Test
  @DisplayName("subdomains are URL-encoded into the path")
  void encodesSubdomain() {
    String ref = relative().reference("a b/c", ART_A);
    assertTrue(ref.startsWith("/remote-falcon-viewer/artwork/a%20b%2Fc/"), ref);
  }

  @Test
  @DisplayName("rewrite covers sequences, playing now/next, queued requests and votes")
  void rewriteShow() {
    Show show = new Show();
    show.setShowSubdomain(SUB);
    Sequence inline = Sequence.builder().name("a").imageUrl(ART_A).build();
    Sequence linked = Sequence.builder().name("b").imageUrl("https://x/y.png").build();
    show.setSequences(new ArrayList<>(List.of(inline, linked)));
    show.setPlayingNowSequence(Sequence.builder().name("a").imageUrl(ART_A).build());
    show.setPlayingNextSequence(Sequence.builder().name("c").imageUrl(ART_B).build());
    show.setRequests(new ArrayList<>(List.of(
        Request.builder().position(1).sequence(Sequence.builder().name("c").imageUrl(ART_B).build()).build(),
        Request.builder().position(2).build())));
    show.setVotes(new ArrayList<>(List.of(
        Vote.builder().votes(1).sequence(Sequence.builder().name("a").imageUrl(ART_A).build()).build(),
        Vote.builder().votes(2).build())));

    relative().rewrite(show);

    String refA = relative().reference(SUB, ART_A);
    String refB = relative().reference(SUB, ART_B);
    assertEquals(refA, show.getSequences().get(0).getImageUrl());
    assertEquals("https://x/y.png", show.getSequences().get(1).getImageUrl());
    assertEquals(refA, show.getPlayingNowSequence().getImageUrl());
    assertEquals(refB, show.getPlayingNextSequence().getImageUrl());
    assertEquals(refB, show.getRequests().get(0).getSequence().getImageUrl());
    assertEquals(refA, show.getVotes().get(0).getSequence().getImageUrl());
  }

  @Test
  @DisplayName("rewrite is idempotent and null-safe")
  void rewriteIdempotentAndNullSafe() {
    ArtworkReferences refs = relative();
    refs.rewrite(null);
    Show empty = new Show();
    refs.rewrite(empty);

    Show show = new Show();
    show.setShowSubdomain(SUB);
    show.setSequences(new ArrayList<>(List.of(Sequence.builder().imageUrl(ART_A).build())));
    refs.rewrite(show);
    String once = show.getSequences().get(0).getImageUrl();
    refs.rewrite(show);
    assertEquals(once, show.getSequences().get(0).getImageUrl());
  }

  @Test
  @DisplayName("a show without a subdomain is left alone (no URL could resolve it)")
  void noSubdomain() {
    Show show = new Show();
    show.setSequences(new ArrayList<>(List.of(Sequence.builder().imageUrl(ART_A).build())));
    relative().rewrite(show);
    assertEquals(ART_A, show.getSequences().get(0).getImageUrl());
  }

  @Test
  @DisplayName("hash memo is scoped per show, so another show's art cannot collide into it")
  void memoScopedPerShow() {
    ArtworkHashes hashes = new ArtworkHashes();
    assertEquals(hashes.hashOf("one", ART_A), hashes.hashOf("two", ART_A));
    assertEquals(2, hashes.size());
  }
}
