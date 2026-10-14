package com.remotefalcon.mongo;

import jakarta.interceptor.InterceptorBinding;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Converts transient Mongo failures thrown from the annotated GraphQL API into
 * a typed {@code SERVICE_UNAVAILABLE} GraphQL error. See
 * {@link MongoFailFastInterceptor}.
 */
@InterceptorBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface MongoFailFast {
}
