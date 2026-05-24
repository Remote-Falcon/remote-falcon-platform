package com.remotefalcon.external.api.util;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.Claim;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.remotefalcon.external.api.repository.ShowRepository;
import com.remotefalcon.library.documents.Show;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Per-request JWT validation for the external API.
 *
 * <p>This is a Spring {@code @Service} — singleton scope, shared by every
 * request thread in the Tomcat pool. The {@code showToken} resolved during
 * {@link #isApiJwtValid(HttpServletRequest)} is consumed later in the same
 * request by {@code ExternalApiService}, so it must be carried on a
 * per-thread channel — a {@link ThreadLocal} — never a plain instance field.
 * A plain field on a singleton bean is shared across requests: request A's
 * auth result would get overwritten by request B before A's downstream call
 * read it, returning B's tenant data to A's caller (cross-tenant leak,
 * issue-tracker #149).
 *
 * <p>The {@link com.remotefalcon.external.api.aop.AccessAspect} is responsible
 * for invoking {@link #clearShowToken()} in a {@code finally} block at the
 * end of every advised request — without that, the value leaks to the next
 * request handled by the same servlet thread (Tomcat reuses threads from a
 * pool).
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AuthUtil {
  private final ShowRepository showRepository;

  /**
   * Per-request show token. Written by {@link #isApiJwtValid} on a successful
   * auth, read by downstream services on the same thread, and cleared by
   * {@link com.remotefalcon.external.api.aop.AccessAspect} in a {@code finally}
   * block. Package-private so the aspect can call {@link #clearShowToken()}.
   */
  private final ThreadLocal<String> showToken = new ThreadLocal<>();

  public Boolean isApiJwtValid(HttpServletRequest httpServletRequest) throws JWTVerificationException {
    try {
      String token = this.getTokenFromRequest(httpServletRequest);
      if (StringUtils.isEmpty(token)) {
        return false;
      }
      DecodedJWT decodedJWT = JWT.decode(token);
      // Defensive null check: a structurally-valid JWT may legitimately omit
      // the accessToken claim (any third-party tool can mint one). Without
      // this, getClaims().get("accessToken") returns null and .asString() NPEs,
      // which surfaces as HTTP 500 — leaking implementation details and
      // failing the "treat anything unauthenticated as 401" contract that
      // AccessAspect enforces.
      Claim accessTokenClaim = decodedJWT.getClaims().get("accessToken");
      if (accessTokenClaim == null || accessTokenClaim.isNull()) {
        return false;
      }
      String accessToken = accessTokenClaim.asString();
      if (StringUtils.isEmpty(accessToken)) {
        return false;
      }
      Optional<Show> show = this.showRepository.findByApiAccessApiAccessToken(accessToken);
      if(show.isEmpty()) {
        return false;
      }
      Algorithm algorithm = Algorithm.HMAC256(show.get().getApiAccess().getApiAccessSecret());
      JWTVerifier verifier = JWT.require(algorithm).build();
      verifier.verify(token);
      this.showToken.set(show.get().getShowToken());
      return true;
    } catch (JWTVerificationException e) {
      return false;
    }
  }

  /**
   * Returns the show token resolved for the current request thread, or
   * {@code null} if {@link #isApiJwtValid} has not stored one on this thread.
   */
  public String getShowToken() {
    return this.showToken.get();
  }

  /**
   * Removes the per-thread show token. Must be called in a {@code finally}
   * block at the end of every request to avoid leaking the value across
   * requests on a reused Tomcat thread.
   */
  public void clearShowToken() {
    this.showToken.remove();
  }

  public String getTokenFromRequest(HttpServletRequest httpServletRequest) {
    String token = "";
    final String authorization = httpServletRequest.getHeader("Authorization");
    if (authorization != null && authorization.toLowerCase().startsWith("bearer")) {
      try {
        token = authorization.split(" ")[1];
      }catch (Exception e) {
        log.error("Error getting token from request");
      }
    }
    return token;
  }
}
