package com.remotefalcon.library.enums;

// 2FA PRD §6.1 — v1 ships TOTP only; EMAIL_OTP / WEBAUTHN reserved for
// future methods without a schema change.
public enum MfaMethod {
  TOTP;
}
