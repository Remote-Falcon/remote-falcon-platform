package com.remotefalcon.rules;

import com.remotefalcon.library.enums.StatusResponse;
import com.remotefalcon.library.util.IpMatcher;

/**
 * Denies a vote/request from an IP on the show's block list (#164).
 * Always active — there is no enable/disable preference.
 */
public final class BlockedIpRule implements Rule {
  @Override
  public Decision evaluate(EvaluationContext ctx) {
    // Entries may be single addresses, CIDR blocks or ranges (#175).
    var blockedIps = ctx.show().getPreferences().getBlockedViewerIps();
    if (IpMatcher.matchesAny(blockedIps, ctx.ip())) {
      return Decision.deny(StatusResponse.NAUGHTY.name());
    }
    return Decision.allow();
  }
}
