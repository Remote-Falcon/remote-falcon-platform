package com.remotefalcon.plugins.api.mongo;

import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.MongoSocketWriteTimeoutException;
import com.mongodb.MongoTimeoutException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.util.Map;
import java.util.Optional;

/**
 * Classifies Mongo driver failures that mean "the database is saturated or
 * unreachable right now" (2026-10-12 incident). Those must fail fast as a
 * retryable 503 with one WARN line, not a 500 with a full stack trace: the
 * traces burned pod CPU, which fed the HPA, which added more DB clients.
 *
 * <p>Driver 5.x has no MongoWaitQueueFullException. Pool exhaustion past
 * maxWaitTime surfaces as {@link MongoTimeoutException}, as does server
 * selection timing out.
 */
public final class MongoUnavailable {

  public static final int RETRY_AFTER_SECONDS = 15;
  public static final String CODE = "SERVICE_UNAVAILABLE";

  private static final Logger LOG = Logger.getLogger(MongoUnavailable.class);
  private static final int MAX_CAUSE_DEPTH = 10;
  private static final int MAX_MESSAGE_LENGTH = 160;

  private MongoUnavailable() {
  }

  /** The transient Mongo failure in {@code t}'s cause chain, if any. */
  public static Optional<RuntimeException> find(Throwable t) {
    Throwable current = t;
    for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
      if (current instanceof MongoTimeoutException
          || current instanceof MongoSocketReadTimeoutException
          || current instanceof MongoSocketWriteTimeoutException) {
        return Optional.of((RuntimeException) current);
      }
      current = current.getCause();
    }
    return Optional.empty();
  }

  /** One WARN line, no stack trace. Grep/alert key: {@code MONGO_UNAVAILABLE}. */
  public static void logOnce(String where, Throwable mongoFailure) {
    LOG.warnf("MONGO_UNAVAILABLE where=%s exception=%s msg=%s",
        where, mongoFailure.getClass().getSimpleName(), shortMessage(mongoFailure));
  }

  /** 503 + Retry-After, JSON body shared by every REST mapper. */
  public static Response response() {
    return Response.status(Response.Status.SERVICE_UNAVAILABLE)
        .header("Retry-After", String.valueOf(RETRY_AFTER_SECONDS))
        .type(MediaType.APPLICATION_JSON_TYPE)
        .entity(Map.of("message", CODE, "retryAfterSeconds", RETRY_AFTER_SECONDS))
        .build();
  }

  static String shortMessage(Throwable t) {
    String message = t.getMessage();
    if (message == null) {
      return "";
    }
    // The driver's timeout message embeds the whole cluster description on one
    // line; the first sentence is enough to tell selection from pool wait.
    String flat = message.replace('\n', ' ');
    return flat.length() > MAX_MESSAGE_LENGTH ? flat.substring(0, MAX_MESSAGE_LENGTH) + "..." : flat;
  }
}
