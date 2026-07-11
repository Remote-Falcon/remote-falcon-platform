package com.remotefalcon.controlpanel.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// 2FA-TOTP hardening — outcome of an adminRotateMfaKeys run. reencrypted +
// alreadyOnPrimary + failed == totalSecrets. On a dryRun nothing is written;
// reencrypted then reports how many WOULD be rotated.
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MfaKeyRotationResult {
    private int totalSecrets;
    private int reencrypted;
    private int alreadyOnPrimary;
    private int failed;
    private boolean dryRun;
}
