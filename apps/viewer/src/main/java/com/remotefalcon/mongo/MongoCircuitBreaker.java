package com.remotefalcon.mongo;

import io.smallrye.faulttolerance.api.CircuitBreakerState;
import io.smallrye.faulttolerance.api.FaultTolerance;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.faulttolerance.exceptions.CircuitBreakerOpenException;
import org.jboss.logging.Logger;

import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.Callable;

/**
 * One circuit breaker shared by every Mongo call in this pod (Season Prep S5b,
 * Appendix D P2-2). When the database stalls, calls fail with a driver timeout
 * after 1-8s each; once enough of them do, the breaker opens and later calls
 * fail at once with {@link MongoCircuitOpenException} (503 + Retry-After)
 * instead of parking a worker thread on the pool wait. After the delay it lets
 * a few trial calls through and closes again if they succeed.
 *
 * <p>Only "database unavailable" failures count ({@link MongoUnavailable#find}).
 * A duplicate key or a bad query is a bug, not a stall, and is recorded as a
 * success so it can never open the breaker.
 *
 * <p>Off by default ({@code MONGO_CIRCUIT_BREAKER_ENABLED=false}). When off,
 * {@link #call} is a plain pass-through and no SmallRye guard is even built.
 * Everything is read at runtime when the bean is first used, so the flag and
 * thresholds can change per deploy without a native rebuild. The guard uses
 * the SmallRye programmatic API rather than {@code @CircuitBreaker}, because
 * the annotation is bound per method and this breaker has to be shared, and
 * because a runtime on/off switch is simpler than per-annotation config.
 */
@ApplicationScoped
public class MongoCircuitBreaker {

  private static final Logger LOG = Logger.getLogger(MongoCircuitBreaker.class);

  private final boolean enabled;
  private final int requestVolumeThreshold;
  private final double failureRatio;
  private final Duration delay;
  private final int successThreshold;

  private volatile FaultTolerance<Object> guard;
  private volatile CircuitBreakerState state = CircuitBreakerState.CLOSED;

  @Inject
  public MongoCircuitBreaker(
      @ConfigProperty(name = "remotefalcon.mongodb.circuit-breaker.enabled", defaultValue = "false")
      boolean enabled,
      @ConfigProperty(name = "remotefalcon.mongodb.circuit-breaker.request-volume-threshold", defaultValue = "20")
      int requestVolumeThreshold,
      @ConfigProperty(name = "remotefalcon.mongodb.circuit-breaker.failure-ratio", defaultValue = "0.5")
      double failureRatio,
      @ConfigProperty(name = "remotefalcon.mongodb.circuit-breaker.delay", defaultValue = "10S")
      Duration delay,
      @ConfigProperty(name = "remotefalcon.mongodb.circuit-breaker.success-threshold", defaultValue = "3")
      int successThreshold) {
    this.enabled = enabled;
    this.requestVolumeThreshold = requestVolumeThreshold;
    this.failureRatio = failureRatio;
    this.delay = delay;
    this.successThreshold = successThreshold;
    this.guard = enabled ? buildGuard() : null;
    if (enabled) {
      LOG.infof("MONGO_CIRCUIT_BREAKER enabled requestVolume=%d failureRatio=%.2f delayMs=%d successThreshold=%d",
          requestVolumeThreshold, failureRatio, delay.toMillis(), successThreshold);
    }
  }

  public boolean isEnabled() {
    return enabled;
  }

  /** Current state; always CLOSED when the breaker is disabled. */
  public CircuitBreakerState state() {
    return state;
  }

  /**
   * Runs {@code action} through the breaker, or directly when disabled.
   *
   * @throws MongoCircuitOpenException when the breaker is open
   */
  public <T> T call(Callable<T> action) throws Exception {
    FaultTolerance<Object> current = guard;
    if (current == null) {
      return action.call();
    }
    try {
      @SuppressWarnings("unchecked")
      T result = (T) current.call(action::call);
      return result;
    } catch (CircuitBreakerOpenException e) {
      throw new MongoCircuitOpenException();
    }
  }

  /** Visible for tests: a fresh, closed breaker with the same settings. */
  void reset() {
    if (enabled) {
      state = CircuitBreakerState.CLOSED;
      guard = buildGuard();
    }
  }

  private FaultTolerance<Object> buildGuard() {
    return FaultTolerance.<Object>create()
        .withDescription("mongo")
        .withCircuitBreaker()
            .requestVolumeThreshold(requestVolumeThreshold)
            .failureRatio(failureRatio)
            .delay(delay.toMillis(), ChronoUnit.MILLIS)
            .successThreshold(successThreshold)
            .when(t -> MongoUnavailable.find(t).isPresent())
            .onStateChange(this::onStateChange)
            .done()
        .build();
  }

  private void onStateChange(CircuitBreakerState newState) {
    state = newState;
    // One line per transition, not per rejected call. Grep/alert key.
    LOG.warnf("MONGO_CIRCUIT_BREAKER state=%s", newState);
  }
}
