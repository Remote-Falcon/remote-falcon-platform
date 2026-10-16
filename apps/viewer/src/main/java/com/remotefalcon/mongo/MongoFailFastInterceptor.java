package com.remotefalcon.mongo;

import com.remotefalcon.exception.ServiceUnavailableGraphQLException;
import jakarta.annotation.Priority;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;

import java.util.Optional;

/**
 * GraphQL side of the Mongo fail-fast contract. SmallRye GraphQL answers HTTP
 * 200 for resolver errors and hides unchecked exceptions as "System error"
 * (logging the full trace), so a JAX-RS ExceptionMapper can't reach it and the
 * page couldn't tell "DB saturated, back off" from a real bug. This turns a
 * transient Mongo failure into {@code errors[0].extensions.message ==
 * "SERVICE_UNAVAILABLE"} plus {@code extensions.retryAfterSeconds == 15}, the
 * same field the page already reads for QUEUE_FULL and friends, and logs one
 * WARN line instead of a stack trace.
 */
@MongoFailFast
@Interceptor
@Priority(Interceptor.Priority.APPLICATION)
public class MongoFailFastInterceptor {

  @AroundInvoke
  Object failFast(InvocationContext context) throws Exception {
    try {
      return context.proceed();
    } catch (Exception e) {
      Optional<RuntimeException> mongoFailure = MongoUnavailable.find(e);
      if (mongoFailure.isEmpty()) {
        throw e;
      }
      MongoUnavailable.logOnce("graphql:" + context.getMethod().getName(), mongoFailure.get());
      throw new ServiceUnavailableGraphQLException();
    }
  }
}
