package com.remotefalcon.library.enums;

public enum StatusResponse {
  SHOW_EXISTS,
  EMAIL_NOT_VERIFIED,
  EMAIL_CANNOT_BE_SENT,
  SHOW_NOT_FOUND,
  UNAUTHORIZED,
  INVALID_JWT,
  API_ACCESS_REQUESTED,
  QUEUE_FULL,
  INVALID_LOCATION,
  SEQUENCE_REQUESTED,
  ALREADY_VOTED,
  ALREADY_REQUESTED,
  OWNER_REQUESTED,
  NAUGHTY,
  PAGE_NOT_FOUND,
  // PSA-v2 PR-5 — setNextPsaOverride / updatePsaEnabled raise this
  // when the named PSA isn't present in Show.psaSequences[]. Surfacing
  // a typed status (rather than UNEXPECTED_ERROR) lets the UI render
  // a useful toast instead of the generic error fallback.
  INVALID_PSA_NAME,
  // 2FA PRD §7/§11 — typed statuses for the TOTP flows so the UI can render
  // specific guidance instead of the generic error fallback.
  INVALID_MFA_CODE,
  MFA_ALREADY_ENABLED,
  MFA_NOT_ENABLED,
  // Raised when MFA_SECRET_KEY isn't configured on the deployment — 2FA is
  // opt-in at the operator level too (self-host installs without the key
  // simply can't enroll; nothing else is affected).
  MFA_NOT_CONFIGURED,
  MFA_RATE_LIMITED,
  // Pending sign-in challenge token expired/invalid — UI returns the user
  // to the password step.
  MFA_CHALLENGE_EXPIRED,
  UNEXPECTED_ERROR;
}
