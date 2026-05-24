package com.remotefalcon.external.api.aop;

import com.remotefalcon.external.api.util.AuthUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Aspect
@Component
public class AccessAspect {
  @Autowired
  private AuthUtil authUtil;

  @Around("@annotation(com.remotefalcon.external.api.aop.RequiresAccess)")
  public Object isApiJwtValid(ProceedingJoinPoint proceedingJoinPoint) throws Throwable {
    HttpServletRequest request = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
    try {
      if(this.authUtil.isApiJwtValid(request)) {
        return proceedingJoinPoint.proceed();
      }
      return ResponseEntity.status(401).build();
    } finally {
      // AuthUtil stashes the resolved showToken in a ThreadLocal. Tomcat
      // reuses servlet threads from a pool — without this remove(), the
      // next request landing on the same thread would see the previous
      // request's showToken, re-introducing the cross-tenant leak the
      // ThreadLocal was added to close.
      this.authUtil.clearShowToken();
    }
  }
}
