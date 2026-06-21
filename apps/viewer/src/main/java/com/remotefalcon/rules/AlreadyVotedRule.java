package com.remotefalcon.rules;

import com.remotefalcon.library.enums.StatusResponse;
import org.apache.commons.lang3.BooleanUtils;

/**
 * When {@code checkIfVoted} is enabled, denies a repeat vote from an IP that has
 * already voted for any sequence/group this show. Voting-exempt IPs (#156, e.g.
 * a lawn kiosk) are skipped.
 */
public final class AlreadyVotedRule implements Rule {
  @Override
  public Decision evaluate(EvaluationContext ctx) {
    if (ctx.votingExempt()) {
      return Decision.skip();
    }
    if (!BooleanUtils.isTrue(ctx.show().getPreferences().getCheckIfVoted())) {
      return Decision.skip();
    }
    boolean alreadyVoted = ctx.show().getVotes().stream()
        .anyMatch(vote -> vote.getViewersVoted().contains(ctx.ip()));
    return alreadyVoted ? Decision.deny(StatusResponse.ALREADY_VOTED.name()) : Decision.allow();
  }
}
