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
  // #73 — the named sequence is temporarily unavailable: on the hide-after-play
  // cooldown (visibilityCount > 0) or at its #163 nightly play cap. The viewer
  // page grays these out; this is the server-side guard for clients that don't.
  SEQUENCE_UNAVAILABLE,
  ALREADY_VOTED,
  DAILY_VOTE_LIMIT_REACHED,
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
