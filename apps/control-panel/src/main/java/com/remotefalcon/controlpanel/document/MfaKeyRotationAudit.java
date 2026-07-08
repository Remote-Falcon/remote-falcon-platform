package com.remotefalcon.controlpanel.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/**
 * Persistent audit trail for MFA key rotations (2FA-TOTP hardening). One
 * record per {@code adminRotateMfaKeys} invocation — including dry runs — so
 * "who rotated the MFA key, when, and what did it touch" survives beyond the
 * ephemeral pod log. Its own collection; never embedded in a Show.
 *
 * <p>{@link #rotatedAt} is stamped in UTC explicitly (the platform's Mongo
 * storage is de-facto UTC but historically unpinned — don't rely on the
 * server's default zone for a security record).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "mfaKeyRotationAudit")
public class MfaKeyRotationAudit {
    @Id
    private String id;
    private LocalDateTime rotatedAt;
    private String adminEmail;
    // Non-secret fingerprint of the primary key the secrets were rotated onto.
    private String primaryKeyId;
    private int totalSecrets;
    private int reencrypted;
    private int alreadyOnPrimary;
    private int failed;
    private boolean dryRun;
}
