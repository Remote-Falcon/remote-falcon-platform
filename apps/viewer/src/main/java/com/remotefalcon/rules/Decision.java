package com.remotefalcon.rules;

/**
 * Outcome of a single enforcement rule (PRD-009, ADR-4).
 *
 * <p>{@code ALLOW} and {@code SKIP} both let the chain continue ({@code SKIP}
 * signals a rule that isn't enabled for this show); {@code DENY} carries the
 * {@code StatusResponse} reason used for the rejection and short-circuits.
 */
public final class Decision {
  public enum Outcome { ALLOW, SKIP, DENY }

  private final Outcome outcome;
  private final String reason;

  private Decision(Outcome outcome, String reason) {
    this.outcome = outcome;
    this.reason = reason;
  }

  public static Decision allow() {
    return new Decision(Outcome.ALLOW, null);
  }

  public static Decision skip() {
    return new Decision(Outcome.SKIP, null);
  }

  public static Decision deny(String reason) {
    return new Decision(Outcome.DENY, reason);
  }

  public boolean denied() {
    return outcome == Outcome.DENY;
  }

  public Outcome outcome() {
    return outcome;
  }

  /** The {@code StatusResponse} name when denied, otherwise {@code null}. */
  public String reason() {
    return reason;
  }
}
