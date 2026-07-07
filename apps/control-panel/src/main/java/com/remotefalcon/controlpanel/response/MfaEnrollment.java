package com.remotefalcon.controlpanel.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// 2FA PRD §7.3 — provisioning data returned by startMfaEnrollment. The
// base32 secret appears here (QR + manual entry) and NOWHERE else; once
// enrollment is confirmed only the AES-GCM ciphertext exists server-side.
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MfaEnrollment {
    private String otpauthUri;
    private String secret;
}
