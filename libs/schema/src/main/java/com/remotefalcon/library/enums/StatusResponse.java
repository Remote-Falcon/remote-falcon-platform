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
  UNEXPECTED_ERROR;
}
