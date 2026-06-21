package com.remotefalcon.rules;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RuleChainTest {

  private static final EvaluationContext ANY = new EvaluationContext(null, "ip", null, null, null);

  @Test
  void firstDenial_returnsTheFirstDenyingRule() {
    Decision result = RuleChain.firstDenial(
        List.of(ctx -> Decision.allow(), ctx -> Decision.deny("B"), ctx -> Decision.deny("C")),
        ANY);

    assertTrue(result.denied());
    assertEquals("B", result.reason());
  }

  @Test
  void firstDenial_allowsWhenNoRuleDenies() {
    Decision result = RuleChain.firstDenial(
        List.of(ctx -> Decision.allow(), ctx -> Decision.skip()),
        ANY);

    assertFalse(result.denied());
  }

  @Test
  void firstDenial_skipDoesNotShortCircuit() {
    Decision result = RuleChain.firstDenial(
        List.of(ctx -> Decision.skip(), ctx -> Decision.deny("X")),
        ANY);

    assertTrue(result.denied());
    assertEquals("X", result.reason());
  }

  @Test
  void firstDenial_emptyChainAllows() {
    assertFalse(RuleChain.firstDenial(List.of(), ANY).denied());
  }
}
