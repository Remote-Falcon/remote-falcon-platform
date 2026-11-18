package com.remotefalcon.plugins.api.mongo;

import jakarta.interceptor.InterceptorBinding;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Routes the annotated bean's methods through {@link MongoCircuitBreaker}.
 * Put it on classes that talk to Mongo (the repository and PluginService,
 * which writes through {@code Show.mongoCollection()} directly). See
 * {@link MongoGuardedInterceptor}.
 */
@InterceptorBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface MongoGuarded {
}
