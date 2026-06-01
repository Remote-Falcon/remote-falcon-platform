export const Environments = {
  LOCAL: 'local',
  TEST: 'test',
  PROD: 'prod'
};

export const ViewerControlMode = {
  JUKEBOX: 'JUKEBOX',
  VOTING: 'VOTING'
};

export const LocationCheckMethod = {
  GEO: 'GEO',
  CODE: 'CODE',
  NONE: 'NONE'
};

export const StatusResponse = {
  SHOW_EXISTS: 'SHOW_EXISTS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  EMAIL_CANNOT_BE_SENT: 'EMAIL_CANNOT_BE_SENT',
  SHOW_NOT_FOUND: 'SHOW_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_JWT: 'INVALID_JWT',
  API_ACCESS_REQUESTED: 'API_ACCESS_REQUESTED',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
  OWNER_REQUESTED: 'OWNER_REQUESTED',
  // PSA-v2 PR-5 — raised by updatePsaEnabled / setNextPsaOverride
  // when the name doesn't match any PSA in Show.psaSequences[].
  INVALID_PSA_NAME: 'INVALID_PSA_NAME'
};
