package com.remotefalcon.mongo;

import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.MongoSocketWriteTimeoutException;
import com.mongodb.MongoTimeoutException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

/**
 * REST side of the Mongo fail-fast contract: 503 + {@code Retry-After: 15}
 * and one WARN line instead of a 500 with a stack trace. One mapper per
 * driver type because these exceptions share no narrower common supertype
 * than MongoException, and mapping all of MongoException would also turn
 * genuine bugs (duplicate key, bad query) into retryable 503s.
 */
public final class MongoUnavailableExceptionMappers {

  private MongoUnavailableExceptionMappers() {
  }

  static Response handle(RuntimeException exception) {
    MongoUnavailable.logOnce("rest", exception);
    return MongoUnavailable.response();
  }

  @Provider
  public static class Timeout implements ExceptionMapper<MongoTimeoutException> {
    @Override
    public Response toResponse(MongoTimeoutException exception) {
      return handle(exception);
    }
  }

  @Provider
  public static class SocketReadTimeout implements ExceptionMapper<MongoSocketReadTimeoutException> {
    @Override
    public Response toResponse(MongoSocketReadTimeoutException exception) {
      return handle(exception);
    }
  }

  @Provider
  public static class SocketWriteTimeout implements ExceptionMapper<MongoSocketWriteTimeoutException> {
    @Override
    public Response toResponse(MongoSocketWriteTimeoutException exception) {
      return handle(exception);
    }
  }
}
