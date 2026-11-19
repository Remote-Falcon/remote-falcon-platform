package com.remotefalcon.mongo;

import com.mongodb.MongoTimeoutException;
import io.smallrye.faulttolerance.api.CircuitBreakerState;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MongoCircuitBreakerDisabledTest {

  @Test
  @DisplayName("Disabled (the default): a pass-through that never opens and rethrows the original failure")
  void disabledNeverOpens() throws Exception {
    MongoCircuitBreaker breaker = new MongoCircuitBreaker(false, 2, 0.5, Duration.ofSeconds(60), 1);
    assertFalse(breaker.isEnabled());

    MongoTimeoutException timeout = new MongoTimeoutException("down");
    for (int i = 0; i < 50; i++) {
      assertSame(timeout, assertThrows(MongoTimeoutException.class, () -> breaker.call(() -> {
        throw timeout;
      })));
    }
    assertEquals(CircuitBreakerState.CLOSED, breaker.state());
    assertEquals("ok", breaker.call(() -> "ok"));
  }
}
