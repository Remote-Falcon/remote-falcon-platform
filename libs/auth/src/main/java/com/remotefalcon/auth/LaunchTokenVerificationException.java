package com.remotefalcon.auth;

/**
 * Thrown by {@link LaunchTokenVerifier#verify(String)} when the launch
 * JWT fails any check: signature mismatch, expired, wrong issuer/audience,
 * malformed payload, or missing/invalid claim shape.
 *
 * <p>Unchecked — the verifier is meant to be called at the edge of
 * external-api's session-exchange endpoint, which translates this into
 * an HTTP 401. Callers within control-panel never verify (they only mint).
 */
public class LaunchTokenVerificationException extends RuntimeException {

    public LaunchTokenVerificationException(String message) {
        super(message);
    }

    public LaunchTokenVerificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
