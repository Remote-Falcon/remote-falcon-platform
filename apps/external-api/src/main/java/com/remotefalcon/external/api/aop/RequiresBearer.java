package com.remotefalcon.external.api.aop;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a controller method as requiring a valid RF Page Builder session
 * bearer. Enforced at runtime by {@link BearerAspect}.
 *
 * <p>Distinct from the legacy {@code @RequiresAccess} annotation (which
 * gates the original {@code /showDetails}, {@code /addSequenceToQueue},
 * {@code /voteForSequence} endpoints behind the {@code apiAccess} JWT
 * model). The two never coexist on the same endpoint — that would
 * double-auth and is enforced by convention (no machinery prevents it,
 * just don't do it). A future lint check could enforce; not in v1.
 *
 * @see BearerAspect for the resolution + ThreadLocal cleanup contract
 * @see com.remotefalcon.external.api.dto.SessionContext for what the
 *      aspect deposits on the current thread
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresBearer {

    /**
     * Required OAuth-style scope. If empty (default), any valid bearer is
     * accepted; if non-empty, the bearer's scope set must contain this
     * exact string.
     *
     * <p>Typical values: {@code "viewer_page:read"}, {@code "viewer_page:
     * write"}. Defined by control-panel's launch-token mint (PR-B M2);
     * scope semantics are caller-driven, the aspect just does exact
     * string match.
     */
    String scope() default "";
}
