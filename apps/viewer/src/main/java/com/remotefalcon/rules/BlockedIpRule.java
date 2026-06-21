package com.remotefalcon.rules;

import com.remotefalcon.library.enums.StatusResponse;
import org.apache.commons.collections.CollectionUtils;

/**
 * Denies a vote/request from an IP on the show's block list (#164).
 * Always active — there is no enable/disable preference.
 */
public final class BlockedIpRule implements Rule {
  @Override
  public Decision evaluate(EvaluationContext ctx) {
    var blockedIps = ctx.show().getPreferences().getBlockedViewerIps();
    if (CollectionUtils.isNotEmpty(blockedIps) && blockedIps.contains(ctx.ip())) {
      return Decision.deny(StatusResponse.NAUGHTY.name());
    }
    return Decision.allow();
  }
}
