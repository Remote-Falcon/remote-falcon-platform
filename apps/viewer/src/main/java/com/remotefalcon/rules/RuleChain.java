package com.remotefalcon.rules;

import java.util.List;

/**
 * Runs enforcement rules in order and returns the first {@code DENY}, or
 * {@code ALLOW} if none denies (PRD-009, ADR-4). The order of the supplied list
 * is the canonical evaluation order.
 */
public final class RuleChain {
  private RuleChain() {
  }

  public static Decision firstDenial(List<Rule> rules, EvaluationContext ctx) {
    for (Rule rule : rules) {
      Decision decision = rule.evaluate(ctx);
      if (decision.denied()) {
        return decision;
      }
    }
    return Decision.allow();
  }
}
