package com.remotefalcon.controlpanel.util;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTCreationException;
import com.auth0.jwt.exceptions.JWTDecodeException;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.controlpanel.dto.TokenDTO;
import com.remotefalcon.controlpanel.exception.InvalidJwtException;
import com.remotefalcon.library.enums.ShowRole;
import com.remotefalcon.library.enums.StatusResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.time.ZonedDateTime;
import java.util.*;

@Service
@Slf4j
@RequiredArgsConstructor
public class AuthUtil {
  @Value("${jwt.user}")
  String jwtSignKey;

  @Value("${mfa.pending-token-minutes:5}")
  Integer mfaPendingTokenMinutes;

  // 2FA PRD §8.1 — claim marking a token as an MFA-pending challenge.
  // Such a token authorizes ONLY the verifyMfa step; isJwtValid and
  // isAdminJwtValid reject it outright so it can never be replayed
  // against @RequiresAccess/@RequiresAdminAccess resolvers.
  private static final String MFA_PENDING_CLAIM = "mfa-pending";

  private final ThreadLocal<TokenDTO> tokenHolder = new ThreadLocal<>();

  public String signJwt(Show show) {
    Map<String, Object> jwtPayload = new HashMap<String, Object>();
    jwtPayload.put("showToken", show.getShowToken());
    jwtPayload.put("email", show.getEmail());
    jwtPayload.put("showSubdomain", show.getShowSubdomain());
    jwtPayload.put("showRole", show.getShowRole().name());
    try {
      Algorithm algorithm = Algorithm.HMAC256(jwtSignKey);
      return JWT.create().withClaim("user-data", jwtPayload)
              .withIssuer("remotefalcon")
              .withExpiresAt(Date.from(ZonedDateTime.now().plusDays(30).toInstant()))
              .sign(algorithm);
    } catch (JWTCreationException e) {
      log.error("Error creating JWT", e);
      return null;
    }
  }

  // 2FA PRD §8.1 — short-lived challenge token minted by signIn for
  // enrolled accounts instead of the 30-day service token. Carries only
  // showToken (no user-data authorization payload).
  public String signMfaPendingJwt(Show show) {
    try {
      Algorithm algorithm = Algorithm.HMAC256(jwtSignKey);
      return JWT.create()
              .withClaim(MFA_PENDING_CLAIM, true)
              .withClaim("showToken", show.getShowToken())
              .withIssuer("remotefalcon")
              .withExpiresAt(Date.from(ZonedDateTime.now().plusMinutes(mfaPendingTokenMinutes).toInstant()))
              .sign(algorithm);
    } catch (JWTCreationException e) {
      log.error("Error creating MFA pending JWT", e);
      return null;
    }
  }

  /**
   * Validates the Bearer token as an MFA-pending challenge and returns its
   * showToken. Throws MFA_CHALLENGE_EXPIRED (a GraphQL-surfaced status, not
   * InvalidJwtException/401) for anything invalid or expired so the UI can
   * route the user back to the password step.
   */
  public String validateMfaPendingToken(HttpServletRequest httpServletRequest) {
    try {
      String token = this.getTokenFromRequest(httpServletRequest);
      if (StringUtils.isEmpty(token)) {
        throw new RuntimeException(StatusResponse.MFA_CHALLENGE_EXPIRED.name());
      }
      Algorithm algorithm = Algorithm.HMAC256(jwtSignKey);
      JWTVerifier verifier = JWT.require(algorithm).withIssuer("remotefalcon").build();
      DecodedJWT decodedJWT = verifier.verify(token);
      if (!Boolean.TRUE.equals(decodedJWT.getClaim(MFA_PENDING_CLAIM).asBoolean())) {
        throw new RuntimeException(StatusResponse.MFA_CHALLENGE_EXPIRED.name());
      }
      String showToken = decodedJWT.getClaim("showToken").asString();
      if (StringUtils.isEmpty(showToken)) {
        throw new RuntimeException(StatusResponse.MFA_CHALLENGE_EXPIRED.name());
      }
      return showToken;
    } catch (JWTVerificationException | InvalidJwtException e) {
      throw new RuntimeException(StatusResponse.MFA_CHALLENGE_EXPIRED.name());
    }
  }

  public HttpServletRequest getCurrentRequest() {
    return ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
  }

