package com.remotefalcon.controlpanel.exception;

import com.remotefalcon.library.enums.StatusResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class InvalidJwtExceptionHandler {

  @ExceptionHandler(InvalidJwtException.class)
  public ResponseEntity<Map<String, String>> handleInvalidJwt(InvalidJwtException ex) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
        .body(Map.of("errorType", StatusResponse.INVALID_JWT.name()));
  }
}
