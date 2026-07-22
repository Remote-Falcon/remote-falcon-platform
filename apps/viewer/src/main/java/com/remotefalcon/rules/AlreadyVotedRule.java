package com.remotefalcon.rules;

import com.remotefalcon.library.enums.StatusResponse;
import org.apache.commons.collections.CollectionUtils;
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
    // Null-guard the votes array (fresh/empty show → nobody has voted) and
    // skip votes whose viewersVoted is null. System-injected votes (PSA /
    // leader / Q7 override) are built with a vote count but no viewersVoted
    // list (plugins-api .votes(2000).build()), so a raw contains() NPEs and
    // surfaces as UNEXPECTED_ERROR. Such votes have no human voters → they
    // can't match this IP, so they're correctly treated as not-already-voted.
    if (CollectionUtils.isEmpty(ctx.show().getVotes())) {
      return Decision.allow();
    }
    boolean alreadyVoted = ctx.show().getVotes().stream()
        .filter(vote -> vote.getViewersVoted() != null)
        .anyMatch(vote -> vote.getViewersVoted().contains(ctx.ip()));
    return alreadyVoted ? Decision.deny(StatusResponse.ALREADY_VOTED.name()) : Decision.allow();
  }
}
