package com.remotefalcon.controlpanel.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

// 2FA PRD FR-4 — plaintext recovery codes, returned exactly once at
// enrollment confirmation (or regeneration). Server persists bcrypt
// hashes only; there is no retrieval path.
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MfaRecoveryCodes {
    private List<String> recoveryCodes;
}
