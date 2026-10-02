package com.remotefalcon.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class UtmUtilTest {

  @Test
  @DisplayName("null, empty and blank values become null")
  void blankIsNull() {
    assertNull(UtmUtil.sanitize(null));
    assertNull(UtmUtil.sanitize(""));
    assertNull(UtmUtil.sanitize("   "));
  }

  @Test
  @DisplayName("trims and lowercases")
  void trimsAndLowercases() {
    assertEquals("qr", UtmUtil.sanitize("  QR "));
    assertEquals("print", UtmUtil.sanitize("Print"));
  }

  @Test
  @DisplayName("caps at 32 characters")
  void capsLength() {
    String sanitized = UtmUtil.sanitize("A".repeat(50));
    assertEquals("a".repeat(32), sanitized);
    assertEquals(UtmUtil.MAX_LENGTH, sanitized.length());
  }
}
