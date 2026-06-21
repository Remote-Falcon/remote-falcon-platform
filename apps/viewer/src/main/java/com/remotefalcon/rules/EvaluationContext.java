package com.remotefalcon.rules;

import com.remotefalcon.library.quarkus.entity.Show;

/**
 * Inputs shared by every vote/request enforcement rule, resolved once per
 * mutation and passed down the chain (PRD-009, ADR-4). {@code viewerId} is
 * carried for the upcoming identity-aware rules (ADR-2); the rules extracted in
 * this change use {@code show} + {@code ip} + geo.
 */
public record EvaluationContext(Show show, String ip, String viewerId, Float latitude, Float longitude) {
}
