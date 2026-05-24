package com.remotefalcon.external.api.dto;

import lombok.Builder;
import lombok.Value;

import java.util.List;

/**
 * Per-request session context resolved from a bearer token at the AOP
 * boundary. Held on a {@link ThreadLocal} via {@link SessionContextHolder}
 * for the duration of the request; cleared in a finally block by the
 * BearerAspect.
 *
 * <p>Immutable — no state mutation after the aspect resolves it. Pattern
 * mirrors the {@code AuthUtil} ThreadLocal fix from
 * remote-falcon-issue-tracker#149.
 */
@Value
@Builder
public class SessionContext {
    String showSubdomain;
    String showToken;
    String pageId;
    List<String> scopes;
}
