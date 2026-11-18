package com.remotefalcon.controlpanel.util;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class PluginHeartbeatTest {

  private static final LocalDateTime NOW = LocalDateTime.of(2026, 12, 12, 20, 0);

  @Test
  void staleThresholdIsSevenMinutes() {
    // 5 min of real silence + plugins-api's 120s heartbeat write floor. Must
    // match plugins-api HEARTBEAT_GAP_THRESHOLD_MINUTES.
    assertThat(PluginHeartbeat.STALE_MINUTES).isEqualTo(7L);
  }

  @Test
  void connectedStrictlyInsideTheThreshold() {
    assertThat(PluginHeartbeat.isConnected(NOW.minusMinutes(7).plusNanos(1_000_000), NOW)).isTrue();
    assertThat(PluginHeartbeat.isConnected(NOW.minusMinutes(7), NOW)).isFalse();
    assertThat(PluginHeartbeat.isConnected(NOW.minusMinutes(6), NOW)).isTrue();
    assertThat(PluginHeartbeat.isConnected(NOW.minusHours(3), NOW)).isFalse();
  }

  @Test
  void neverConnectedIsNotConnected() {
    assertThat(PluginHeartbeat.isConnected(null, NOW)).isFalse();
  }

  @Test
  void slightlyFutureHeartbeatCountsAsConnected() {
    // Small clock skew between plugins-api and control-panel pods.
    assertThat(PluginHeartbeat.isConnected(NOW.plusSeconds(5), NOW)).isTrue();
  }
}
