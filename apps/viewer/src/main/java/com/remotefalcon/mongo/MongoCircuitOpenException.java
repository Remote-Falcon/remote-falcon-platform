package com.remotefalcon.mongo;

import com.mongodb.MongoTimeoutException;

/**
 * Thrown instead of calling Mongo while {@link MongoCircuitBreaker} is open.
 *
 * <p>Extends {@link MongoTimeoutException} on purpose: every existing
 * fail-fast path (the REST 503 + Retry-After mapper, the GraphQL
 * SERVICE_UNAVAILABLE interceptor, {@link MongoUnavailable#find}, and the
 * viewer's serve-stale fallback) already treats that type as "the database is
 * unavailable right now", so an open breaker answers exactly like a stalled
 * database does, only without waiting for the driver timeout first.
 */
public class MongoCircuitOpenException extends MongoTimeoutException {

  public MongoCircuitOpenException() {
    super("Mongo circuit breaker is open");
  }

  // No stack trace: while the breaker is open this is thrown on every call.
  @Override
  public synchronized Throwable fillInStackTrace() {
    return this;
  }
}
