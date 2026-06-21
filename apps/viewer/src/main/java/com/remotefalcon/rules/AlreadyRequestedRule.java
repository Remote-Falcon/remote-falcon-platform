package com.remotefalcon.rules;

import com.remotefalcon.library.enums.StatusResponse;
import org.apache.commons.lang3.BooleanUtils;
import org.apache.commons.lang3.StringUtils;

/**
 * When {@code checkIfRequested} is enabled, denies a repeat request from an IP
 * that already has a request in the queue.
 */
public final class AlreadyRequestedRule implements Rule {
  @Override
  public Decision evaluate(EvaluationContext ctx) {
    if (!BooleanUtils.isTrue(ctx.show().getPreferences().getCheckIfRequested())) {
      return Decision.skip();
    }
    boolean alreadyRequested = ctx.show().getRequests().stream()
        .anyMatch(request -> StringUtils.equalsIgnoreCase(ctx.ip(), request.getViewerRequested()));
    return alreadyRequested ? Decision.deny(StatusResponse.ALREADY_REQUESTED.name()) : Decision.allow();
  }
}