  public TokenDTO getJwtPayload() {
    HttpServletRequest request = getCurrentRequest();
    String token = this.getTokenFromRequest(request);
    try {
      DecodedJWT decodedJWT = JWT.decode(token);
      Map<String, Object> userDataMap = decodedJWT.getClaim("user-data").asMap();
      TokenDTO tokenDTO = TokenDTO.builder()
              .showToken((String) userDataMap.get("showToken"))
              .email((String) userDataMap.get("email"))
              .showSubdomain((String) userDataMap.get("showSubdomain"))
              .showRole(ShowRole.valueOf((String) userDataMap.get("showRole")))
              .token(token)
              .build();
      return setTokenDTO(tokenDTO);
    }catch (JWTDecodeException jde) {
      throw new InvalidJwtException();
    }
  }

  public Boolean isJwtValid(HttpServletRequest httpServletRequest) throws JWTVerificationException {
    try {
      String token = this.getTokenFromRequest(httpServletRequest);
      if (StringUtils.isEmpty(token)) {
        throw new InvalidJwtException();
      }
      Algorithm algorithm = Algorithm.HMAC256(jwtSignKey);
      JWTVerifier verifier = JWT.require(algorithm).withIssuer("remotefalcon").build();
      DecodedJWT decodedJWT = verifier.verify(token);
      // 2FA PRD §8.2 — an MFA-pending challenge token must never pass as
      // a session token, or the second factor could be skipped entirely.
      if (Boolean.TRUE.equals(decodedJWT.getClaim(MFA_PENDING_CLAIM).asBoolean())) {
        throw new InvalidJwtException();
      }
      setTokenDTO(getJwtPayload());
      return true;
    } catch (JWTVerificationException e) {
      throw new InvalidJwtException();
    }
  }

  public Boolean isAdminJwtValid(HttpServletRequest httpServletRequest) throws JWTVerificationException {
    try {
      String token = this.getTokenFromRequest(httpServletRequest);
      if (StringUtils.isEmpty(token)) {
        throw new InvalidJwtException();
      }
      Algorithm algorithm = Algorithm.HMAC256(jwtSignKey);
      JWTVerifier verifier = JWT.require(algorithm).withIssuer("remotefalcon").build();
      DecodedJWT decodedJWT = verifier.verify(token);
      // 2FA PRD §8.2 — same pending-token rejection as isJwtValid.
      if (Boolean.TRUE.equals(decodedJWT.getClaim(MFA_PENDING_CLAIM).asBoolean())) {
        throw new InvalidJwtException();
      }
      TokenDTO tokenDTO = setTokenDTO(getJwtPayload());
      return tokenDTO.getShowRole() == ShowRole.ADMIN;
    } catch (JWTVerificationException e) {
      throw new InvalidJwtException();
    }
  }

  private String getTokenFromRequest(HttpServletRequest httpServletRequest) {
    String token = "";
    final String authorization = httpServletRequest.getHeader("Authorization");
    if (authorization != null && authorization.toLowerCase().startsWith("bearer")) {
      try {
        token = authorization.split(" ")[1];
      }catch (Exception e) {
        log.error("Error getting token from request");
        throw new InvalidJwtException();
      }
    }
    return token;
  }

  public String[] getBasicAuthCredentials(HttpServletRequest httpServletRequest) {
    final String authorization = httpServletRequest.getHeader("Authorization");
    if (authorization != null && authorization.toLowerCase().startsWith("basic")) {
      String base64Credentials = authorization.substring("Basic".length()).trim();
      byte[] credDecoded = Base64.getDecoder().decode(base64Credentials);
      String credentials = new String(credDecoded, StandardCharsets.UTF_8);
      return credentials.split(":", 2);
    }
    return null;
  }

  public String getPasswordFromHeader(HttpServletRequest httpServletRequest) {
    final String password = httpServletRequest.getHeader("Password");
    if (password != null) {
      return new String(Base64.getDecoder().decode(password));
    }
    return null;
  }

  public String getUpdatedPasswordFromHeader(HttpServletRequest httpServletRequest) {
    final String password = httpServletRequest.getHeader("NewPassword");
    if (password != null) {
      return new String(Base64.getDecoder().decode(password));
    }
    return null;
  }

  public TokenDTO getTokenDTO() {
    TokenDTO tokenDTO = tokenHolder.get();
    if(tokenDTO == null) {
      throw new InvalidJwtException();
    }
    return tokenDTO;
  }

  public TokenDTO setTokenDTO(TokenDTO tokenDTO) {
    tokenHolder.set(tokenDTO);
    return tokenDTO;
  }

  public void clearTokenDTO() {
    tokenHolder.remove();
  }
}
