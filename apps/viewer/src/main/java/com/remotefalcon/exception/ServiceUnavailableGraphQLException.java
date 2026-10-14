package com.remotefalcon.exception;

import com.remotefalcon.mongo.MongoUnavailable;

import java.util.Map;

/**
 * Typed GraphQL error for "the database is saturated, retry later". Keeps the
 * {@code extensions.message} shape of {@link CustomGraphQLExceptionResolver}
 * and adds {@code retryAfterSeconds} so the viewer page can back off.
 */
public class ServiceUnavailableGraphQLException extends CustomGraphQLExceptionResolver {

  public ServiceUnavailableGraphQLException() {
    super(MongoUnavailable.CODE);
  }

  @Override
  public Map<String, Object> getExtensions() {
    Map<String, Object> extensions = super.getExtensions();
    extensions.put("retryAfterSeconds", MongoUnavailable.RETRY_AFTER_SECONDS);
    return extensions;
  }

  // No stack trace: this is an expected, high-volume condition during a DB
  // stall and the trace would only cost CPU if anything logged it.
  @Override
  public synchronized Throwable fillInStackTrace() {
    return this;
  }
}
