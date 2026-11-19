package com.remotefalcon.artwork;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class InlineArtworkTest {

  private static final byte[] PNG_BYTES = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 1, 2, 3};

  private static String pngDataUri() {
    return "data:image/png;base64," + Base64.getEncoder().encodeToString(PNG_BYTES);
  }

  @Test
  @DisplayName("parses a base64 image data URI into media type and bytes")
  void parsesBase64Image() {
    InlineArtwork art = InlineArtwork.parse(pngDataUri());

    assertNotNull(art);
    assertEquals("image/png", art.mediaType());
    assertArrayEquals(PNG_BYTES, art.bytes());
    assertEquals("png", art.extension());
  }

  @Test
  @DisplayName("media type matching is case-insensitive and normalised to lower case")
  void caseInsensitiveScheme() {
    InlineArtwork art = InlineArtwork.parse("DATA:Image/JPEG;base64," + Base64.getEncoder().encodeToString(PNG_BYTES));

    assertNotNull(art);
    assertEquals("image/jpeg", art.mediaType());
    assertEquals("jpg", art.extension());
  }

  @Test
  @DisplayName("parses a percent-encoded (non-base64) SVG data URI")
  void parsesPercentEncodedSvg() {
    InlineArtwork art = InlineArtwork.parse("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22x%22%2F%3E");

    assertNotNull(art);
    assertEquals("image/svg+xml", art.mediaType());
    assertEquals("<svg xmlns=\"x\"/>", new String(art.bytes(), StandardCharsets.UTF_8));
    assertEquals("svg", art.extension());
  }

  @Test
  @DisplayName("tolerates whitespace inside the base64 payload")
  void toleratesWhitespace() {
    String b64 = Base64.getMimeEncoder(4, "\n".getBytes()).encodeToString(PNG_BYTES);
    InlineArtwork art = InlineArtwork.parse("data:image/png;base64," + b64);

    assertNotNull(art);
    assertArrayEquals(PNG_BYTES, art.bytes());
  }

  @Test
  @DisplayName("returns null for anything that is not an inline image")
  void rejectsNonImages() {
    assertNull(InlineArtwork.parse(null));
    assertNull(InlineArtwork.parse(""));
    assertNull(InlineArtwork.parse("https://example.com/a.png"));
    assertNull(InlineArtwork.parse("data:text/html;base64,PHNjcmlwdD4="));
    assertNull(InlineArtwork.parse("data:;base64,AAAA"));
    assertNull(InlineArtwork.parse("data:image/png;base64"));
  }

  @Test
  @DisplayName("returns null for undecodable base64")
  void rejectsBadBase64() {
    assertNull(InlineArtwork.parse("data:image/png;base64,***not base64***"));
  }

  @Test
  @DisplayName("isCandidate is a cheap prefix check")
  void isCandidate() {
    assertTrue(InlineArtwork.isCandidate(pngDataUri()));
    assertTrue(InlineArtwork.isCandidate("data:IMAGE/png;base64,x"));
    assertFalse(InlineArtwork.isCandidate("https://example.com/a.png"));
    assertFalse(InlineArtwork.isCandidate("data:text/plain,hi"));
    assertFalse(InlineArtwork.isCandidate(null));
  }

  @Test
  @DisplayName("unknown image subtypes get a neutral extension")
  void unknownExtension() {
    InlineArtwork art = InlineArtwork.parse("data:image/x-weird;base64," + Base64.getEncoder().encodeToString(PNG_BYTES));
    assertNotNull(art);
    assertEquals("img", art.extension());
  }
}
