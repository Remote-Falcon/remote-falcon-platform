package com.remotefalcon.rules;

import com.remotefalcon.library.enums.StatusResponse;

/**
 * Denies a vote once the voter has reached the per-day cap (#162, ADR-2/ADR-5).
 *
 * <p>Stays pure: the count ({@link EvaluationContext#votesInWindow()}) is
 * computed by the service from the voteEvent collection — keyed viewerId-first /
 * IP-backstop per ADR-2, over the current show session (since
 * {@code Preference.votingWindowStartedAt}) — and supplied via the context only
 * when {@code dailyVoteLimit} is configured. Skips when no limit is set or no
 * count was supplied.
 */
public final class DailyVoteLimitRule implements Rule {
  @Override
  public Decision evaluate(EvaluationContext ctx) {
    if (ctx.votingExempt()) {
      return Decision.skip();
    }
    Integer limit = ctx.show().getPreferences().getDailyVoteLimit();
    if (limit == null || limit == 0 || ctx.votesInWindow() == null) {
      return Decision.skip();
    }
    return ctx.votesInWindow() >= limit
        ? Decision.deny(StatusResponse.DAILY_VOTE_LIMIT_REACHED.name())
        : Decision.allow();
  }
}
