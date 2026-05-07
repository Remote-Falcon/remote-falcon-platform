package com.remotefalcon.controlpanel.exception;

import com.remotefalcon.library.enums.StatusResponse;

/**
 * Thrown by AccessAspect / AuthUtil when a request's JWT is missing,
 * malformed, expired, signed with the wrong key, or has the wrong issuer.
 * Mapped to HTTP 401 by InvalidJwtExceptionHandler.
 */
public class InvalidJwtException extends RuntimeException {
  public InvalidJwtException() {
    super(StatusResponse.INVALID_JWT.name());
  }
}
