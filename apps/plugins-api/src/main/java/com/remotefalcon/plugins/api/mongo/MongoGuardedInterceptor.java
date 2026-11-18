package com.remotefalcon.plugins.api.mongo;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;

/**
 * Sends each {@link MongoGuarded} call through the shared Mongo circuit
 * breaker. A pass-through when the breaker is disabled.
 *
 * <p>Two kinds of call skip the breaker so each logical Mongo operation is
 * recorded once:
 * <ul>
 *   <li>Panache's own inherited methods ({@code mongoCollection()},
 *       {@code find()}, {@code persist()}...). A repository method calls
 *       {@code mongoCollection()} before every query, and that call always
 *       succeeds, so counting it would halve the failure ratio the breaker
 *       sees.</li>
 *   <li>Guarded calls made from inside another guarded call on the same
 *       thread. The outer call already records the outcome.</li>
 * </ul>
 */
@MongoGuarded
@Interceptor
@Priority(Interceptor.Priority.APPLICATION + 10)
public class MongoGuardedInterceptor {

  private static final ThreadLocal<Boolean> INSIDE = new ThreadLocal<>();

  @Inject
  MongoCircuitBreaker breaker;

  @AroundInvoke
  Object guard(InvocationContext context) throws Exception {
    if (!breaker.isEnabled()
        || INSIDE.get() != null
        || context.getMethod().getDeclaringClass().getName().startsWith("io.quarkus.")) {
      return context.proceed();
    }
    INSIDE.set(Boolean.TRUE);
    try {
      return breaker.call(context::proceed);
    } finally {
      INSIDE.remove();
    }
  }
}
