package com.remotefalcon.rules;

/**
 * A single vote/request enforcement rule (PRD-009, ADR-4). Pure over its
 * {@link EvaluationContext} — no I/O — so each rule is unit-testable in
 * isolation.
 */
@FunctionalInterface
public interface Rule {
  Decision evaluate(EvaluationContext ctx);
}
