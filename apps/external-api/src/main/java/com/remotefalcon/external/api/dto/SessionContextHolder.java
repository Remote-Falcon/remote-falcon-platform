package com.remotefalcon.external.api.dto;

/**
 * Per-thread holder for the current request's resolved {@link
 * SessionContext}. Set by {@code BearerAspect} on a successful auth pass,
 * read by downstream services on the same request thread, cleared by the
 * aspect in a {@code finally} block.
 *
 * <p>This is the post-#149 ThreadLocal pattern — never store per-request
 * state as a mutable instance field on a Spring singleton service. Tomcat
 * thread pool reuse turns that into a cross-tenant leak. The aspect's
 * finally-cleanup is the only way to guarantee the value can't outlive
 * the request.
 */
public final class SessionContextHolder {

    private static final ThreadLocal<SessionContext> CURRENT = new ThreadLocal<>();

    private SessionContextHolder() {
    }

    public static void set(SessionContext context) {
        CURRENT.set(context);
    }

    public static SessionContext get() {
        return CURRENT.get();
    }

    /**
     * Must be called by the aspect in a {@code finally} block at the end
     * of every advised request. Without this, Tomcat's thread pool would
     * carry the value into the next request handled by the same thread.
     */
    public static void clear() {
        CURRENT.remove();
    }
}
