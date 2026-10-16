package com.remotefalcon.mongo;

import com.mongodb.MongoException;
import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.MongoSocketWriteTimeoutException;
import com.mongodb.MongoTimeoutException;
import com.mongodb.ServerAddress;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MongoUnavailableTest {

  @Test
  void findsTransientTypesDirectly() {
    MongoTimeoutException timeout = new MongoTimeoutException("selection");
    assertSame(timeout, MongoUnavailable.find(timeout).orElseThrow());
    assertTrue(MongoUnavailable.find(new MongoSocketReadTimeoutException("read", new ServerAddress(), null)).isPresent());
    assertTrue(MongoUnavailable.find(new MongoSocketWriteTimeoutException("write", new ServerAddress(), null)).isPresent());
  }

  @Test
  void findsTransientTypeInCauseChain() {
    MongoTimeoutException timeout = new MongoTimeoutException("pool wait");
    Exception wrapped = new RuntimeException("outer", new IllegalStateException("middle", timeout));
    assertSame(timeout, MongoUnavailable.find(wrapped).orElseThrow());
  }

  @Test
  void ignoresOtherFailures() {
    assertFalse(MongoUnavailable.find(new IllegalStateException("bug")).isPresent());
    assertFalse(MongoUnavailable.find(null).isPresent());
    // A write error (duplicate key etc.) is a real failure, not "back off".
    assertFalse(MongoUnavailable.find(new RuntimeException(new MongoException("E11000 duplicate key")))
        .isPresent());
  }

  @Test
  void responseIs503WithRetryAfter() {
    Response response = MongoUnavailable.response();
    assertEquals(503, response.getStatus());
    assertEquals("15", response.getHeaderString("Retry-After"));
  }

  @Test
  void shortMessageIsOneBoundedLine() {
    String longMessage = "Timed out after 2000 ms while waiting for a server.\n" + "x".repeat(500);
    String shortMessage = MongoUnavailable.shortMessage(new MongoTimeoutException(longMessage));
    assertFalse(shortMessage.contains("\n"));
    assertTrue(shortMessage.length() <= 163);
    assertEquals("", MongoUnavailable.shortMessage(new RuntimeException((String) null)));
  }
}
