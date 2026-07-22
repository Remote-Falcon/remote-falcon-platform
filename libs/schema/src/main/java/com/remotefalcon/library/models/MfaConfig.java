package com.remotefalcon.library.models;

import com.remotefalcon.library.enums.MfaMethod;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

// 2FA PRD §6.1 — per-account second-factor state. Deliberately NOT annotated
// @Type: this model must never surface in any GraphQL schema (the quarkus
// Show field is @Ignore and the control-panel schema exposes only a derived
// mfaEnabled boolean). `secret` holds AES-GCM ciphertext (never raw base32)
// and `recoveryCodes` holds bcrypt hashes, so even non-GraphQL serialization
// paths (archives, admin JSON) only ever see non-recoverable material.
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MfaConfig {
    private Boolean enabled;
    private MfaMethod method;
    private String secret;
    private List<String> recoveryCodes;
    private LocalDateTime enrolledDate;
    private LocalDateTime pendingSince;
    // Highest TOTP time-step counter already accepted for this account.
    // A code only verifies at a step strictly greater than this, so a
    // captured code cannot be replayed inside its 30s validity window.
    private Long lastUsedTimeStep;
    // 2FA SR-3 — brute-force throttle, persisted (not in-JVM) so the cap
    // holds across control-panel replicas and survives restarts. Count of
    // consecutive failed verifications within the current window, and the
    // window's start. Cleared on any success.
    private Integer failedAttempts;
    private LocalDateTime failedWindowStart;
}
